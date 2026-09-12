-- Configurable appointment confirmation messages.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS confirmation_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS confirmation_minutes integer NOT NULL DEFAULT 0
    CHECK (confirmation_minutes BETWEEN 0 AND 10080);

COMMENT ON COLUMN public.businesses.confirmation_enabled IS
  'When true, confirming an appointment queues a WhatsApp confirmation message.';
COMMENT ON COLUMN public.businesses.confirmation_minutes IS
  'Minutes before the appointment when the queued confirmation becomes available. Zero means immediately.';
