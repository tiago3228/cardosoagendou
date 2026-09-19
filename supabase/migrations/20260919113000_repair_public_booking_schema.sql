-- Reparo seguro para bases que receberam apenas parte das migrations de booking.
-- Não apaga nem altera agendamentos existentes.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS blocks_agenda boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS policy_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS policy_text_snapshot text,
  ADD COLUMN IF NOT EXISTS manage_token_hash text,
  ADD COLUMN IF NOT EXISTS manage_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS presence_status text;

CREATE UNIQUE INDEX IF NOT EXISTS appointments_business_idempotency_key
  ON public.appointments (business_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'whatsapp',
  recipient text NOT NULL,
  template text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.notifications TO service_role;
GRANT SELECT ON public.notifications TO authenticated;

-- Confirmações rápidas para o editor SQL.
SELECT
  to_regprocedure('public.create_appointment_atomic(uuid,uuid,uuid[],timestamp with time zone,text,text,public.appointment_status,text,text,text,boolean,text,text)')
    AS base_booking_function,
  to_regprocedure('public.create_appointment_atomic_with_products(uuid,uuid,uuid[],uuid[],timestamp with time zone,text,text,public.appointment_status,text,text,text,boolean,text,text)')
    AS products_booking_function;
