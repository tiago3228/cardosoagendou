-- Phase 2A: official Instagram profile per business.
-- Additive only: existing businesses remain NULL until configured by their owner.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS instagram_url text;

ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_instagram_url_check,
  ADD CONSTRAINT businesses_instagram_url_check
    CHECK (instagram_url IS NULL OR instagram_url ~ '^https://www\.instagram\.com/[A-Za-z0-9._]{1,30}$');

CREATE OR REPLACE FUNCTION public.public_business(_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', b.id,
    'slug', b.slug,
    'name', b.name,
    'business_type', b.business_type,
    'description', b.description,
    'logo_url', b.logo_url,
    'cover_url', b.cover_url,
    'whatsapp', CASE WHEN b.show_whatsapp THEN b.whatsapp END,
    'address', CASE WHEN b.show_address THEN b.address END,
    'instagram_url', b.instagram_url,
    'booking_policy', b.booking_policy,
    'timezone', b.timezone,
    'slot_interval_minutes', b.slot_interval_minutes,
    'min_notice_minutes', b.min_notice_minutes,
    'max_advance_days', b.max_advance_days,
    'accepts_bookings', public.business_accepts_bookings(b.id)
  )
  FROM public.businesses b
  WHERE b.slug = _slug AND b.active;
$$;
