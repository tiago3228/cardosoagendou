-- 1. Permissões de execução das funções auxiliares (raiz do erro "permission denied for function business_booking_state")
GRANT EXECUTE ON FUNCTION public.business_booking_state(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.business_professional_limit(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.platform_setting_int(text, integer) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_add_professional(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.business_accepts_bookings(uuid) TO authenticated, anon;

-- 2. Triggers que chamam essas funções passam a rodar com privilégios do proprietário
CREATE OR REPLACE FUNCTION public.enforce_professional_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE lim integer; used integer; state text;
BEGIN
  IF NEW.deleted_at IS NOT NULL OR NEW.active = false THEN RETURN NEW; END IF;
  state := public.business_booking_state(NEW.business_id);
  IF state NOT IN ('OPEN','GRACE') THEN
    RAISE EXCEPTION 'SUBSCRIPTION_INACTIVE: assinatura % — regularize o pagamento para gerenciar profissionais', state;
  END IF;
  lim := public.business_professional_limit(NEW.business_id);
  IF lim IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO used FROM public.professionals
    WHERE business_id = NEW.business_id AND active AND deleted_at IS NULL AND id <> NEW.id;
  IF used + 1 > lim THEN
    RAISE EXCEPTION 'PLAN_LIMIT_REACHED: plan allows % active professionals', lim;
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.enforce_booking_allowed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT public.business_accepts_bookings(NEW.business_id) THEN
    RAISE EXCEPTION 'BOOKING_DISABLED: estabelecimento temporariamente indisponível para novos agendamentos';
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.prevent_double_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.status IN ('CANCELED','NO_SHOW') THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.professional_id = NEW.professional_id
      AND a.id <> NEW.id
      AND a.status NOT IN ('CANCELED','NO_SHOW')
      AND a.starts_at < NEW.ends_at
      AND a.ends_at > NEW.starts_at
  ) THEN
    RAISE EXCEPTION 'DOUBLE_BOOKING: professional already has an appointment in this time range';
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE current_qty integer;
BEGIN
  SELECT stock_quantity INTO current_qty FROM public.products WHERE id = NEW.product_id AND business_id = NEW.business_id;
  IF current_qty IS NULL THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
  IF NEW.type = 'IN' THEN
    UPDATE public.products SET stock_quantity = current_qty + NEW.quantity WHERE id = NEW.product_id;
  ELSIF NEW.type = 'OUT' THEN
    IF current_qty < NEW.quantity THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK'; END IF;
    UPDATE public.products SET stock_quantity = current_qty - NEW.quantity WHERE id = NEW.product_id;
  ELSE
    UPDATE public.products SET stock_quantity = NEW.quantity WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END; $function$;

-- 3. Recursos por plano
UPDATE public.plans SET features = features || '{"inventory": false, "team_manage": false}'::jsonb WHERE code = 'BASIC';
UPDATE public.plans SET features = features || '{"inventory": false, "team_manage": true}'::jsonb WHERE code = 'MEDIUM';
UPDATE public.plans SET features = features || '{"inventory": true, "team_manage": true}'::jsonb WHERE code = 'UNLIMITED';

-- 4. Bloqueio de edição/exclusão de profissionais em planos sem o recurso
CREATE OR REPLACE FUNCTION public.enforce_team_manage_feature()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  -- Profissional editando o próprio cadastro, ou vínculo de convite: liberado.
  IF OLD.user_id IS NOT DISTINCT FROM auth.uid() THEN RETURN NEW; END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN RETURN NEW; END IF;
  IF public.business_has_feature(OLD.business_id, 'team_manage') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'FEATURE_LOCKED_TEAM: para editar um profissional, assine um plano superior';
END; $function$;

DROP TRIGGER IF EXISTS professionals_team_manage ON public.professionals;
CREATE TRIGGER professionals_team_manage BEFORE UPDATE ON public.professionals
FOR EACH ROW EXECUTE FUNCTION public.enforce_team_manage_feature();

-- 5. Foto do produto
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url text;

-- 6. Endereço público oficial
INSERT INTO public.platform_settings (key, value, description)
VALUES ('app.public_origin', '"https://cardosoagendou.lovable.app"'::jsonb, 'Domínio público oficial usado nos links de reserva')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 7. Vitrine pública inclui produtos quando o plano libera o recurso
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
        'image_url', s.image_url) ORDER BY s.category NULLS LAST, s.name)
      FROM public.services s
      WHERE s.business_id = bid AND s.active AND s.deleted_at IS NULL), '[]'::jsonb),
    'products', CASE WHEN public.business_has_feature(bid, 'inventory') THEN COALESCE((
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
      WHERE ph.business_id = bid), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END $function$;