ALTER TABLE public.services ADD COLUMN IF NOT EXISTS allows_parallel boolean NOT NULL DEFAULT false;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS blocks_agenda boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.services.allows_parallel IS 'Service can be performed while the professional attends another client (e.g. hair straightening waiting time).';
COMMENT ON COLUMN public.appointments.blocks_agenda IS 'False when every selected service allows parallel work: the appointment does not occupy the professional agenda.';

CREATE OR REPLACE FUNCTION public.prevent_double_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.status IN ('CANCELED','NO_SHOW') THEN RETURN NEW; END IF;
  IF NEW.blocks_agenda IS NOT TRUE THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.professional_id = NEW.professional_id
      AND a.id <> NEW.id
      AND a.status NOT IN ('CANCELED','NO_SHOW')
      AND a.blocks_agenda IS TRUE
      AND a.starts_at < NEW.ends_at
      AND a.ends_at > NEW.starts_at
  ) THEN
    RAISE EXCEPTION 'DOUBLE_BOOKING: professional already has an appointment in this time range';
  END IF;
  RETURN NEW;
END; $function$;
REVOKE ALL ON FUNCTION public.prevent_double_booking() FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_busy(_slug text, _from timestamptz, _to timestamptz)
RETURNS TABLE(professional_id uuid, starts_at timestamptz, ends_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT a.professional_id, a.starts_at, a.ends_at
  FROM public.appointments a
  JOIN public.businesses b ON b.id = a.business_id AND b.slug = _slug AND b.active
  WHERE a.status NOT IN ('CANCELED','NO_SHOW')
    AND a.blocks_agenda IS TRUE
    AND a.starts_at < _to
    AND a.ends_at > _from
$function$;
GRANT EXECUTE ON FUNCTION public.public_busy(text, timestamptz, timestamptz) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_catalog(_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE bid uuid; result jsonb;
BEGIN
  SELECT id INTO bid FROM public.businesses WHERE slug = _slug AND active;
  IF bid IS NULL THEN RETURN NULL; END IF;

  SELECT jsonb_build_object(
    'services', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'description', s.description,
        'category', s.category, 'price_cents', s.price_cents, 'duration_minutes', s.duration_minutes,
        'image_url', s.image_url, 'allows_parallel', s.allows_parallel) ORDER BY s.category NULLS LAST, s.name)
      FROM public.services s
      WHERE s.business_id = bid AND s.active AND s.deleted_at IS NULL), '[]'::jsonb),
    'products', CASE WHEN public.business_has_feature(bid, 'inventory') THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', pr.id, 'name', pr.name, 'price_cents', pr.price_cents,
        'stock_quantity', pr.stock_quantity, 'image_url', pr.image_url) ORDER BY pr.name)
      FROM public.products pr
      WHERE pr.business_id = bid AND pr.active AND pr.deleted_at IS NULL AND pr.stock_quantity > 0), '[]'::jsonb)
      ELSE '[]'::jsonb END,
    'professionals', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'photo_url', p.photo_url,
        'bio', p.bio) ORDER BY p.name)
      FROM public.professionals p
      WHERE p.business_id = bid AND p.active AND p.deleted_at IS NULL), '[]'::jsonb),
    'links', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('professional_id', ps.professional_id, 'service_id', ps.service_id))
      FROM public.professional_services ps
      JOIN public.professionals p ON p.id = ps.professional_id AND p.active AND p.deleted_at IS NULL
      WHERE ps.business_id = bid), '[]'::jsonb),
    'serviceConflicts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('service_id', sc.service_id,
        'conflicting_service_id', sc.conflicting_service_id, 'reason', sc.reason))
      FROM public.service_conflicts sc WHERE sc.business_id = bid), '[]'::jsonb),
    'businessHours', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('weekday', h.weekday, 'opens_at', h.opens_at,
        'closes_at', h.closes_at, 'closed', h.closed) ORDER BY h.weekday)
      FROM public.business_hours h WHERE h.business_id = bid), '[]'::jsonb),
    'professionalHours', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('professional_id', ph.professional_id, 'weekday', ph.weekday,
        'starts_at', ph.starts_at, 'ends_at', ph.ends_at, 'enabled', ph.enabled,
        'lunch_starts_at', ph.lunch_starts_at, 'lunch_ends_at', ph.lunch_ends_at))
      FROM public.professional_hours ph WHERE ph.business_id = bid), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END; $function$;
GRANT EXECUTE ON FUNCTION public.public_catalog(text) TO anon, authenticated;