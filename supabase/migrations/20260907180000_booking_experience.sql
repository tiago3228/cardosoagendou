-- Configurações do link público e suporte a quantidade de produtos.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS cancellation_deadline_hours integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS primary_color text NOT NULL DEFAULT '#B4884F',
  ADD COLUMN IF NOT EXISTS secondary_color text NOT NULL DEFAULT '#14120F';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'appointments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.public_business(_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'id', b.id, 'slug', b.slug, 'name', b.name, 'business_type', b.business_type,
    'description', b.description, 'logo_url', b.logo_url, 'cover_url', b.cover_url,
    'whatsapp', CASE WHEN b.show_whatsapp THEN b.whatsapp END,
    'address', CASE WHEN b.show_address THEN b.address END,
    'instagram_url', b.instagram_url, 'booking_policy', b.booking_policy,
    'timezone', b.timezone, 'slot_interval_minutes', b.slot_interval_minutes,
    'min_notice_minutes', b.min_notice_minutes, 'max_advance_days', b.max_advance_days,
    'accepts_bookings', public.business_accepts_bookings(b.id),
    'cancellation_deadline_hours', COALESCE(b.cancellation_deadline_hours, 1),
    'primary_color', COALESCE(b.primary_color, '#B4884F'),
    'secondary_color', COALESCE(b.secondary_color, '#14120F')
  )
  FROM public.businesses b
  WHERE b.slug = _slug AND b.active;
$function$;

CREATE OR REPLACE FUNCTION public.appointment_cancel_by_token(_token_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE row_data record;
BEGIN
  SELECT a.*, COALESCE(b.cancellation_deadline_hours, 1) AS cancellation_deadline_hours
    INTO row_data
    FROM public.appointments a JOIN public.businesses b ON b.id = a.business_id
   WHERE a.manage_token_hash = _token_hash
     AND (a.manage_token_expires_at IS NULL OR a.manage_token_expires_at > now())
   FOR UPDATE OF a;
  IF row_data.id IS NULL THEN RAISE EXCEPTION 'MANAGE_LINK_INVALID'; END IF;
  IF row_data.status IN ('CANCELED','COMPLETED','NO_SHOW') THEN RAISE EXCEPTION 'APPOINTMENT_NOT_CANCELABLE'; END IF;
  IF row_data.starts_at < now() + make_interval(hours => row_data.cancellation_deadline_hours) THEN
    RAISE EXCEPTION 'CANCEL_NOTICE_REQUIRED';
  END IF;
  UPDATE public.appointments SET status = 'CANCELED', cancel_reason = 'Cancelado pelo cliente' WHERE id = row_data.id;
  PERFORM public.enqueue_message(row_data.business_id, row_data.id, 'CLIENT_CANCELED', row_data.client_whatsapp,
    jsonb_build_object('appointment_id', row_data.id), 'canceled:' || row_data.id::text);
  RETURN jsonb_build_object('id', row_data.id, 'status', 'CANCELED');
END;
$function$;

CREATE OR REPLACE FUNCTION public.appointment_manage_by_token(_token_hash text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'id', a.id, 'business_id', a.business_id, 'business_name', b.name, 'business_slug', b.slug,
    'client_name', a.client_name, 'starts_at', a.starts_at, 'ends_at', a.ends_at,
    'status', a.status, 'presence_status', a.presence_status, 'professional_id', a.professional_id,
    'service_ids', COALESCE((SELECT jsonb_agg(aps.service_id) FILTER (WHERE aps.service_id IS NOT NULL)
      FROM public.appointment_services aps WHERE aps.appointment_id = a.id), '[]'::jsonb),
    'policy', b.booking_policy,
    'cancellation_deadline_hours', COALESCE(b.cancellation_deadline_hours, 1),
    'allow_cancel', a.status IN ('PENDING','CONFIRMED') AND a.starts_at > now() + make_interval(hours => COALESCE(b.cancellation_deadline_hours, 1)),
    'allow_reschedule', a.status IN ('PENDING','CONFIRMED') AND a.starts_at > now() + interval '2 hours'
  )
  FROM public.appointments a JOIN public.businesses b ON b.id = a.business_id
  WHERE a.manage_token_hash = _token_hash
    AND (a.manage_token_expires_at IS NULL OR a.manage_token_expires_at > now());
$function$;

CREATE OR REPLACE FUNCTION public.create_appointment_atomic_with_products(
  _business_id uuid, _professional_id uuid, _service_ids uuid[], _product_ids uuid[],
  _starts_at timestamptz, _client_name text, _client_whatsapp text,
  _status public.appointment_status DEFAULT 'PENDING', _notes text DEFAULT NULL,
  _source text DEFAULT 'public_booking', _idempotency_key text DEFAULT NULL,
  _policy_accepted boolean DEFAULT false, _policy_text text DEFAULT NULL, _manage_token text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  created jsonb; appointment_id uuid; product_total integer;
BEGIN
  IF NOT public.business_can_select_products(_business_id)
     AND COALESCE(array_length(_product_ids, 1), 0) > 0 THEN
    RAISE EXCEPTION 'PRODUCT_SELECTION_NOT_AVAILABLE: recurso disponível apenas no plano Ilimitado';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM (SELECT id, count(*)::integer AS quantity FROM unnest(COALESCE(_product_ids, '{}'::uuid[])) ids(id) GROUP BY id) requested
    LEFT JOIN public.products p ON p.id = requested.id AND p.business_id = _business_id AND p.active AND p.deleted_at IS NULL
    WHERE p.id IS NULL OR requested.quantity > p.stock_quantity
  ) THEN
    RAISE EXCEPTION 'PRODUCT_NOT_AVAILABLE: produto indisponível ou quantidade maior que o estoque';
  END IF;
  created := public.create_appointment_atomic(_business_id, _professional_id, _service_ids, _starts_at,
    _client_name, _client_whatsapp, _status, _notes, _source, _idempotency_key,
    _policy_accepted, _policy_text, _manage_token);
  appointment_id := (created ->> 'id')::uuid;
  INSERT INTO public.appointment_products (appointment_id, business_id, product_id, product_name, price_cents, image_url, quantity)
  SELECT appointment_id, _business_id, p.id, p.name, p.price_cents, p.image_url, requested.quantity
  FROM (SELECT id, count(*)::integer AS quantity FROM unnest(COALESCE(_product_ids, '{}'::uuid[])) ids(id) GROUP BY id) requested
  JOIN public.products p ON p.id = requested.id AND p.business_id = _business_id AND p.active AND p.deleted_at IS NULL;
  SELECT COALESCE(sum(ap.price_cents * ap.quantity), 0) INTO product_total
    FROM public.appointment_products ap WHERE ap.appointment_id = appointment_id;
  UPDATE public.appointments SET total_price_cents = (created ->> 'total_price_cents')::integer + product_total WHERE id = appointment_id;
  RETURN jsonb_set(created, '{total_price_cents}', to_jsonb((created ->> 'total_price_cents')::integer + product_total));
END;
$$;

REVOKE ALL ON FUNCTION public.create_appointment_atomic_with_products(uuid, uuid, uuid[], uuid[], timestamptz, text, text, public.appointment_status, text, text, text, boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_appointment_atomic_with_products(uuid, uuid, uuid[], uuid[], timestamptz, text, text, public.appointment_status, text, text, text, boolean, text, text) TO service_role, authenticated;
