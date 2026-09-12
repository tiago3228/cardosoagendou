-- Agenda alerts are enabled by default for every business.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS agenda_alerts_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.businesses.agenda_alerts_enabled IS
  'Controls whether the owner sees appointment alerts in the authenticated agenda.';
