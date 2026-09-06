-- Phase 0: atomic appointment creation, retry idempotency and parallel-service materialization.
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS appointments_business_idempotency_key
  ON public.appointments (business_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_appointment_type_unique
  ON public.transactions (appointment_id, type)
  WHERE appointment_id IS NOT NULL
    AND type IN ('SERVICE_INCOME', 'COMMISSION');

CREATE OR REPLACE FUNCTION public.create_appointment_atomic(
  _business_id uuid,
  _professional_id uuid,
  _service_ids uuid[],
  _starts_at timestamptz,
  _client_name text,
  _client_whatsapp text,
  _status public.appointment_status DEFAULT 'PENDING',
  _notes text DEFAULT NULL,
  _source text DEFAULT 'public_booking',
  _idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  biz record;
  prof record;
  svc record;
  selected_count integer;
  duration integer;
  price integer;
  blocks boolean;
  ends_at timestamptz;
  client_id uuid;
  appointment_id uuid;
  existing record;
  service_snapshot jsonb;
BEGIN
  IF _business_id IS NULL OR _professional_id IS NULL OR COALESCE(array_length(_service_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'INVALID_BOOKING: dados incompletos';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.is_business_member(auth.uid(), _business_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: sem acesso a este negócio';
  END IF;

  IF _idempotency_key IS NOT NULL THEN
    SELECT id, starts_at, ends_at, total_price_cents, duration_minutes, status
      INTO existing
      FROM public.appointments
     WHERE business_id = _business_id AND idempotency_key = _idempotency_key;
    IF existing.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'id', existing.id,
        'starts_at', existing.starts_at,
        'ends_at', existing.ends_at,
        'total_price_cents', existing.total_price_cents,
        'duration_minutes', existing.duration_minutes,
        'status', existing.status,
        'idempotent', true
      );
    END IF;
  END IF;

  SELECT id, name INTO biz FROM public.businesses WHERE id = _business_id AND active;
  IF biz.id IS NULL THEN RAISE EXCEPTION 'BUSINESS_NOT_FOUND'; END IF;

  SELECT id, name INTO prof
    FROM public.professionals
   WHERE id = _professional_id
     AND business_id = _business_id
     AND active
     AND deleted_at IS NULL;
  IF prof.id IS NULL THEN RAISE EXCEPTION 'PROFESSIONAL_NOT_AVAILABLE'; END IF;

  SELECT count(*) INTO selected_count
    FROM (
      SELECT DISTINCT s.id
        FROM public.services s
        JOIN unnest(_service_ids) requested(id) ON requested.id = s.id
       WHERE s.business_id = _business_id
         AND s.active
         AND s.deleted_at IS NULL
    ) valid_services;
  IF selected_count <> (SELECT count(DISTINCT id) FROM unnest(_service_ids) ids(id)) THEN
    RAISE EXCEPTION 'SERVICE_NOT_AVAILABLE';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM unnest(_service_ids) requested(id)
      LEFT JOIN public.professional_services ps
        ON ps.professional_id = _professional_id
       AND ps.service_id = requested.id
       AND ps.business_id = _business_id
     WHERE ps.service_id IS NULL
  ) THEN
    RAISE EXCEPTION 'PROFESSIONAL_SERVICE_MISMATCH';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.service_conflicts sc
     WHERE sc.business_id = _business_id
       AND sc.service_id = ANY(_service_ids)
       AND sc.conflicting_service_id = ANY(_service_ids)
  ) THEN
    RAISE EXCEPTION 'SERVICE_CONFLICT';
  END IF;

  SELECT COALESCE(sum(s.duration_minutes), 0), COALESCE(sum(s.price_cents), 0), bool_and(s.allows_parallel)
    INTO duration, price, blocks
    FROM public.services s
   WHERE s.id = ANY(_service_ids)
     AND s.business_id = _business_id;
  blocks := NOT COALESCE(blocks, false);
  ends_at := _starts_at + make_interval(mins => duration);

  INSERT INTO public.clients (business_id, name, whatsapp)
  VALUES (_business_id, trim(_client_name), _client_whatsapp)
  ON CONFLICT (business_id, whatsapp) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO client_id;

  INSERT INTO public.appointments (
    business_id, professional_id, client_id, client_name, client_whatsapp,
    starts_at, ends_at, duration_minutes, total_price_cents, status, notes,
    idempotency_key, blocks_agenda, snapshot
  ) VALUES (
    _business_id, _professional_id, client_id, trim(_client_name), _client_whatsapp,
    _starts_at, ends_at, duration, price, _status, _notes,
    _idempotency_key, blocks,
    jsonb_build_object(
      'source', _source,
      'business_name', biz.name,
      'services', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'price_cents', s.price_cents,
          'duration_minutes', s.duration_minutes,
          'allows_parallel', s.allows_parallel
        ) ORDER BY s.name)
        FROM public.services s
        WHERE s.id = ANY(_service_ids) AND s.business_id = _business_id
      ), '[]'::jsonb)
    )
  ) RETURNING id INTO appointment_id;

  INSERT INTO public.appointment_services (
    appointment_id, business_id, service_id, service_name, price_cents, duration_minutes
  )
  SELECT appointment_id, _business_id, s.id, s.name, s.price_cents, s.duration_minutes
    FROM public.services s
   WHERE s.id = ANY(_service_ids)
     AND s.business_id = _business_id;

  IF _source = 'public_booking' THEN
    INSERT INTO public.notifications (business_id, appointment_id, recipient, template, payload)
    VALUES (
      _business_id, appointment_id, _client_whatsapp, 'appointment.created.client',
      jsonb_build_object('name', _client_name, 'starts_at', _starts_at)
    );

    INSERT INTO public.notifications (business_id, appointment_id, recipient, template, payload)
    SELECT _business_id, appointment_id, b.whatsapp, 'appointment.created.business',
      jsonb_build_object('client', _client_name, 'starts_at', _starts_at)
      FROM public.businesses b
     WHERE b.id = _business_id AND b.whatsapp IS NOT NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', appointment_id,
    'starts_at', _starts_at,
    'ends_at', ends_at,
    'total_price_cents', price,
    'duration_minutes', duration,
    'status', _status,
    'blocks_agenda', blocks,
    'idempotent', false
  );
EXCEPTION
  WHEN unique_violation THEN
    IF _idempotency_key IS NOT NULL THEN
      SELECT id, starts_at, ends_at, total_price_cents, duration_minutes, status
        INTO existing
        FROM public.appointments
       WHERE business_id = _business_id AND idempotency_key = _idempotency_key;
      IF existing.id IS NOT NULL THEN
        RETURN jsonb_build_object(
          'id', existing.id,
          'starts_at', existing.starts_at,
          'ends_at', existing.ends_at,
          'total_price_cents', existing.total_price_cents,
          'duration_minutes', existing.duration_minutes,
          'status', existing.status,
          'idempotent', true
        );
      END IF;
    END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.create_appointment_atomic(uuid, uuid, uuid[], timestamptz, text, text, public.appointment_status, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_appointment_atomic(uuid, uuid, uuid[], timestamptz, text, text, public.appointment_status, text, text, text) TO authenticated, service_role;
