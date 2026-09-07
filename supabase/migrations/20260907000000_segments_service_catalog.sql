-- Segment-based service catalog
-- Additive migration: legacy services remain bookable and receive a default segment.

CREATE TABLE IF NOT EXISTS public.business_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, slug),
  UNIQUE (id, business_id),
  CHECK (length(trim(name)) BETWEEN 1 AND 120),
  CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

CREATE TABLE IF NOT EXISTS public.service_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  service_id uuid,
  segment_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  category text,
  price_cents integer NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  duration_minutes integer NOT NULL DEFAULT 30 CHECK (duration_minutes >= 5),
  image_url text,
  allows_parallel boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, service_id),
  UNIQUE (id, business_id),
  FOREIGN KEY (segment_id, business_id)
    REFERENCES public.business_segments(id, business_id) ON DELETE CASCADE
);

ALTER TABLE public.services ADD COLUMN IF NOT EXISTS segment_id uuid;
ALTER TABLE public.services
  ADD CONSTRAINT services_id_business_key UNIQUE (id, business_id);
ALTER TABLE public.services
  ADD CONSTRAINT services_segment_business_fkey
  FOREIGN KEY (segment_id, business_id)
  REFERENCES public.business_segments(id, business_id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS business_segments_business_idx
  ON public.business_segments(business_id, active, sort_order);
CREATE INDEX IF NOT EXISTS service_templates_segment_idx
  ON public.service_templates(business_id, segment_id, active);
CREATE INDEX IF NOT EXISTS services_segment_idx
  ON public.services(business_id, segment_id, active);

-- Every existing tenant gets a stable legacy bucket. Existing services are not lost.
INSERT INTO public.business_segments (business_id, name, slug, description, sort_order)
SELECT b.id, 'Geral', 'geral', 'Serviços existentes', 0
FROM public.businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM public.business_segments s
  WHERE s.business_id = b.id AND s.slug = 'geral'
);

UPDATE public.services s
SET segment_id = seg.id
FROM public.business_segments seg
WHERE seg.business_id = s.business_id
  AND seg.slug = 'geral'
  AND s.segment_id IS NULL;

INSERT INTO public.service_templates (
  business_id, service_id, segment_id, name, description, category,
  price_cents, duration_minutes, image_url, allows_parallel, active
)
SELECT s.business_id, s.id, s.segment_id, s.name, s.description, s.category,
       s.price_cents, s.duration_minutes, s.image_url, s.allows_parallel, s.active
FROM public.services s
WHERE s.segment_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.service_templates t
    WHERE t.business_id = s.business_id AND t.service_id = s.id
  );

