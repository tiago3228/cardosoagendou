CREATE OR REPLACE FUNCTION public.create_appointment_atomic_with_products(_business_id uuid, _professional_id uuid, _service_ids uuid[], _product_ids uuid[], _starts_at timestamp with time zone, _client_name text, _client_whatsapp text, _status appointment_status DEFAULT 'PENDING'::appointment_status, _notes text DEFAULT NULL::text, _source text DEFAULT 'public_booking'::text, _idempotency_key text DEFAULT NULL::text, _policy_accepted boolean DEFAULT false, _policy_text text DEFAULT NULL::text, _manage_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  created jsonb; new_appointment_id uuid; product_total integer;
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
  new_appointment_id := (created ->> 'id')::uuid;
  INSERT INTO public.appointment_products (appointment_id, business_id, product_id, product_name, price_cents, image_url, quantity)
  SELECT new_appointment_id, _business_id, p.id, p.name, p.price_cents, p.image_url, requested.quantity
  FROM (SELECT id, count(*)::integer AS quantity FROM unnest(COALESCE(_product_ids, '{}'::uuid[])) ids(id) GROUP BY id) requested
  JOIN public.products p ON p.id = requested.id AND p.business_id = _business_id AND p.active AND p.deleted_at IS NULL;
  SELECT COALESCE(sum(ap.price_cents * ap.quantity), 0) INTO product_total
    FROM public.appointment_products ap WHERE ap.appointment_id = new_appointment_id;
  UPDATE public.appointments SET total_price_cents = (created ->> 'total_price_cents')::integer + product_total WHERE id = new_appointment_id;
  RETURN jsonb_set(created, '{total_price_cents}', to_jsonb((created ->> 'total_price_cents')::integer + product_total));
END;
$function$;