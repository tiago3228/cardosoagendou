-- Explicit service composition by IDs. Existing services remain normal services.
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS is_composite boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.service_compositions (
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  composite_service_id uuid NOT NULL,
  component_service_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, composite_service_id, component_service_id),
  CHECK (composite_service_id <> component_service_id),
  FOREIGN KEY (composite_service_id, business_id)
    REFERENCES public.services(id, business_id) ON DELETE CASCADE,
  FOREIGN KEY (component_service_id, business_id)
    REFERENCES public.services(id, business_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS service_compositions_component_idx
  ON public.service_compositions(business_id, component_service_id);

GRANT SELECT ON public.service_compositions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.service_compositions TO authenticated;
GRANT ALL ON public.service_compositions TO service_role;
ALTER TABLE public.service_compositions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_compositions_public_read ON public.service_compositions;
DROP POLICY IF EXISTS service_compositions_member_read ON public.service_compositions;
CREATE POLICY service_compositions_member_read ON public.service_compositions
  FOR SELECT TO authenticated
  USING (public.is_business_member(auth.uid(), business_id));

DROP POLICY IF EXISTS service_compositions_owner_write ON public.service_compositions;
CREATE POLICY service_compositions_owner_write ON public.service_compositions
  FOR ALL TO authenticated
  USING (public.has_business_role(auth.uid(), business_id, 'owner'))
  WITH CHECK (public.has_business_role(auth.uid(), business_id, 'owner'));

CREATE OR REPLACE FUNCTION public.validate_service_composition_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.services
    WHERE id = NEW.composite_service_id AND business_id = NEW.business_id AND is_composite
  ) OR EXISTS (
    SELECT 1 FROM public.services
    WHERE id = NEW.component_service_id AND business_id = NEW.business_id AND is_composite
  ) THEN
    RAISE EXCEPTION 'SERVICE_COMPOSITION_INVALID';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS service_compositions_validate ON public.service_compositions;
CREATE CONSTRAINT TRIGGER service_compositions_validate
  AFTER INSERT OR UPDATE ON public.service_compositions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.validate_service_composition_tenant();

COMMENT ON TABLE public.service_compositions IS
  'Explicit tenant-scoped service composition. Names are never used to infer components.';

CREATE OR REPLACE FUNCTION public.enforce_service_compositions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.appointment_services a
    JOIN public.service_compositions c
      ON c.business_id = NEW.business_id
     AND c.composite_service_id = a.service_id
     AND c.component_service_id = NEW.service_id
    WHERE a.appointment_id = NEW.appointment_id
  ) OR EXISTS (
    SELECT 1
    FROM public.appointment_services a
    JOIN public.service_compositions c
      ON c.business_id = NEW.business_id
     AND c.composite_service_id = NEW.service_id
     AND c.component_service_id = a.service_id
    WHERE a.appointment_id = NEW.appointment_id
  ) THEN
    RAISE EXCEPTION 'SERVICE_COMPOSITION_CONFLICT';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointment_services_compositions ON public.appointment_services;
CREATE CONSTRAINT TRIGGER appointment_services_compositions
  AFTER INSERT ON public.appointment_services
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.enforce_service_compositions();

