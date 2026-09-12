-- Orçamentos e itens opcionais "O que está incluso?".
CREATE TABLE IF NOT EXISTS public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  customer_name text NOT NULL DEFAULT '',
  customer_phone text,
  customer_email text,
  quote_number text NOT NULL,
  title text NOT NULL DEFAULT 'Orçamento',
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  valid_until date,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','VALID','EXPIRED')),
  subtotal_cents integer NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  discount_cents integer NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  total_cents integer NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, quote_number)
);

CREATE TABLE IF NOT EXISTS public.quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  quantity numeric(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_cents integer NOT NULL DEFAULT 0 CHECK (unit_price_cents >= 0),
  total_cents integer NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  is_custom boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.quote_inclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (length(trim(label)) > 0),
  is_custom boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0
);

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_inclusions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes, public.quote_items, public.quote_inclusions TO authenticated;
GRANT ALL ON public.quotes, public.quote_items, public.quote_inclusions TO service_role;

DROP POLICY IF EXISTS quotes_owner_all ON public.quotes;
CREATE POLICY quotes_owner_all ON public.quotes FOR ALL TO authenticated
  USING (public.has_business_role(auth.uid(), business_id, 'owner'))
  WITH CHECK (public.has_business_role(auth.uid(), business_id, 'owner'));
DROP POLICY IF EXISTS quote_items_owner_all ON public.quote_items;
CREATE POLICY quote_items_owner_all ON public.quote_items FOR ALL TO authenticated
  USING (public.has_business_role(auth.uid(), business_id, 'owner'))
  WITH CHECK (public.has_business_role(auth.uid(), business_id, 'owner'));
DROP POLICY IF EXISTS quote_inclusions_owner_all ON public.quote_inclusions;
CREATE POLICY quote_inclusions_owner_all ON public.quote_inclusions FOR ALL TO authenticated
  USING (public.has_business_role(auth.uid(), business_id, 'owner'))
  WITH CHECK (public.has_business_role(auth.uid(), business_id, 'owner'));

CREATE OR REPLACE FUNCTION public.set_quote_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS quotes_updated ON public.quotes;
CREATE TRIGGER quotes_updated BEFORE UPDATE ON public.quotes
FOR EACH ROW EXECUTE FUNCTION public.set_quote_updated_at();
