-- Store the business Google review page for post-appointment satisfaction messages.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS google_review_url text;

COMMENT ON COLUMN public.businesses.google_review_url IS
  'Public Google review URL used in post-appointment satisfaction messages';
