ALTER TABLE public.services ADD COLUMN IF NOT EXISTS requires_deposit boolean NOT NULL DEFAULT false;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS pix_key text;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS deposit_cents integer NOT NULL DEFAULT 0;