-- Add the Videomaker segment to the global service catalog.
-- Idempotent: safe to execute manually in the Lovable SQL Editor.
BEGIN;

INSERT INTO public.segments (name, slug, description, sort_order, active)
VALUES (
  'Videomaker',
  'videomaker',
  'Produção, gravação e edição de vídeos para marcas, eventos e redes sociais',
  210,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  active = true,
  updated_at = now();

INSERT INTO public.service_templates (
  business_id,
  service_id,
  segment_id,
  name,
  description,
  category,
  price_cents,
  duration_minutes,
  image_url,
  allows_parallel,
  active
)
SELECT
  NULL,
  NULL,
  s.id,
  v.name,
  v.description,
  v.category,
  0,
  v.duration_minutes,
  NULL,
  false,
  true
FROM public.segments s
CROSS JOIN (
  VALUES
    ('Gravação de vídeo para redes sociais', 'Captação vertical para Instagram, TikTok e Shorts', 'Redes sociais', 60),
    ('Reels profissional', 'Gravação e captação de um vídeo curto para redes sociais', 'Redes sociais', 60),
    ('Vídeo para YouTube', 'Captação de conteúdo para canal e publicação no YouTube', 'Conteúdo digital', 120),
    ('Vídeo institucional', 'Apresentação audiovisual da empresa, marca ou negócio', 'Institucional', 180),
    ('Vídeo de produto', 'Captação de produto para divulgação e vendas', 'Publicidade', 120),
    ('Vídeo imobiliário', 'Filmagem de imóvel para anúncio e divulgação', 'Imobiliário', 120),
    ('Captação de depoimento', 'Gravação de depoimento de cliente, equipe ou especialista', 'Institucional', 90),
    ('Cobertura de evento', 'Registro audiovisual de evento corporativo ou social', 'Eventos', 240),
    ('Filmagem de casamento', 'Cobertura audiovisual de cerimônia e celebração', 'Eventos', 480),
    ('Ensaio audiovisual', 'Sessão planejada de gravação com direção e captação', 'Produção', 120),
    ('Edição de vídeo', 'Montagem, cortes, trilha e finalização de material existente', 'Pós-produção', 120),
    ('Motion graphics', 'Animações, títulos e elementos gráficos para vídeo', 'Pós-produção', 180),
    ('Captação com drone', 'Filmagem aérea com drone, conforme condições e autorização', 'Captação', 120),
    ('Live streaming', 'Operação e transmissão ao vivo para plataformas digitais', 'Transmissão', 240),
    ('Pacote mensal de conteúdo', 'Produção recorrente de vídeos para redes sociais', 'Planos recorrentes', 480)
) AS v(name, description, category, duration_minutes)
WHERE s.slug = 'videomaker'
  AND s.active
  AND NOT EXISTS (
    SELECT 1
    FROM public.service_templates st
    WHERE st.business_id IS NULL
      AND st.segment_id = s.id
      AND lower(st.name) = lower(v.name)
  );

COMMIT;
