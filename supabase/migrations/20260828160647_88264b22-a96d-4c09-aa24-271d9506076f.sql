-- ============================================================
-- 1. Master administrator
-- ============================================================
INSERT INTO public.user_roles (user_id, business_id, role)
SELECT u.id, NULL, 'master'::public.app_role FROM auth.users u
WHERE u.email = 'tiago3228@yahoo.com.br'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = u.id AND r.role = 'master'::public.app_role
  );

-- ============================================================
-- 2. Distinct feature tiers per plan
-- ============================================================
UPDATE public.plans SET features = jsonb_build_object(
  'appointments', true, 'clients', true, 'services', true,
  'inventory', false, 'reports', false, 'commissions', false) WHERE code = 'BASIC';
UPDATE public.plans SET features = jsonb_build_object(
  'appointments', true, 'clients', true, 'services', true,
  'inventory', true, 'reports', true, 'commissions', false) WHERE code = 'MEDIUM';
UPDATE public.plans SET features = jsonb_build_object(
  'appointments', true, 'clients', true, 'services', true,
  'inventory', true, 'reports', true, 'commissions', true) WHERE code = 'UNLIMITED';

-- ============================================================
-- 3. Server-side feature gate
-- ============================================================
CREATE OR REPLACE FUNCTION public.business_has_feature(_business_id uuid, _feature text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE enabled boolean;
BEGIN
  IF _business_id IS NULL THEN RETURN false; END IF;
  IF public.business_booking_state(_business_id) NOT IN ('OPEN','GRACE') THEN RETURN false; END IF;
  SELECT COALESCE((p.features ->> _feature)::boolean, false) INTO enabled
  FROM public.subscriptions s JOIN public.plans p ON p.id = s.plan_id
  WHERE s.business_id = _business_id LIMIT 1;
  RETURN COALESCE(enabled, false);
END $$;

REVOKE EXECUTE ON FUNCTION public.business_has_feature(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_has_feature(uuid, text) TO authenticated, service_role;

-- ============================================================
-- 4. Feature-aware access rules
-- ============================================================
DROP POLICY "products_member_read" ON public.products;
CREATE POLICY "products_member_read" ON public.products FOR SELECT TO authenticated
  USING (public.is_business_member(auth.uid(), business_id)
    AND public.business_has_feature(business_id, 'inventory'));

DROP POLICY "products_owner_write" ON public.products;
CREATE POLICY "products_owner_write" ON public.products FOR ALL TO authenticated
  USING (public.has_business_role(auth.uid(), business_id, 'owner')
    AND public.business_has_feature(business_id, 'inventory'))
  WITH CHECK (public.has_business_role(auth.uid(), business_id, 'owner')
    AND public.business_has_feature(business_id, 'inventory'));

DROP POLICY "stock_owner_read" ON public.stock_movements;
CREATE POLICY "stock_owner_read" ON public.stock_movements FOR SELECT TO authenticated
  USING ((public.is_business_owner(auth.uid(), business_id) OR public.is_master(auth.uid()))
    AND public.business_has_feature(business_id, 'inventory'));

DROP POLICY "stock_owner_write" ON public.stock_movements;
CREATE POLICY "stock_owner_write" ON public.stock_movements FOR INSERT TO authenticated
  WITH CHECK (public.has_business_role(auth.uid(), business_id, 'owner')
    AND public.business_has_feature(business_id, 'inventory'));

DROP POLICY "transactions_owner_read" ON public.transactions;
CREATE POLICY "transactions_owner_read" ON public.transactions FOR SELECT TO authenticated
  USING ((public.is_business_owner(auth.uid(), business_id) OR public.is_master(auth.uid()))
    AND public.business_has_feature(business_id, 'reports'));

DROP POLICY "transactions_owner_insert" ON public.transactions;
CREATE POLICY "transactions_owner_insert" ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (public.has_business_role(auth.uid(), business_id, 'owner')
    AND public.business_has_feature(business_id, 'reports')
    AND (type <> 'COMMISSION'::public.transaction_type
      OR public.business_has_feature(business_id, 'commissions')));

-- Commissions are a paid feature: only plans that include it may set a rate.
CREATE OR REPLACE FUNCTION public.enforce_commission_feature()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.commission_percent, 0) > 0
     AND (TG_OP = 'INSERT' OR NEW.commission_percent IS DISTINCT FROM OLD.commission_percent)
     AND NOT public.business_has_feature(NEW.business_id, 'commissions') THEN
    RAISE EXCEPTION 'FEATURE_LOCKED: comissões disponíveis apenas no plano Ilimitado';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER professionals_commission_feature
  BEFORE INSERT OR UPDATE ON public.professionals
  FOR EACH ROW EXECUTE FUNCTION public.enforce_commission_feature();

-- ============================================================
-- 5. Master test mode: switch a business between plans
-- ============================================================
CREATE OR REPLACE FUNCTION public.master_set_test_plan(
  _business_id uuid, _plan_code text, _interval public.billing_interval DEFAULT 'MONTHLY')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE plan record; sub record; sub_id uuid; new_end timestamptz;
BEGIN
  IF NOT public.is_master(auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN: acesso restrito à conta master';
  END IF;

  SELECT * INTO plan FROM public.plans WHERE code = _plan_code AND active;
  IF plan IS NULL THEN RAISE EXCEPTION 'PLAN_NOT_FOUND: plano indisponível'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.businesses WHERE id = _business_id) THEN
    RAISE EXCEPTION 'BUSINESS_NOT_FOUND: negócio inexistente';
  END IF;

  new_end := now() + CASE _interval WHEN 'ANNUAL' THEN interval '1 year' ELSE interval '1 month' END;
  SELECT * INTO sub FROM public.subscriptions WHERE business_id = _business_id FOR UPDATE;

  IF sub IS NULL THEN
    INSERT INTO public.subscriptions (business_id, plan_id, status, billing_interval,
      current_period_start, current_period_end, provider, amount_cents)
    VALUES (_business_id, plan.id, 'ACTIVE', _interval, now(), new_end, 'master_test',
      CASE _interval WHEN 'ANNUAL' THEN plan.annual_price_cents ELSE plan.monthly_price_cents END)
    RETURNING id INTO sub_id;
  ELSE
    UPDATE public.subscriptions SET
      plan_id = plan.id, billing_interval = _interval, status = 'ACTIVE',
      current_period_start = now(), current_period_end = new_end,
      grace_expires_at = NULL, cancel_at_period_end = false, canceled_at = NULL,
      pending_plan_id = NULL, pending_billing_interval = NULL,
      provider = 'master_test',
      amount_cents = CASE _interval WHEN 'ANNUAL' THEN plan.annual_price_cents ELSE plan.monthly_price_cents END
    WHERE id = sub.id;
    sub_id := sub.id;
  END IF;

  INSERT INTO public.audit_logs (business_id, actor_user_id, action, entity, entity_id, data)
  VALUES (_business_id, auth.uid(), 'MASTER_TEST_PLAN_SET', 'subscription', sub_id::text,
    jsonb_build_object('plan', plan.code, 'interval', _interval));

  RETURN jsonb_build_object('plan_code', plan.code, 'plan_name', plan.name,
    'interval', _interval, 'current_period_end', new_end);
END $$;

REVOKE EXECUTE ON FUNCTION public.master_set_test_plan(uuid, text, public.billing_interval) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.master_set_test_plan(uuid, text, public.billing_interval) TO authenticated, service_role;