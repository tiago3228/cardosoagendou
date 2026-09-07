-- Corrective integrity migration for the global catalog.
-- Preserves existing rows and rejects only future invalid associations.
BEGIN;

-- A business may only activate a commercial segment that exists in the
-- global catalog and is currently active. The technical legacy bucket Geral
-- has segment_id NULL and is therefore intentionally outside this rule.
CREATE OR REPLACE FUNCTION public.validate_business_segment_global()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  global_segment_active boolean;
BEGIN
  IF NEW.segment_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.active
    INTO global_segment_active
  FROM public.segments AS s
  WHERE s.id = NEW.segment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SEGMENT_NOT_FOUND';
  END IF;

  IF NOT global_segment_active THEN
    IF TG_OP = 'INSERT' OR NEW.active THEN
      RAISE EXCEPTION 'SEGMENT_NOT_ACTIVE_FOR_BUSINESS';
    ELSIF NEW.segment_id IS DISTINCT FROM OLD.segment_id THEN
      RAISE EXCEPTION 'SEGMENT_NOT_ACTIVE_FOR_BUSINESS';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS business_segments_validate_global ON public.business_segments;
CREATE TRIGGER business_segments_validate_global
BEFORE INSERT OR UPDATE OF business_id, segment_id, active
ON public.business_segments
FOR EACH ROW
EXECUTE FUNCTION public.validate_business_segment_global();

-- Keep the existing business/segment uniqueness protection explicit and
-- idempotent. NULL segment_id remains valid for the legacy Geral bucket.
CREATE UNIQUE INDEX IF NOT EXISTS business_segments_business_segment_uidx
  ON public.business_segments (business_id, segment_id)
  WHERE segment_id IS NOT NULL;

-- professional_services has independent foreign keys to the three tables,
-- but those keys alone do not guarantee tenant consistency. Validate the
-- complete tuple before every insert or update.
CREATE OR REPLACE FUNCTION public.validate_professional_service_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  professional_business_id uuid;
  service_business_id uuid;
BEGIN
  SELECT p.business_id
    INTO professional_business_id
  FROM public.professionals AS p
  WHERE p.id = NEW.professional_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFESSIONAL_NOT_FOUND';
  END IF;

  SELECT s.business_id
    INTO service_business_id
  FROM public.services AS s
  WHERE s.id = NEW.service_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_NOT_FOUND';
  END IF;

  IF professional_business_id <> NEW.business_id
     OR service_business_id <> NEW.business_id THEN
    RAISE EXCEPTION 'PROFESSIONAL_SERVICE_TENANT_MISMATCH';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS professional_services_validate_tenant
  ON public.professional_services;
CREATE TRIGGER professional_services_validate_tenant
BEFORE INSERT OR UPDATE OF professional_id, service_id, business_id
ON public.professional_services
FOR EACH ROW
EXECUTE FUNCTION public.validate_professional_service_tenant();

COMMIT;
