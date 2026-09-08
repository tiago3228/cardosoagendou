ALTER TABLE public.service_templates
  ADD COLUMN IF NOT EXISTS component_template_ids uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.service_templates.component_template_ids IS 'Templates de serviços avulsos que compõem este combo do catálogo.';

-- Barbearia: renomeações e novo serviço avulso
UPDATE public.service_templates SET name = 'Corte Masculino'
  WHERE business_id IS NULL AND id = 'bcdeac5b-9ec2-4c5c-9835-926b3036e6a6';
UPDATE public.service_templates SET name = 'Corte Masculino + Barba', category = 'Combos'
  WHERE business_id IS NULL AND id = 'b2c05036-8af0-4464-a7a3-352a17eb3acd';
UPDATE public.service_templates SET name = 'Corte Masculino + Barba + Sobrancelha', category = 'Combos'
  WHERE business_id IS NULL AND id = '44586930-ca13-40b9-9faf-2e5e494e1e4f';
UPDATE public.service_templates SET name = 'Corte Masculino + Pigmentação', category = 'Combos'
  WHERE business_id IS NULL AND id = 'c39ef824-ab53-49a2-b39b-e55f7291850a';

INSERT INTO public.service_templates (segment_id, name, category, price_cents, duration_minutes, active)
SELECT '0c1a4826-733c-4830-a740-a5c6d0596395', 'Corte Feminino', 'Cabelo', 0, 45, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.service_templates
  WHERE business_id IS NULL
    AND segment_id = '0c1a4826-733c-4830-a740-a5c6d0596395'
    AND lower(name) = 'corte feminino'
);

-- Composição dos combos de barbearia (por ID de template)
UPDATE public.service_templates SET component_template_ids = ARRAY[
  'bcdeac5b-9ec2-4c5c-9835-926b3036e6a6'::uuid, '15f500d3-34b3-446a-934d-e9881e2aeadb'::uuid
] WHERE id = 'b2c05036-8af0-4464-a7a3-352a17eb3acd';

UPDATE public.service_templates SET component_template_ids = ARRAY[
  'bcdeac5b-9ec2-4c5c-9835-926b3036e6a6'::uuid, '15f500d3-34b3-446a-934d-e9881e2aeadb'::uuid,
  '23aa6d8e-ec61-4ae3-af8e-6207660296f1'::uuid
] WHERE id = '44586930-ca13-40b9-9faf-2e5e494e1e4f';

UPDATE public.service_templates SET component_template_ids = ARRAY[
  'bcdeac5b-9ec2-4c5c-9835-926b3036e6a6'::uuid, '8fc9a692-f817-4aeb-9d29-7106c13b99a0'::uuid
] WHERE id = 'c39ef824-ab53-49a2-b39b-e55f7291850a';

-- Novo segmento Psicoterapia
INSERT INTO public.segments (name, slug, description, sort_order, active)
SELECT 'Psicoterapia', 'psicoterapia', 'Abordagens e modalidades de psicoterapia', 21, true
WHERE NOT EXISTS (SELECT 1 FROM public.segments WHERE slug = 'psicoterapia');

INSERT INTO public.service_templates (segment_id, name, category, price_cents, duration_minutes, active)
SELECT s.id, v.name, 'Psicoterapia', 0, 50, true
FROM public.segments s
CROSS JOIN (VALUES
  ('Terapia Cognitivo-Comportamental (TCC)'),
  ('Psicanálise'),
  ('Psicoterapia Junguiana'),
  ('Terapia Gestalt'),
  ('Behaviorismo (Análise do Comportamento)'),
  ('Psicodrama'),
  ('Psicologia Positiva'),
  ('Humanismo'),
  ('Abordagem Integrada'),
  ('Hipnoterapia'),
  ('Experiência Somática'),
  ('Brainspotting'),
  ('EMDR (Dessensibilização e Reprocessamento por Movimentos Oculares)'),
  ('Logoterapia'),
  ('Fenomenológico-Existencial'),
  ('Terapia Comportamental Dialética (DBT)'),
  ('Terapia de Aceitação e Compromisso (ACT)'),
  ('Terapia Familiar Sistêmica'),
  ('Psicoterapia em Grupo'),
  ('Psicoterapia Lacaniana')
) AS v(name)
WHERE s.slug = 'psicoterapia'
  AND NOT EXISTS (
    SELECT 1 FROM public.service_templates t
    WHERE t.business_id IS NULL AND t.segment_id = s.id AND lower(t.name) = lower(v.name)
  );

