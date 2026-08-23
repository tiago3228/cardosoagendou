-- Trigger/internal-only functions: nobody may call them through the API.
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_double_booking() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_stock_movement() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_professional_limit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_professional_limit(uuid) FROM PUBLIC, anon, authenticated;

-- Policy helper functions: needed by signed-in users for row-level checks, never by anonymous visitors.
REVOKE ALL ON FUNCTION public.is_master(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_business_role(uuid, uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_business_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_professional_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_master(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_business_role(uuid, uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_business_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_professional_id(uuid) TO authenticated;
