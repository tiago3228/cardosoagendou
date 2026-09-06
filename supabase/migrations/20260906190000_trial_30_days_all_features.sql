-- Trial de 30 dias com acesso completo a todas as funcionalidades.
-- A alteração é aditiva e idempotente: não remove dados nem altera assinaturas pagas.

UPDATE public.plans
SET trial_days = 30,
    updated_at = now()
WHERE trial_days IS DISTINCT FROM 30;

-- Estende trials ainda ativos que foram criados com a duração anterior.
UPDATE public.subscriptions
SET current_period_end = current_period_start + interval '30 days',
    trial_ends_at = current_period_start + interval '30 days'
WHERE status = 'TRIALING'
  AND trial_ends_at IS NOT NULL
  AND trial_ends_at < current_period_start + interval '30 days';

-- Durante o trial, o negócio experimenta todas as features, independentemente
-- do plano-base usado para iniciar o cadastro.
CREATE OR REPLACE FUNCTION public.business_has_feature(_business_id uuid, _feature text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  enabled boolean;
  subscription_status text;
BEGIN
  IF _business_id IS NULL THEN RETURN false; END IF;
  IF public.business_booking_state(_business_id) NOT IN ('OPEN','GRACE') THEN RETURN false; END IF;

  SELECT s.status, COALESCE((p.features ->> _feature)::boolean, false)
    INTO subscription_status, enabled
    FROM public.subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
   WHERE s.business_id = _business_id
   LIMIT 1;

  IF subscription_status = 'TRIALING' THEN RETURN true; END IF;
  RETURN COALESCE(enabled, false);
END $$;

CREATE OR REPLACE FUNCTION public.business_professional_limit(_business_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lim integer;
  subscription_status text;
BEGIN
  IF public.business_booking_state(_business_id) NOT IN ('OPEN','GRACE') THEN
    RETURN 0;
  END IF;

  SELECT s.status, p.professional_limit
    INTO subscription_status, lim
    FROM public.subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
   WHERE s.business_id = _business_id
   LIMIT 1;

  IF subscription_status = 'TRIALING' THEN RETURN NULL; END IF;
  RETURN lim;
END $$;

CREATE OR REPLACE FUNCTION public.business_entitlements(_business_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  state text;
  entitled boolean;
  trialing boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_business_member(auth.uid(), _business_id) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  state := public.business_booking_state(_business_id);
  entitled := state IN ('OPEN','GRACE');

  SELECT jsonb_build_object(
    'plan_code', p.code,
    'plan_name', p.name,
    'professional_limit', CASE WHEN entitled AND s.status = 'TRIALING' THEN NULL
                               WHEN entitled THEN p.professional_limit
                               ELSE 0 END,
    'status', s.status,
    'booking_state', state,
    'entitled', entitled,
    'accepts_bookings', entitled,
    'features', CASE
      WHEN NOT entitled THEN '{}'::jsonb
      WHEN s.status = 'TRIALING' THEN jsonb_build_object(
        'appointments', true,
        'clients', true,
        'services', true,
        'inventory', true,
        'reports', true,
        'commissions', true,
        'finance', true,
        'team_manage', true
      )
      ELSE COALESCE(p.features, '{}'::jsonb)
    END,
    'current_period_end', s.current_period_end,
    'trial_ends_at', s.trial_ends_at,
    'grace_expires_at', s.grace_expires_at,
    'cancel_at_period_end', s.cancel_at_period_end,
    'grace_period_days', public.platform_setting_int('billing.grace_period_days', 7)
  ) INTO result
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.business_id = _business_id;

  RETURN COALESCE(result, jsonb_build_object(
    'plan_code', NULL,
    'plan_name', NULL,
    'professional_limit', 0,
    'status', NULL,
    'booking_state', state,
    'entitled', false,
    'accepts_bookings', false,
    'features', '{}'::jsonb,
    'grace_period_days', public.platform_setting_int('billing.grace_period_days', 7)
  ));
END $$;

COMMENT ON FUNCTION public.business_has_feature(uuid, text)
  IS 'Trialing businesses have access to all features for 30 days; paid plans use their configured feature set.';
