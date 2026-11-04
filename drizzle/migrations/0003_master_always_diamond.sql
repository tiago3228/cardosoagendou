CREATE OR REPLACE FUNCTION public.is_master_owned_business(_business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles o
    JOIN public.user_roles m ON m.user_id = o.user_id AND m.role = 'master'
    WHERE o.business_id = _business_id AND o.role = 'owner'
  )
$$;
REVOKE EXECUTE ON FUNCTION public.is_master_owned_business(uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.keep_master_diamond()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_master_owned_business(NEW.id) THEN NEW.diamond_access := true; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_keep_master_diamond ON public.businesses;
CREATE TRIGGER trg_keep_master_diamond BEFORE UPDATE ON public.businesses
FOR EACH ROW EXECUTE FUNCTION public.keep_master_diamond();

CREATE OR REPLACE FUNCTION public.grant_master_diamond_on_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.businesses b SET diamond_access = true
  WHERE b.diamond_access = false AND public.is_master_owned_business(b.id)
    AND b.id IN (SELECT business_id FROM public.user_roles WHERE user_id = NEW.user_id AND business_id IS NOT NULL);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_grant_master_diamond ON public.user_roles;
CREATE TRIGGER trg_grant_master_diamond AFTER INSERT ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.grant_master_diamond_on_role();

UPDATE public.businesses b SET diamond_access = true
WHERE b.diamond_access = false AND public.is_master_owned_business(b.id);