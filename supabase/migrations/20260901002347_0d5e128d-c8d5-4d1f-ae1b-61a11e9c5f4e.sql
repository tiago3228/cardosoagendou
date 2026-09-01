-- 1. TRIAL 30 DIAS + FEATURE "finance" (exclusiva do plano Ilimitado)
UPDATE public.plans SET trial_days = 30 WHERE trial_days <> 30;
UPDATE public.plans SET features = features || jsonb_build_object('finance', code = 'UNLIMITED');

-- 2. ALMOÇO PADRÃO 12:00-13:00
ALTER TABLE public.professional_hours
  ALTER COLUMN lunch_starts_at SET DEFAULT '12:00'::time,
  ALTER COLUMN lunch_ends_at SET DEFAULT '13:00'::time;

UPDATE public.professional_hours
  SET lunch_starts_at = '12:00'::time, lunch_ends_at = '13:00'::time
  WHERE lunch_starts_at IS NULL AND lunch_ends_at IS NULL;

-- 3. PRODUTOS: categoria e fornecedor
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS supplier text;

-- 4. FINANCEIRO: categoria + restrição ao plano Ilimitado
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS category text;

DROP POLICY IF EXISTS transactions_owner_read ON public.transactions;
DROP POLICY IF EXISTS transactions_owner_insert ON public.transactions;

CREATE POLICY transactions_owner_read ON public.transactions
  FOR SELECT TO authenticated
  USING ((public.is_business_owner(auth.uid(), business_id) OR public.is_master(auth.uid()))
         AND public.business_has_feature(business_id, 'finance'));

CREATE POLICY transactions_owner_insert ON public.transactions
  FOR INSERT TO authenticated
  WITH CHECK (public.has_business_role(auth.uid(), business_id, 'owner'::app_role)
              AND public.business_has_feature(business_id, 'finance')
              AND (type <> 'COMMISSION'::transaction_type
                   OR public.business_has_feature(business_id, 'commissions')));

-- 5. CONFLITOS DE SERVIÇO
CREATE TABLE IF NOT EXISTS public.service_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  conflicting_service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_conflicts_distinct CHECK (service_id <> conflicting_service_id),
  CONSTRAINT service_conflicts_unique UNIQUE (business_id, service_id, conflicting_service_id)
);

CREATE INDEX IF NOT EXISTS service_conflicts_business_idx ON public.service_conflicts (business_id);
CREATE INDEX IF NOT EXISTS service_conflicts_service_idx ON public.service_conflicts (service_id);
CREATE INDEX IF NOT EXISTS service_conflicts_conflicting_idx ON public.service_conflicts (conflicting_service_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_conflicts TO authenticated;
GRANT ALL ON public.service_conflicts TO service_role;

ALTER TABLE public.service_conflicts ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_conflicts_member_read ON public.service_conflicts
  FOR SELECT TO authenticated
  USING (public.is_business_member(auth.uid(), business_id));

CREATE POLICY service_conflicts_owner_write ON public.service_conflicts
  FOR ALL TO authenticated
  USING (public.has_business_role(auth.uid(), business_id, 'owner'::app_role))
  WITH CHECK (public.has_business_role(auth.uid(), business_id, 'owner'::app_role));

CREATE TRIGGER service_conflicts_updated BEFORE UPDATE ON public.service_conflicts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER service_conflicts_tenant_immutable BEFORE UPDATE ON public.service_conflicts
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_immutable();

-- Both services must belong to the same tenant as the rule.
CREATE OR REPLACE FUNCTION public.validate_service_conflict()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.services s
                 WHERE s.id = NEW.service_id AND s.business_id = NEW.business_id)
     OR NOT EXISTS (SELECT 1 FROM public.services s
                 WHERE s.id = NEW.conflicting_service_id AND s.business_id = NEW.business_id) THEN
    RAISE EXCEPTION 'SERVICE_NOT_IN_BUSINESS: serviço não pertence a este negócio';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER service_conflicts_validate BEFORE INSERT OR UPDATE ON public.service_conflicts
  FOR EACH ROW EXECUTE FUNCTION public.validate_service_conflict();

-- 6. CATÁLOGO PÚBLICO: inclui as regras de conflito (nada financeiro/estoque sensível)
CREATE OR REPLACE FUNCTION public.public_catalog(_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    'serviceConflicts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('service_id', sc.service_id,
        'conflicting_service_id', sc.conflicting_service_id, 'reason', sc.reason))
      FROM public.service_conflicts sc WHERE sc.business_id = bid), '[]'::jsonb),
    'businessHours', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('weekday', h.weekday, 'opens_at', h.opens_at,
        'closes_at', h.closes_at, 'closed', h.closed) ORDER BY h.weekday)
      FROM public.business_hours h WHERE h.business_id = bid), '[]'::jsonb),
    'professionalHours', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('professional_id', ph.professional_id, 'weekday', ph.weekday,
        'starts_at', ph.starts_at, 'ends_at', ph.ends_at, 'enabled', ph.enabled,
        'lunch_starts_at', ph.lunch_starts_at, 'lunch_ends_at', ph.lunch_ends_at))
      FROM public.professional_hours ph
      JOIN public.professionals p ON p.id = ph.professional_id AND p.active AND p.deleted_at IS NULL
      WHERE ph.business_id = bid), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END $function$;

-- 7. GUARDA SERVIDOR: nenhum agendamento com serviços conflitantes
CREATE OR REPLACE FUNCTION public.enforce_service_conflicts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE clash record;
BEGIN
  SELECT sc.service_id, sc.conflicting_service_id INTO clash
  FROM public.service_conflicts sc
  JOIN public.appointment_services a1
    ON a1.appointment_id = NEW.appointment_id AND a1.service_id = sc.service_id
  JOIN public.appointment_services a2
    ON a2.appointment_id = NEW.appointment_id AND a2.service_id = sc.conflicting_service_id
  WHERE sc.business_id = NEW.business_id
  LIMIT 1;

  IF clash IS NOT NULL THEN
    RAISE EXCEPTION 'SERVICE_CONFLICT: os serviços selecionados não podem ser combinados';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS appointment_services_conflicts ON public.appointment_services;
CREATE CONSTRAINT TRIGGER appointment_services_conflicts
  AFTER INSERT ON public.appointment_services
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.enforce_service_conflicts();
