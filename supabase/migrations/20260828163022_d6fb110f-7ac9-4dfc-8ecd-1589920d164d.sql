REVOKE ALL ON FUNCTION public.business_entitlements(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_entitlements(uuid) TO authenticated, service_role;