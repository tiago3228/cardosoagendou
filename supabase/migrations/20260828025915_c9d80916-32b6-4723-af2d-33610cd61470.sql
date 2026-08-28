-- Trigger functions and internal billing helpers must not be callable through the API.
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    -- Anonymous users never call internal functions directly.
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn.sig);
    -- Signed-in users only keep the authorization helpers that RLS policies
    -- must evaluate as the calling user, plus invite acceptance.
    IF fn.proname NOT IN (
      'is_master','has_business_role','is_business_member','is_business_owner',
      'my_professional_id','accept_professional_invite'
    ) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn.sig);
    END IF;
  END LOOP;
END $$;

-- Non-SECURITY DEFINER trigger functions are not API surface either.
REVOKE ALL ON FUNCTION public.set_updated_at() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_stock_movement() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_double_booking() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_professional_limit() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_booking_allowed() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_tenant_immutable() FROM anon, authenticated;

-- payment_events is written and read only by the billing worker (service role).
COMMENT ON TABLE public.payment_events IS 'Raw provider webhook events. Service-role only by design: RLS enabled with no policies.';