-- Copiar serviços do catálogo agora também cria as composições dos combos
CREATE OR REPLACE FUNCTION public.copy_catalog_services(_business_id uuid, _segment_id uuid, _template_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  copied integer;
  business_segment_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_business_role(auth.uid(), _business_id, 'owner') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT id INTO business_segment_id
  FROM public.business_segments
  WHERE business_id = _business_id
    AND segment_id = _segment_id
    AND active;

  IF business_segment_id IS NULL THEN
    RAISE EXCEPTION 'SEGMENT_NOT_ACTIVE_FOR_BUSINESS';
  END IF;

  INSERT INTO public.services (
    business_id, name, description, category, price_cents,
    duration_minutes, image_url, allows_parallel, active, segment_id
  )
  SELECT _business_id, t.name, t.description, t.category, t.price_cents,
         t.duration_minutes, t.image_url, t.allows_parallel, true, business_segment_id
  FROM public.service_templates t
  WHERE t.id = ANY(_template_ids)
    AND t.business_id IS NULL
    AND t.segment_id = _segment_id
    AND t.active
    AND NOT EXISTS (
      SELECT 1 FROM public.services existing
      WHERE existing.business_id = _business_id
        AND existing.segment_id = business_segment_id
        AND lower(existing.name) = lower(t.name)
        AND existing.deleted_at IS NULL
    );

  GET DIAGNOSTICS copied = ROW_COUNT;

  -- Reconstroi as composições dos combos copiados, casando por nome do template
  WITH combo AS (
    SELECT t.id AS template_id, t.component_template_ids, s.id AS service_id
    FROM public.service_templates t
    JOIN public.services s
      ON s.business_id = _business_id
     AND s.segment_id = business_segment_id
     AND lower(s.name) = lower(t.name)
     AND s.deleted_at IS NULL
    WHERE t.business_id IS NULL
      AND t.segment_id = _segment_id
      AND array_length(t.component_template_ids, 1) > 0
  ), pairs AS (
    SELECT combo.service_id AS composite_service_id, cs.id AS component_service_id
    FROM combo
    JOIN public.service_templates ct ON ct.id = ANY(combo.component_template_ids)
    JOIN public.services cs
      ON cs.business_id = _business_id
     AND cs.segment_id = business_segment_id
     AND lower(cs.name) = lower(ct.name)
     AND cs.deleted_at IS NULL
  ), cleaned AS (
    DELETE FROM public.service_compositions sc
    WHERE sc.business_id = _business_id
      AND sc.composite_service_id IN (SELECT composite_service_id FROM pairs)
    RETURNING 1
  )
  INSERT INTO public.service_compositions (business_id, composite_service_id, component_service_id)
  SELECT _business_id, composite_service_id, component_service_id
  FROM pairs
  WHERE (SELECT count(*) FROM cleaned) >= 0
  ON CONFLICT DO NOTHING;

  UPDATE public.services s
  SET is_composite = true, updated_at = now()
  WHERE s.business_id = _business_id
    AND s.id IN (SELECT composite_service_id FROM public.service_compositions WHERE business_id = _business_id)
    AND s.is_composite IS NOT TRUE;

  RETURN copied;
END;
$function$;

-- Exclusão de segmento do negócio
CREATE OR REPLACE FUNCTION public.delete_business_segment(_business_id uuid, _business_segment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  archived integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_business_role(auth.uid(), _business_id, 'owner') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.business_segments
    WHERE id = _business_segment_id AND business_id = _business_id AND slug <> 'geral'
  ) THEN
    RAISE EXCEPTION 'SEGMENT_NOT_FOUND';
  END IF;

  DELETE FROM public.service_compositions sc
  WHERE sc.business_id = _business_id
    AND (sc.composite_service_id IN (
          SELECT id FROM public.services
          WHERE business_id = _business_id AND segment_id = _business_segment_id)
      OR sc.component_service_id IN (
          SELECT id FROM public.services
          WHERE business_id = _business_id AND segment_id = _business_segment_id));

  UPDATE public.services
  SET deleted_at = now(), active = false, segment_id = NULL, updated_at = now()
  WHERE business_id = _business_id AND segment_id = _business_segment_id;
  GET DIAGNOSTICS archived = ROW_COUNT;

  DELETE FROM public.business_segments
  WHERE id = _business_segment_id AND business_id = _business_id;

  RETURN jsonb_build_object('archived_services', archived);
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_business_segment(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_business_segment(uuid, uuid) TO authenticated;