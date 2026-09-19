-- Allow each business to control whether its Instagram appears on the public booking page.
BEGIN;

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS show_instagram boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.public_business(_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'id', b.id, 'slug', b.slug, 'name', b.name, 'business_type', b.business_type,
    'description', b.description, 'logo_url', b.logo_url, 'cover_url', b.cover_url,
    'whatsapp', CASE WHEN b.show_whatsapp THEN b.whatsapp END,
    'address', CASE WHEN b.show_address THEN b.address END,
    'instagram_url', CASE WHEN b.show_instagram THEN b.instagram_url END,
    'booking_policy', b.booking_policy,
    'timezone', b.timezone, 'slot_interval_minutes', b.slot_interval_minutes,
    'min_notice_minutes', b.min_notice_minutes, 'max_advance_days', b.max_advance_days,
    'accepts_bookings', public.business_accepts_bookings(b.id),
    'cancellation_deadline_hours', COALESCE(b.cancellation_deadline_hours, 1),
    'primary_color', COALESCE(b.primary_color, '#B4884F'),
    'secondary_color', COALESCE(b.secondary_color, '#14120F')
  )
  FROM public.businesses b
  WHERE b.slug = _slug AND b.active;
$function$;

COMMIT;
