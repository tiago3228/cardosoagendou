-- Produtos solicitados no agendamento e reagendamento transacional.
-- Nenhuma operação deste arquivo baixa estoque. A baixa continua sendo feita
-- somente por movimentos registrados pelo proprietário no fluxo de venda.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS rescheduled_from_id uuid REFERENCES public.appointments(id),
  ADD COLUMN IF NOT EXISTS rescheduled_to_id uuid REFERENCES public.appointments(id);

CREATE TABLE IF NOT EXISTS public.appointment_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  image_url text,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (appointment_id, product_id)
);

CREATE INDEX IF NOT EXISTS appointment_products_appointment_idx
  ON public.appointment_products (appointment_id);
CREATE INDEX IF NOT EXISTS appointment_products_business_idx
  ON public.appointment_products (business_id, created_at DESC);

GRANT SELECT ON public.appointment_products TO authenticated;
GRANT ALL ON public.appointment_products TO service_role;
ALTER TABLE public.appointment_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS appointment_products_member_read ON public.appointment_products;
CREATE POLICY appointment_products_member_read ON public.appointment_products
  FOR SELECT TO authenticated
  USING (public.is_business_member(auth.uid(), business_id));

-- Seleção pública de produtos é exclusiva do plano Ilimitado. Um trial ativo
-- também pode testar esse recurso, pois possui entitlements completos durante
-- os 30 dias, sem transformar o plano-base em uma assinatura Ilimitada.
CREATE OR REPLACE FUNCTION public.business_can_select_products(_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.subscriptions s
      JOIN public.plans p ON p.id = s.plan_id
     WHERE s.business_id = _business_id
       AND public.business_booking_state(_business_id) IN ('OPEN', 'GRACE')
       AND (s.status = 'TRIALING' OR p.code = 'UNLIMITED')
  );
$$;
REVOKE ALL ON FUNCTION public.business_can_select_products(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_can_select_products(uuid) TO service_role;

-- O catálogo continua podendo expor produtos para gestão de estoque, mas a
-- seleção para um agendamento só aparece para quem possui o recurso de venda.
CREATE OR REPLACE FUNCTION public.public_catalog(_slug text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE bid uuid; result jsonb;
BEGIN
  SELECT id INTO bid FROM public.businesses WHERE slug = _slug AND active;
  IF bid IS NULL THEN RETURN NULL; END IF;
  SELECT jsonb_build_object(
    'services', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'description', s.description,
        'category', s.category, 'price_cents', s.price_cents, 'duration_minutes', s.duration_minutes,
        'image_url', s.image_url, 'allows_parallel', s.allows_parallel) ORDER BY s.category NULLS LAST, s.name)
      FROM public.services s
      WHERE s.business_id = bid AND s.active AND s.deleted_at IS NULL), '[]'::jsonb),
    'products', CASE WHEN public.business_can_select_products(bid) THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', pr.id, 'name', pr.name, 'price_cents', pr.price_cents,
        'stock_quantity', pr.stock_quantity, 'image_url', pr.image_url) ORDER BY pr.name)
      FROM public.products pr
      WHERE pr.business_id = bid AND pr.active AND pr.deleted_at IS NULL AND pr.stock_quantity > 0), '[]'::jsonb)
      ELSE '[]'::jsonb END,
    'professionals', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'photo_url', p.photo_url,
        'bio', p.bio) ORDER BY p.name)
      FROM public.professionals p
      WHERE p.business_id = bid AND p.active AND p.deleted_at IS NULL), '[]'::jsonb),
    'links', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('professional_id', ps.professional_id, 'service_id', ps.service_id))
      FROM public.professional_services ps
      JOIN public.professionals p ON p.id = ps.professional_id AND p.active AND p.deleted_at IS NULL
      WHERE ps.business_id = bid), '[]'::jsonb),
    'businessHours', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('weekday', h.weekday, 'opens_at', h.opens_at,
        'closes_at', h.closes_at, 'closed', h.closed) ORDER BY h.weekday)
      FROM public.business_hours h WHERE h.business_id = bid), '[]'::jsonb),
    'professionalHours', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('professional_id', ph.professional_id, 'weekday', ph.weekday,
        'starts_at', ph.starts_at, 'ends_at', ph.ends_at, 'enabled', ph.enabled))
      FROM public.professional_hours ph
      JOIN public.professionals p ON p.id = ph.professional_id AND p.active AND p.deleted_at IS NULL
      WHERE ph.business_id = bid), '[]'::jsonb),
    'serviceConflicts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('service_id', sc.service_id,
        'conflicting_service_id', sc.conflicting_service_id, 'reason', sc.reason))
      FROM public.service_conflicts sc WHERE sc.business_id = bid), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.public_catalog(text) TO anon, authenticated, service_role;

