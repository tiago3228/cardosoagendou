REVOKE EXECUTE ON FUNCTION public.reconcile_subscriptions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_subscriptions() TO service_role;

REVOKE EXECUTE ON FUNCTION public.guard_appointment_professional_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_professional_self_update() FROM PUBLIC, anon, authenticated;