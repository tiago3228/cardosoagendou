-- Phase 3: provider-agnostic WhatsApp outbox and appointment management.
-- Additive migration. A separate worker/provider is responsible for delivery.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS whatsapp_notifications_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reminder_minutes integer NOT NULL DEFAULT 60
    CHECK (reminder_minutes BETWEEN 15 AND 10080);

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS manage_token_hash text,
  ADD COLUMN IF NOT EXISTS manage_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS presence_status text
    CHECK (presence_status IS NULL OR presence_status IN ('CONFIRMED','DECLINED')),
  ADD COLUMN IF NOT EXISTS rescheduled_from_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS appointments_manage_token_hash_unique
  ON public.appointments (manage_token_hash)
  WHERE manage_token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.message_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'whatsapp' CHECK (channel = 'whatsapp'),
  event_type text NOT NULL CHECK (event_type IN ('APPOINTMENT_CONFIRMED','APPOINTMENT_REMINDER','CLIENT_CONFIRMED','CLIENT_CANCELED','APPOINTMENT_RESCHEDULED')),
  recipient text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','sent','failed','canceled')),
  provider text NOT NULL DEFAULT 'unconfigured',
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS message_outbox_due_idx
  ON public.message_outbox (status, available_at)
  WHERE status IN ('queued','failed');
CREATE INDEX IF NOT EXISTS message_outbox_business_idx
  ON public.message_outbox (business_id, created_at DESC);

GRANT SELECT ON public.message_outbox TO authenticated;
GRANT ALL ON public.message_outbox TO service_role;
ALTER TABLE public.message_outbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS message_outbox_member_read ON public.message_outbox;
CREATE POLICY message_outbox_member_read ON public.message_outbox FOR SELECT TO authenticated
  USING (public.is_business_member(auth.uid(), business_id));

CREATE OR REPLACE FUNCTION public.enqueue_message(
  _business_id uuid,
  _appointment_id uuid,
  _event_type text,
  _recipient text,
  _payload jsonb,
  _dedupe_key text,
  _available_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE message_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_business_member(auth.uid(), _business_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: sem acesso a este negócio';
  END IF;
  INSERT INTO public.message_outbox (
    business_id, appointment_id, event_type, recipient, payload, dedupe_key, available_at
  ) VALUES (
    _business_id, _appointment_id, _event_type, _recipient, COALESCE(_payload, '{}'::jsonb), _dedupe_key, COALESCE(_available_at, now())
  )
  ON CONFLICT (business_id, dedupe_key) DO NOTHING
  RETURNING id INTO message_id;
  RETURN message_id;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_message(uuid, uuid, text, text, jsonb, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_message(uuid, uuid, text, text, jsonb, text, timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enqueue_due_appointment_reminders()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE total integer;
BEGIN
  WITH due AS (
    INSERT INTO public.message_outbox (business_id, appointment_id, event_type, recipient, payload, dedupe_key)
    SELECT a.business_id, a.id, 'APPOINTMENT_REMINDER', a.client_whatsapp,
      jsonb_build_object('appointment_id', a.id, 'starts_at', a.starts_at, 'client_name', a.client_name),
      'reminder:' || a.id::text
    FROM public.appointments a
    JOIN public.businesses b ON b.id = a.business_id
    WHERE a.status = 'CONFIRMED'
      AND b.whatsapp_notifications_enabled
      AND b.reminder_enabled
      AND a.starts_at > now()
      AND a.starts_at <= now() + make_interval(mins => b.reminder_minutes)
      AND a.starts_at > now() + interval '5 minutes'
    ON CONFLICT (business_id, dedupe_key) DO NOTHING
    RETURNING id
  ) SELECT count(*) INTO total FROM due;
  RETURN total;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_due_appointment_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_due_appointment_reminders() TO service_role;

CREATE OR REPLACE FUNCTION public.appointment_manage_by_token(_token_hash text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', a.id, 'business_id', a.business_id, 'business_name', b.name,
    'client_name', a.client_name, 'starts_at', a.starts_at, 'ends_at', a.ends_at,
    'status', a.status, 'presence_status', a.presence_status,
    'professional_id', a.professional_id,
    'policy', b.booking_policy,
    'allow_cancel', a.starts_at > now() + interval '1 hour',
    'allow_reschedule', a.starts_at > now() + interval '2 hours'
  )
  FROM public.appointments a JOIN public.businesses b ON b.id = a.business_id
  WHERE a.manage_token_hash = _token_hash
    AND (a.manage_token_expires_at IS NULL OR a.manage_token_expires_at > now());
$$;
GRANT EXECUTE ON FUNCTION public.appointment_manage_by_token(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.appointment_presence_by_token(_token_hash text, _presence text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE row_data record;
BEGIN
  SELECT * INTO row_data FROM public.appointments
   WHERE manage_token_hash = _token_hash
     AND (manage_token_expires_at IS NULL OR manage_token_expires_at > now())
   FOR UPDATE;
  IF row_data.id IS NULL THEN RAISE EXCEPTION 'MANAGE_LINK_INVALID'; END IF;
  IF row_data.status NOT IN ('CONFIRMED','IN_PROGRESS') THEN RAISE EXCEPTION 'APPOINTMENT_NOT_CONFIRMABLE'; END IF;
  IF _presence NOT IN ('CONFIRMED','DECLINED') THEN RAISE EXCEPTION 'PRESENCE_INVALID'; END IF;
  UPDATE public.appointments SET presence_status = _presence WHERE id = row_data.id;
  PERFORM public.enqueue_message(row_data.business_id, row_data.id, 'CLIENT_CONFIRMED', row_data.client_whatsapp,
    jsonb_build_object('appointment_id', row_data.id, 'presence_status', _presence),
    'presence:' || row_data.id::text || ':' || _presence);
  RETURN jsonb_build_object('id', row_data.id, 'presence_status', _presence);
END;
$$;
GRANT EXECUTE ON FUNCTION public.appointment_presence_by_token(text, text) TO anon, authenticated, service_role;
