CREATE INDEX IF NOT EXISTS businesses_diamond_access_idx ON public.businesses (diamond_access) WHERE diamond_access = true;

CREATE OR REPLACE FUNCTION public.business_booking_state(_business_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b record; s record; grace integer;
BEGIN
  SELECT active, diamond_access INTO b FROM public.businesses WHERE id = _business_id;
  IF b IS NULL THEN RETURN 'NOT_FOUND'; END IF;
  IF NOT b.active THEN RETURN 'INACTIVE'; END IF;
  IF b.diamond_access THEN RETURN 'OPEN'; END IF;
  SELECT status, current_period_end, grace_expires_at INTO s FROM public.subscriptions WHERE business_id = _business_id;
  IF s IS NULL THEN RETURN 'BLOCKED'; END IF;
  grace := public.platform_setting_int('billing.grace_period_days', 7);
  IF s.status IN ('TRIALING','ACTIVE') THEN
    IF s.current_period_end < now() THEN RETURN 'BLOCKED'; END IF;
    RETURN 'OPEN';
  END IF;
  IF s.status = 'PAST_DUE' THEN
    IF now() <= COALESCE(s.grace_expires_at, s.current_period_end + (grace || ' days')::interval) THEN RETURN 'GRACE'; END IF;
    RETURN 'BLOCKED';
  END IF;
  RETURN 'BLOCKED';
END; $$;

CREATE OR REPLACE FUNCTION public.business_has_feature(_business_id uuid, _feature text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE enabled boolean; diamond boolean;
BEGIN
  IF _business_id IS NULL THEN RETURN false; END IF;
  SELECT diamond_access INTO diamond FROM public.businesses WHERE id = _business_id;
  IF diamond AND public.business_booking_state(_business_id) = 'OPEN' THEN RETURN true; END IF;
  IF public.business_booking_state(_business_id) NOT IN ('OPEN','GRACE') THEN RETURN false; END IF;
  SELECT COALESCE((p.features ->> _feature)::boolean, false) INTO enabled
  FROM public.subscriptions s JOIN public.plans p ON p.id = s.plan_id
  WHERE s.business_id = _business_id LIMIT 1;
  RETURN COALESCE(enabled, false);
END $$;

CREATE OR REPLACE FUNCTION public.business_entitlements(_business_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb; state text; entitled boolean; diamond boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_business_member(auth.uid(), _business_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT diamond_access INTO diamond FROM public.businesses WHERE id = _business_id;
  state := public.business_booking_state(_business_id);
  entitled := state IN ('OPEN','GRACE');
  SELECT jsonb_build_object(
    'plan_code', CASE WHEN diamond THEN 'DIAMOND' ELSE p.code END,
    'plan_name', CASE WHEN diamond THEN 'Diamante' ELSE p.name END,
    'professional_limit', CASE WHEN diamond OR (entitled AND s.status = 'TRIALING') THEN NULL WHEN entitled THEN p.professional_limit ELSE 0 END,
    'status', CASE WHEN diamond THEN 'ACTIVE' ELSE s.status END,
    'booking_state', state, 'entitled', (diamond OR entitled), 'accepts_bookings', (diamond OR entitled),
    'diamond_access', diamond,
    'features', CASE WHEN diamond THEN jsonb_build_object(
      'appointments', true, 'clients', true, 'services', true, 'inventory', true, 'reports', true,
      'commissions', true, 'finance', true, 'team_manage', true, 'crm', true
    ) WHEN NOT entitled THEN '{}'::jsonb WHEN s.status = 'TRIALING' THEN jsonb_build_object(
      'appointments', true, 'clients', true, 'services', true, 'inventory', true, 'reports', true,
      'commissions', true, 'finance', true, 'team_manage', true, 'crm', true
    ) ELSE COALESCE(p.features, '{}'::jsonb) END,
    'current_period_end', CASE WHEN diamond THEN NULL ELSE s.current_period_end END,
    'trial_ends_at', CASE WHEN diamond THEN NULL ELSE s.trial_ends_at END,
    'grace_expires_at', CASE WHEN diamond THEN NULL ELSE s.grace_expires_at END,
    'cancel_at_period_end', CASE WHEN diamond THEN false ELSE s.cancel_at_period_end END,
    'grace_period_days', public.platform_setting_int('billing.grace_period_days', 7)
  ) INTO result
  FROM public.subscriptions s LEFT JOIN public.plans p ON p.id = s.plan_id
  WHERE s.business_id = _business_id;
  IF diamond AND result IS NULL THEN
    RETURN jsonb_build_object('plan_code','DIAMOND','plan_name','Diamante','professional_limit',NULL,
      'status','ACTIVE','booking_state',state,'entitled',true,'accepts_bookings',true,'diamond_access',true,
      'features',jsonb_build_object('appointments',true,'clients',true,'services',true,'inventory',true,
        'reports',true,'commissions',true,'finance',true,'team_manage',true,'crm',true));
  END IF;
  RETURN COALESCE(result, jsonb_build_object('plan_code', NULL, 'plan_name', NULL, 'professional_limit', 0,
    'status', NULL, 'booking_state', state, 'entitled', false, 'accepts_bookings', false,
    'diamond_access', false, 'features', '{}'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.master_set_diamond_access(_business_id uuid, _enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE business_name text;
BEGIN
  IF NOT public.is_master(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN: acesso restrito à conta master'; END IF;
  UPDATE public.businesses SET diamond_access = _enabled WHERE id = _business_id RETURNING name INTO business_name;
  IF business_name IS NULL THEN RAISE EXCEPTION 'BUSINESS_NOT_FOUND: negócio inexistente'; END IF;
  INSERT INTO public.audit_logs (business_id, actor_user_id, action, entity, entity_id, data)
  VALUES (_business_id, auth.uid(), CASE WHEN _enabled THEN 'MASTER_DIAMOND_ENABLED' ELSE 'MASTER_DIAMOND_DISABLED' END,
    'business', _business_id::text, jsonb_build_object('diamond_access', _enabled));
  RETURN jsonb_build_object('business_id', _business_id, 'business_name', business_name, 'diamond_access', _enabled);
END $$;

REVOKE EXECUTE ON FUNCTION public.master_set_diamond_access(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.master_set_diamond_access(uuid, boolean) TO authenticated, service_role;