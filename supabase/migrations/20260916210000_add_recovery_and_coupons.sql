-- Configuração de recuperação por empresa.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS client_recovery_days integer NOT NULL DEFAULT 60
    CHECK (client_recovery_days BETWEEN 1 AND 3650);

-- Cupons pertencem exclusivamente a uma empresa.
CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  code text NOT NULL,
  discount_percent numeric(5,2) NOT NULL CHECK (discount_percent > 0 AND discount_percent <= 100),
  starts_at date NOT NULL DEFAULT CURRENT_DATE,
  expires_at date,
  active boolean NOT NULL DEFAULT true,
  single_use_per_client boolean NOT NULL DEFAULT false,
  usage_limit integer CHECK (usage_limit IS NULL OR usage_limit > 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, code),
  CHECK (expires_at IS NULL OR expires_at >= starts_at)
);

CREATE TABLE IF NOT EXISTS public.coupon_usages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  discount_percent numeric(5,2) NOT NULL CHECK (discount_percent > 0 AND discount_percent <= 100),
  original_amount_cents integer NOT NULL CHECK (original_amount_cents >= 0),
  discount_amount_cents integer NOT NULL CHECK (discount_amount_cents >= 0),
  final_amount_cents integer NOT NULL CHECK (final_amount_cents >= 0),
  used_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coupons_business_active_idx ON public.coupons (business_id, active, expires_at);
CREATE INDEX IF NOT EXISTS coupon_usages_coupon_idx ON public.coupon_usages (coupon_id, used_at DESC);
CREATE INDEX IF NOT EXISTS coupon_usages_client_idx ON public.coupon_usages (business_id, client_id, coupon_id);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_usages ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO authenticated;
GRANT SELECT ON public.coupon_usages TO authenticated;
GRANT ALL ON public.coupons, public.coupon_usages TO service_role;

DROP POLICY IF EXISTS coupons_member_read ON public.coupons;
CREATE POLICY coupons_member_read ON public.coupons FOR SELECT TO authenticated
  USING (public.is_business_member(auth.uid(), business_id));
DROP POLICY IF EXISTS coupons_owner_write ON public.coupons;
CREATE POLICY coupons_owner_write ON public.coupons FOR ALL TO authenticated
  USING (public.has_business_role(auth.uid(), business_id, 'owner'))
  WITH CHECK (public.has_business_role(auth.uid(), business_id, 'owner'));

DROP POLICY IF EXISTS coupon_usages_member_read ON public.coupon_usages;
CREATE POLICY coupon_usages_member_read ON public.coupon_usages FOR SELECT TO authenticated
  USING (public.is_business_member(auth.uid(), business_id));

CREATE OR REPLACE FUNCTION public.normalize_coupon_code(input text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT upper(regexp_replace(trim(input), '[^A-Z0-9_-]', '', 'gi'));
$$;

CREATE OR REPLACE FUNCTION public.set_coupon_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.code := public.normalize_coupon_code(NEW.code);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS coupons_updated ON public.coupons;
CREATE TRIGGER coupons_updated BEFORE INSERT OR UPDATE ON public.coupons
FOR EACH ROW EXECUTE FUNCTION public.set_coupon_updated_at();
