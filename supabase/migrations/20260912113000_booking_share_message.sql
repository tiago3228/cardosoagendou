ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS booking_share_message text,
  ADD COLUMN IF NOT EXISTS booking_share_niche text,
  ADD COLUMN IF NOT EXISTS booking_share_style text NOT NULL DEFAULT 'professional';

COMMENT ON COLUMN public.businesses.booking_share_message IS
  'Custom message shown with the public booking link when the owner shares it.';
COMMENT ON COLUMN public.businesses.booking_share_niche IS
  'Niche selected for the booking-link message generator.';
COMMENT ON COLUMN public.businesses.booking_share_style IS
  'Style selected for the booking-link message generator.';