-- Wrapper transacional: a RPC antiga cria o agendamento e esta mesma
-- transação materializa os produtos com preço/nome/foto congelados.
CREATE OR REPLACE FUNCTION public.create_appointment_atomic_with_products(
  _business_id uuid,
  _professional_id uuid,
  _service_ids uuid[],
  _product_ids uuid[],
  _starts_at timestamptz,
  _client_name text,
  _client_whatsapp text,
  _status public.appointment_status DEFAULT 'PENDING',
  _notes text DEFAULT NULL,
  _source text DEFAULT 'public_booking',
  _idempotency_key text DEFAULT NULL,
  _policy_accepted boolean DEFAULT false,
  _policy_text text DEFAULT NULL,
  _manage_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  created jsonb;
  appointment_id uuid;
  selected_count integer;
  product_total integer;
BEGIN
  IF NOT public.business_can_select_products(_business_id)
     AND COALESCE(array_length(_product_ids, 1), 0) > 0 THEN
    RAISE EXCEPTION 'PRODUCT_SELECTION_NOT_AVAILABLE: recurso disponível apenas no plano Ilimitado';
  END IF;

  SELECT count(*) INTO selected_count
    FROM public.products p
   WHERE p.id = ANY(COALESCE(_product_ids, '{}'::uuid[]))
     AND p.business_id = _business_id
     AND p.active
     AND p.deleted_at IS NULL
     AND p.stock_quantity > 0;
  IF selected_count <> (SELECT count(DISTINCT id) FROM unnest(COALESCE(_product_ids, '{}'::uuid[])) ids(id)) THEN
    RAISE EXCEPTION 'PRODUCT_NOT_AVAILABLE: produto indisponível';
  END IF;

  created := public.create_appointment_atomic(
    _business_id, _professional_id, _service_ids, _starts_at, _client_name,
    _client_whatsapp, _status, _notes, _source, _idempotency_key,
    _policy_accepted, _policy_text, _manage_token
  );
  appointment_id := (created ->> 'id')::uuid;

  INSERT INTO public.appointment_products (
    appointment_id, business_id, product_id, product_name, price_cents, image_url
  )
  SELECT appointment_id, _business_id, p.id, p.name, p.price_cents, p.image_url
    FROM public.products p
   WHERE p.id = ANY(COALESCE(_product_ids, '{}'::uuid[]))
     AND p.business_id = _business_id
     AND p.active
     AND p.deleted_at IS NULL
     AND p.stock_quantity > 0
  ON CONFLICT (appointment_id, product_id) DO NOTHING;

  SELECT COALESCE(sum(ap.price_cents * ap.quantity), 0)
    INTO product_total
    FROM public.appointment_products ap
   WHERE ap.appointment_id = appointment_id;

  UPDATE public.appointments
     SET total_price_cents = (created ->> 'total_price_cents')::integer + product_total
   WHERE id = appointment_id;

  RETURN jsonb_set(
    created,
    '{total_price_cents}',
    to_jsonb((created ->> 'total_price_cents')::integer + product_total)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.create_appointment_atomic_with_products(uuid, uuid, uuid[], uuid[], timestamptz, text, text, public.appointment_status, text, text, text, boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_appointment_atomic_with_products(uuid, uuid, uuid[], uuid[], timestamptz, text, text, public.appointment_status, text, text, text, boolean, text, text) TO service_role, authenticated;

-- Reagendamento público seguro: a linha antiga vira histórico e uma nova linha
-- ocupa o horário escolhido. Toda a operação é uma única transação.
CREATE OR REPLACE FUNCTION public.reschedule_appointment_by_token(
  _token_hash text,
  _professional_id uuid,
  _starts_at timestamptz,
  _manage_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_row record;
  new_row jsonb;
  old_services uuid[];
  new_id uuid;
  product_total integer;
  new_total integer;
BEGIN
  SELECT a.* INTO old_row
    FROM public.appointments a
   WHERE a.manage_token_hash = _token_hash
     AND (a.manage_token_expires_at IS NULL OR a.manage_token_expires_at > now())
   FOR UPDATE;
  IF old_row.id IS NULL THEN RAISE EXCEPTION 'MANAGE_LINK_INVALID'; END IF;
  IF old_row.status IN ('CANCELED', 'COMPLETED', 'NO_SHOW', 'RESCHEDULED') THEN
    RAISE EXCEPTION 'APPOINTMENT_NOT_RESCHEDULABLE';
  END IF;
  IF old_row.starts_at < now() + interval '2 hours' THEN
    RAISE EXCEPTION 'RESCHEDULE_NOTICE_REQUIRED';
  END IF;

  SELECT COALESCE(array_agg(aps.service_id) FILTER (WHERE aps.service_id IS NOT NULL), '{}'::uuid[])
    INTO old_services
    FROM public.appointment_services aps
   WHERE aps.appointment_id = old_row.id;

  UPDATE public.appointments
     SET status = 'RESCHEDULED', blocks_agenda = false, rescheduled_to_id = NULL
   WHERE id = old_row.id;

  new_row := public.create_appointment_atomic_with_products(
    old_row.business_id, _professional_id, old_services, '{}'::uuid[], _starts_at,
    old_row.client_name, old_row.client_whatsapp, old_row.status, old_row.notes,
    'reschedule', NULL, old_row.policy_accepted_at IS NOT NULL,
    old_row.policy_text_snapshot, _manage_token
  );
  new_id := (new_row ->> 'id')::uuid;

  INSERT INTO public.appointment_products (
    appointment_id, business_id, product_id, product_name, price_cents, image_url, quantity
  )
  SELECT new_id, ap.business_id, ap.product_id, ap.product_name, ap.price_cents, ap.image_url, ap.quantity
    FROM public.appointment_products ap
   WHERE ap.appointment_id = old_row.id;

  SELECT COALESCE(sum(ap.price_cents * ap.quantity), 0)
    INTO product_total
    FROM public.appointment_products ap
   WHERE ap.appointment_id = new_id;
  UPDATE public.appointments
     SET total_price_cents = total_price_cents + product_total
   WHERE id = new_id;
  SELECT a.total_price_cents INTO new_total FROM public.appointments a WHERE a.id = new_id;

  UPDATE public.appointments SET rescheduled_to_id = new_id WHERE id = old_row.id;
  UPDATE public.appointments SET rescheduled_from_id = old_row.id WHERE id = new_id;

  IF old_row.status = 'CONFIRMED' THEN
    PERFORM public.enqueue_message(
      old_row.business_id, new_id, 'APPOINTMENT_RESCHEDULED', old_row.client_whatsapp,
      jsonb_build_object('appointment_id', new_id, 'previous_appointment_id', old_row.id,
        'starts_at', _starts_at), 'rescheduled:' || old_row.id::text || ':' || new_id::text
    );
  END IF;

  RETURN jsonb_build_object(
    'id', new_id,
    'previous_id', old_row.id,
    'starts_at', new_row ->> 'starts_at',
    'ends_at', new_row ->> 'ends_at',
    'total_price_cents', new_total,
    'duration_minutes', new_row ->> 'duration_minutes',
    'status', new_row ->> 'status'
  );
END;
$$;
REVOKE ALL ON FUNCTION public.reschedule_appointment_by_token(text, uuid, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_appointment_by_token(text, uuid, timestamptz, text) TO service_role;

-- Reagendados nunca ocupam a agenda, nem no trigger anti-concorrência.
CREATE OR REPLACE FUNCTION public.prevent_double_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.status IN ('CANCELED','NO_SHOW','RESCHEDULED') THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.professional_id = NEW.professional_id
      AND a.id <> NEW.id
      AND a.status NOT IN ('CANCELED','NO_SHOW','RESCHEDULED')
      AND a.starts_at < NEW.ends_at
      AND a.ends_at > NEW.starts_at
  ) THEN
    RAISE EXCEPTION 'DOUBLE_BOOKING: professional already has an appointment in this time range';
  END IF;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS appointments_no_overlap ON public.appointments;
CREATE TRIGGER appointments_no_overlap
BEFORE INSERT OR UPDATE OF starts_at, ends_at, professional_id, status
ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.prevent_double_booking();

-- Inclui os serviços congelados no retorno do link para que o servidor valide
-- o novo horário com as mesmas regras do agendamento original.
CREATE OR REPLACE FUNCTION public.appointment_manage_by_token(_token_hash text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', a.id,
    'business_id', a.business_id,
    'business_name', b.name,
    'business_slug', b.slug,
    'client_name', a.client_name,
    'starts_at', a.starts_at,
    'ends_at', a.ends_at,
    'status', a.status,
    'presence_status', a.presence_status,
    'professional_id', a.professional_id,
    'service_ids', COALESCE((
      SELECT jsonb_agg(aps.service_id) FILTER (WHERE aps.service_id IS NOT NULL)
      FROM public.appointment_services aps
      WHERE aps.appointment_id = a.id
    ), '[]'::jsonb),
    'policy', b.booking_policy,
    'allow_cancel', a.status IN ('PENDING', 'CONFIRMED') AND a.starts_at > now() + interval '1 hour',
    'allow_reschedule', a.status IN ('PENDING', 'CONFIRMED') AND a.starts_at > now() + interval '2 hours'
  )
  FROM public.appointments a
  JOIN public.businesses b ON b.id = a.business_id
  WHERE a.manage_token_hash = _token_hash
    AND (a.manage_token_expires_at IS NULL OR a.manage_token_expires_at > now());
$$;
GRANT EXECUTE ON FUNCTION public.appointment_manage_by_token(text) TO anon, authenticated, service_role;
