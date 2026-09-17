-- Move the ten course subsegments into the single Cursos global segment.
BEGIN;

INSERT INTO public.segments (name, slug, description, sort_order, active)
VALUES (
  'Cursos',
  'cursos',
  'Cursos, formações, aulas e treinamentos profissionais',
  220,
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
  old_id uuid;
  old_slug text;
  business_segment record;
  canonical_business_segment_id uuid;
  old_slugs text[] := ARRAY[
    'cursos-de-beleza-e-estetica',
    'cursos-de-design',
    'cursos-de-financas-e-negocios',
    'cursos-de-gastronomia',
    'cursos-de-idiomas',
    'cursos-de-marketing-e-vendas',
    'cursos-de-musica-e-artes',
    'cursos-de-tecnologia-e-programacao',
    'cursos-preparatorios',
    'cursos-profissionalizantes'
  ];
BEGIN
  SELECT id INTO canonical_id FROM public.segments WHERE slug = 'cursos';

  FOREACH old_slug IN ARRAY old_slugs LOOP
    SELECT id INTO old_id FROM public.segments WHERE slug = old_slug;

    IF old_id IS NULL OR old_id = canonical_id THEN
      CONTINUE;
    END IF;

    DELETE FROM public.service_templates old_template
    WHERE old_template.business_id IS NULL
      AND old_template.segment_id = old_id
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
      AND segment_id = old_id;

    FOR business_segment IN
      SELECT id, business_id
      FROM public.business_segments
      WHERE segment_id = old_id
    LOOP
      SELECT id INTO canonical_business_segment_id
      FROM public.business_segments
      WHERE business_id = business_segment.business_id
        AND segment_id = canonical_id
      LIMIT 1;

      IF canonical_business_segment_id IS NULL THEN
        UPDATE public.business_segments
        SET segment_id = canonical_id,
            name = 'Cursos',
            slug = 'cursos',
            description = 'Cursos, formações, aulas e treinamentos profissionais',
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

    DELETE FROM public.segments WHERE id = old_id;
  END LOOP;
END $$;

WITH course_services(name, category, description, duration_minutes) AS (
  VALUES
    ('Cursos de Beleza e Estética', 'Cursos', 'Cursos de cabeleireiro, maquiagem, unhas, estética e cuidados pessoais.', 180),
    ('Cursos de Design', 'Cursos', 'Cursos de design gráfico, UI/UX, ferramentas criativas e comunicação visual.', 180),
    ('Cursos de Finanças e Negócios', 'Cursos', 'Cursos de finanças, empreendedorismo, gestão e planejamento empresarial.', 180),
    ('Cursos de Gastronomia', 'Cursos', 'Cursos de culinária, confeitaria, panificação e técnicas de cozinha.', 180),
    ('Cursos de Idiomas', 'Cursos', 'Cursos e aulas de idiomas para diferentes níveis e objetivos.', 180),
    ('Cursos de Marketing e Vendas', 'Cursos', 'Cursos de marketing digital, vendas, atendimento e crescimento de negócios.', 180),
    ('Cursos de Música e Artes', 'Cursos', 'Cursos de instrumentos, canto, produção artística e expressão criativa.', 180),
    ('Cursos de Tecnologia e Programação', 'Cursos', 'Cursos de programação, ferramentas digitais, dados e desenvolvimento tecnológico.', 180),
    ('Cursos Preparatórios', 'Cursos', 'Cursos para provas, concursos, vestibulares e certificações.', 180),
    ('Cursos Profissionalizantes', 'Cursos', 'Formações práticas para desenvolvimento profissional e entrada no mercado.', 180)
)
INSERT INTO public.service_templates (
  business_id, service_id, segment_id, name, description, category,
  price_cents, duration_minutes, image_url, allows_parallel, active
)
SELECT NULL, NULL, s.id, c.name, c.description, c.category,
       0, c.duration_minutes, NULL, false, true
FROM course_services c
JOIN public.segments s ON s.slug = 'cursos' AND s.active
WHERE NOT EXISTS (
  SELECT 1
  FROM public.service_templates existing
  WHERE existing.business_id IS NULL
    AND existing.segment_id = s.id
    AND lower(existing.name) = lower(c.name)
);

COMMIT;