-- The public catalog function is redefined here only to add the composition projection.
CREATE OR REPLACE FUNCTION public.public_catalog(_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE bid uuid; result jsonb;
BEGIN
  SELECT id INTO bid FROM public.businesses WHERE slug = _slug AND active;
  IF bid IS NULL THEN RETURN NULL; END IF;
  SELECT jsonb_build_object(
    'segments', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', bs.id, 'segment_id', seg.id, 'name', seg.name, 'slug', seg.slug,
      'description', seg.description, 'sort_order', seg.sort_order
    ) ORDER BY seg.sort_order, seg.name) FROM public.business_segments bs
      JOIN public.segments seg ON seg.id = bs.segment_id AND seg.active
      WHERE bs.business_id = bid AND bs.active AND bs.segment_id IS NOT NULL
        AND seg.slug <> 'geral'), '[]'::jsonb),
    'services', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', s.name, 'description', s.description, 'category', s.category,
      'price_cents', s.price_cents, 'duration_minutes', s.duration_minutes,
      'image_url', s.image_url, 'allows_parallel', s.allows_parallel,
      'segment_id', CASE WHEN bs.slug = 'geral' THEN NULL ELSE s.segment_id END
    ) ORDER BY s.category NULLS LAST, s.name) FROM public.services s
      LEFT JOIN public.business_segments bs ON bs.id = s.segment_id
      WHERE s.business_id = bid AND s.active AND s.deleted_at IS NULL), '[]'::jsonb),
    'serviceCompositions', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'composite_service_id', c.composite_service_id,
      'component_service_id', c.component_service_id
    )) FROM public.service_compositions c WHERE c.business_id = bid), '[]'::jsonb),
    'products', CASE WHEN public.business_has_feature(bid, 'inventory') THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', pr.id, 'name', pr.name,
        'price_cents', pr.price_cents, 'stock_quantity', pr.stock_quantity,
        'image_url', pr.image_url) ORDER BY pr.name)
      FROM public.products pr WHERE pr.business_id = bid AND pr.active
        AND pr.deleted_at IS NULL AND pr.stock_quantity > 0), '[]'::jsonb) ELSE '[]'::jsonb END,
    'professionals', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'photo_url', p.photo_url, 'bio', p.bio) ORDER BY p.name)
      FROM public.professionals p WHERE p.business_id = bid AND p.active AND p.deleted_at IS NULL), '[]'::jsonb),
    'links', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'professional_id', ps.professional_id, 'service_id', ps.service_id)
      FROM public.professional_services ps JOIN public.professionals p
      ON p.id = ps.professional_id AND p.active AND p.deleted_at IS NULL
      WHERE ps.business_id = bid), '[]'::jsonb),
    'serviceConflicts', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'service_id', sc.service_id, 'conflicting_service_id', sc.conflicting_service_id,
      'reason', sc.reason) FROM public.service_conflicts sc WHERE sc.business_id = bid), '[]'::jsonb),
    'businessHours', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'weekday', h.weekday, 'opens_at', h.opens_at, 'closes_at', h.closes_at, 'closed', h.closed)
      ORDER BY h.weekday) FROM public.business_hours h WHERE h.business_id = bid), '[]'::jsonb),
    'professionalHours', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'professional_id', ph.professional_id, 'weekday', ph.weekday, 'starts_at', ph.starts_at,
      'ends_at', ph.ends_at, 'enabled', ph.enabled, 'lunch_starts_at', ph.lunch_starts_at,
      'lunch_ends_at', ph.lunch_ends_at) FROM public.professional_hours ph
      JOIN public.professionals p ON p.id = ph.professional_id AND p.active AND p.deleted_at IS NULL
      WHERE ph.business_id = bid), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.public_catalog(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_service_composition(
  _business_id uuid,
  _service_id uuid,
  _is_composite boolean,
  _component_ids uuid[] DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_business_role(auth.uid(), _business_id, 'owner') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.services
    WHERE id = _service_id AND business_id = _business_id
  ) THEN
    RAISE EXCEPTION 'SERVICE_NOT_FOUND';
  END IF;

  IF _is_composite AND EXISTS (
    SELECT 1
    FROM unnest(COALESCE(_component_ids, '{}')) AS component_id
    LEFT JOIN public.services component
      ON component.id = component_id AND component.business_id = _business_id
    WHERE component.id IS NULL
      OR component.id = _service_id
      OR component.is_composite
  ) THEN
    RAISE EXCEPTION 'SERVICE_COMPOSITION_INVALID';
  END IF;

  UPDATE public.services
  SET is_composite = _is_composite, updated_at = now()
  WHERE id = _service_id AND business_id = _business_id;

  DELETE FROM public.service_compositions
  WHERE business_id = _business_id AND composite_service_id = _service_id;

  IF _is_composite THEN
    INSERT INTO public.service_compositions (
      business_id, composite_service_id, component_service_id
    )
    SELECT _business_id, _service_id, component_id
    FROM unnest(COALESCE(_component_ids, '{}')) AS component_id
    GROUP BY component_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_service_composition(uuid, uuid, boolean, uuid[])
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.save_service_composition(uuid, uuid, boolean, uuid[]) FROM PUBLIC, anon;
