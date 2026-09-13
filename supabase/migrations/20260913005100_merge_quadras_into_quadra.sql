-- Consolidate the accidental plural catalog segment into the canonical Quadra segment.
BEGIN;

INSERT INTO public.segments (name, slug, description, sort_order, active)
VALUES (
  'Quadra',
  'quadra',
  'Aluguel de quadras e espaços esportivos para partidas recreativas',
  210,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  active = true,
  updated_at = now();

DO $$
DECLARE
  canonical_id uuid;
  duplicate_id uuid;
  business_segment record;
  canonical_business_segment_id uuid;
BEGIN
  SELECT id INTO canonical_id FROM public.segments WHERE slug = 'quadra';
  SELECT id INTO duplicate_id FROM public.segments WHERE slug = 'quadras';

  IF duplicate_id IS NULL OR duplicate_id = canonical_id THEN
    RETURN;
  END IF;

  -- Keep one copy of global templates when both segments have the same name.
  DELETE FROM public.service_templates old_template
  WHERE old_template.business_id IS NULL
    AND old_template.segment_id = duplicate_id
    AND EXISTS (
      SELECT 1
      FROM public.service_templates canonical_template
      WHERE canonical_template.business_id IS NULL
        AND canonical_template.segment_id = canonical_id
        AND lower(canonical_template.name) = lower(old_template.name)
    );

  UPDATE public.service_templates
  SET segment_id = canonical_id,
      updated_at = now()
  WHERE business_id IS NULL
    AND segment_id = duplicate_id;

  FOR business_segment IN
    SELECT id, business_id
    FROM public.business_segments
    WHERE segment_id = duplicate_id
  LOOP
    SELECT id INTO canonical_business_segment_id
    FROM public.business_segments
    WHERE business_id = business_segment.business_id
      AND segment_id = canonical_id
    LIMIT 1;

    IF canonical_business_segment_id IS NULL THEN
      UPDATE public.business_segments
      SET segment_id = canonical_id,
          name = 'Quadra',
          slug = 'quadra',
          description = 'Aluguel de quadras e espaços esportivos para partidas recreativas',
          updated_at = now()
      WHERE id = business_segment.id;
    ELSE
      UPDATE public.service_templates
      SET segment_id = canonical_business_segment_id,
          updated_at = now()
      WHERE business_id = business_segment.business_id
        AND segment_id = business_segment.id;

      UPDATE public.services
      SET segment_id = canonical_business_segment_id
      WHERE business_id = business_segment.business_id
        AND segment_id = business_segment.id;

      DELETE FROM public.business_segments
      WHERE id = business_segment.id;
    END IF;
  END LOOP;

  DELETE FROM public.segments WHERE id = duplicate_id;
END $$;

COMMIT;
