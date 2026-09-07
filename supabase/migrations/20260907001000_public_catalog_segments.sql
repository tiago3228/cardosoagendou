-- Expose only active, tenant-scoped segment metadata in the existing public catalog RPC.
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
    'segments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', seg.id, 'name', seg.name, 'slug', seg.slug,
        'description', seg.description, 'sort_order', seg.sort_order
      ) ORDER BY seg.sort_order, seg.name)
      FROM public.business_segments seg
      WHERE seg.business_id = bid AND seg.active
    ), '[]'::jsonb),
    'services', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'description', s.description,
        'category', s.category, 'price_cents', s.price_cents,
        'duration_minutes', s.duration_minutes, 'image_url', s.image_url,
        'allows_parallel', s.allows_parallel, 'segment_id', s.segment_id
      ) ORDER BY s.category NULLS LAST, s.name)
      FROM public.services s
      WHERE s.business_id = bid AND s.active AND s.deleted_at IS NULL
    ), '[]'::jsonb),
    'products', CASE WHEN public.business_has_feature(bid, 'inventory') THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pr.id, 'name', pr.name, 'price_cents', pr.price_cents,
        'stock_quantity', pr.stock_quantity, 'image_url', pr.image_url
      ) ORDER BY pr.name)
      FROM public.products pr
      WHERE pr.business_id = bid AND pr.active AND pr.deleted_at IS NULL AND pr.stock_quantity > 0
    ), '[]'::jsonb) ELSE '[]'::jsonb END,
    'professionals', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'photo_url', p.photo_url, 'bio', p.bio
      ) ORDER BY p.name)
      FROM public.professionals p
      WHERE p.business_id = bid AND p.active AND p.deleted_at IS NULL
    ), '[]'::jsonb),
    'links', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'professional_id', ps.professional_id, 'service_id', ps.service_id
      ))
      FROM public.professional_services ps
      JOIN public.professionals p ON p.id = ps.professional_id AND p.active AND p.deleted_at IS NULL
      WHERE ps.business_id = bid
    ), '[]'::jsonb),
    'serviceConflicts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'service_id', sc.service_id,
        'conflicting_service_id', sc.conflicting_service_id,
        'reason', sc.reason
      ))
      FROM public.service_conflicts sc WHERE sc.business_id = bid
    ), '[]'::jsonb),
    'businessHours', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'weekday', h.weekday, 'opens_at', h.opens_at,
        'closes_at', h.closes_at, 'closed', h.closed
      ) ORDER BY h.weekday)
      FROM public.business_hours h WHERE h.business_id = bid
    ), '[]'::jsonb),
    'professionalHours', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'professional_id', ph.professional_id, 'weekday', ph.weekday,
        'starts_at', ph.starts_at, 'ends_at', ph.ends_at,
        'enabled', ph.enabled, 'lunch_starts_at', ph.lunch_starts_at,
        'lunch_ends_at', ph.lunch_ends_at
      ))
      FROM public.professional_hours ph
      JOIN public.professionals p ON p.id = ph.professional_id AND p.active AND p.deleted_at IS NULL
      WHERE ph.business_id = bid
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;