ALTER TABLE public.service_templates
  ADD CONSTRAINT service_templates_service_fkey
  FOREIGN KEY (service_id, business_id) REFERENCES public.services(id, business_id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.business_segment_limit(_business_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result integer;
BEGIN
  SELECT CASE
    WHEN s.status = 'TRIALING' THEN NULL
    WHEN upper(p.code) = 'UNLIMITED' THEN NULL
    WHEN upper(p.code) = 'MEDIUM' THEN 2
    ELSE 1
  END INTO result
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.business_id = _business_id
  ORDER BY s.created_at DESC
  LIMIT 1;
  IF NOT FOUND THEN RETURN 1; END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_business_segment_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  segment_limit integer;
  active_count integer;
BEGIN
  IF NEW.active = false THEN
    RETURN NEW;
  END IF;

  segment_limit := public.business_segment_limit(NEW.business_id);
  IF segment_limit IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO active_count
  FROM public.business_segments s
  WHERE s.business_id = NEW.business_id
    AND s.active
    AND s.id <> NEW.id;

  IF active_count + 1 > segment_limit THEN
    RAISE EXCEPTION 'PLAN_SEGMENT_LIMIT_REACHED: plan allows % active segments', segment_limit;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS business_segments_plan_limit ON public.business_segments;
CREATE TRIGGER business_segments_plan_limit
BEFORE INSERT OR UPDATE OF active ON public.business_segments
FOR EACH ROW EXECUTE FUNCTION public.enforce_business_segment_limit();

CREATE OR REPLACE FUNCTION public.assign_default_service_segment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.segment_id IS NULL THEN
    SELECT id INTO NEW.segment_id
    FROM public.business_segments
    WHERE business_id = NEW.business_id AND slug = 'geral'
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS services_default_segment ON public.services;
CREATE TRIGGER services_default_segment
BEFORE INSERT ON public.services
FOR EACH ROW EXECUTE FUNCTION public.assign_default_service_segment();

CREATE OR REPLACE FUNCTION public.sync_service_template()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.segment_id IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.service_templates (
    business_id, service_id, segment_id, name, description, category,
    price_cents, duration_minutes, image_url, allows_parallel, active
  ) VALUES (
    NEW.business_id, NEW.id, NEW.segment_id, NEW.name, NEW.description, NEW.category,
    NEW.price_cents, NEW.duration_minutes, NEW.image_url, NEW.allows_parallel,
    NEW.active AND NEW.deleted_at IS NULL
  )
  ON CONFLICT (business_id, service_id) DO UPDATE SET
    segment_id = EXCLUDED.segment_id,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    price_cents = EXCLUDED.price_cents,
    duration_minutes = EXCLUDED.duration_minutes,
    image_url = EXCLUDED.image_url,
    allows_parallel = EXCLUDED.allows_parallel,
    active = EXCLUDED.active,
    updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS services_template_sync ON public.services;
CREATE TRIGGER services_template_sync
AFTER INSERT OR UPDATE OF segment_id, name, description, category, price_cents,
  duration_minutes, image_url, allows_parallel, active, deleted_at ON public.services
FOR EACH ROW EXECUTE FUNCTION public.sync_service_template();

CREATE OR REPLACE FUNCTION public.touch_business_segment_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS business_segments_updated ON public.business_segments;
CREATE TRIGGER business_segments_updated
BEFORE UPDATE ON public.business_segments
FOR EACH ROW EXECUTE FUNCTION public.touch_business_segment_updated_at();
DROP TRIGGER IF EXISTS service_templates_updated ON public.service_templates;
CREATE TRIGGER service_templates_updated
BEFORE UPDATE ON public.service_templates
FOR EACH ROW EXECUTE FUNCTION public.touch_business_segment_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_segments TO authenticated;
GRANT ALL ON public.business_segments TO service_role;
ALTER TABLE public.business_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY business_segments_public_read ON public.business_segments
  FOR SELECT TO anon, authenticated
  USING (active AND EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id AND b.active
  ));
CREATE POLICY business_segments_member_read ON public.business_segments
  FOR SELECT TO authenticated
  USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY business_segments_owner_write ON public.business_segments
  FOR ALL TO authenticated
  USING (public.has_business_role(auth.uid(), business_id, 'owner'))
  WITH CHECK (public.has_business_role(auth.uid(), business_id, 'owner'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_templates TO authenticated;
GRANT ALL ON public.service_templates TO service_role;
ALTER TABLE public.service_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_templates_public_read ON public.service_templates
  FOR SELECT TO anon, authenticated
  USING (active AND EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id AND b.active
  ));
CREATE POLICY service_templates_member_read ON public.service_templates
  FOR SELECT TO authenticated
  USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY service_templates_owner_write ON public.service_templates
  FOR ALL TO authenticated
  USING (public.has_business_role(auth.uid(), business_id, 'owner'))
  WITH CHECK (public.has_business_role(auth.uid(), business_id, 'owner'));

COMMENT ON TABLE public.business_segments IS 'Tenant-owned service catalog segments, limited by subscription plan.';
COMMENT ON TABLE public.service_templates IS 'Reusable tenant-owned service definitions associated with a catalog segment.';
COMMENT ON FUNCTION public.business_segment_limit(uuid) IS 'Returns NULL for unlimited segment access, including the full-access trial.';
