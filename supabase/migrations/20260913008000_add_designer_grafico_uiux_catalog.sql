-- Global catalog: Graphic Designer and UI/UX services.
BEGIN;

INSERT INTO public.segments (name, slug, description, sort_order)
VALUES (
  'Designer Gráfico e UI/UX',
  'designer-grafico-ui-ux',
  'Identidade visual, materiais gráficos, interfaces digitais e experiência do usuário',
  270
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  active = true,
  updated_at = now();

WITH designer_services(name, description, duration_minutes) AS (
  VALUES
    ('Criação de Logotipo e Identidade Visual', 'Desenvolvimento de logotipo, paleta de cores, tipografia e elementos visuais para construir uma marca consistente.', 240),
    ('Manual de Identidade Visual', 'Documento com regras de aplicação da marca, versões do logotipo, cores, tipografia, área de proteção e usos permitidos.', 240),
    ('Artes para Redes Sociais', 'Criação de posts, stories, capas, anúncios e templates editáveis alinhados à identidade visual da marca.', 120),
    ('Design de Apresentação Comercial', 'Criação de apresentações profissionais para propostas, reuniões, pitch decks e materiais institucionais.', 180),
    ('Design de Materiais Impressos', 'Desenvolvimento de cartões, folders, panfletos, banners, catálogos, cardápios e outros materiais para impressão.', 180),
    ('Criação de Banners e Anúncios Digitais', 'Produção de peças visuais para campanhas em Google, Meta Ads, sites, marketplaces e plataformas digitais.', 120),
    ('Design de Interface UI para Sites e Aplicativos', 'Criação de telas, componentes, grids, estilos visuais e protótipos de alta fidelidade para produtos digitais.', 240),
    ('UX Research e Jornada do Usuário', 'Pesquisa, organização de necessidades, personas, jornada do usuário e identificação de oportunidades de melhoria.', 240),
    ('Wireframes e Prototipagem Interativa', 'Estruturação de fluxos, wireframes e protótipos navegáveis para validar ideias antes do desenvolvimento.', 180),
    ('Auditoria de Usabilidade e Acessibilidade', 'Avaliação de interfaces para encontrar problemas de navegação, clareza, acessibilidade e conversão.', 180),
    ('Design System e Biblioteca de Componentes', 'Organização de cores, tipografia, componentes e padrões reutilizáveis para manter consistência no produto digital.', 300),
    ('Landing Page de Alta Conversão', 'Planejamento visual e criação do layout de uma landing page com hierarquia, chamadas para ação e foco em conversão.', 240),
    ('Redesign de Site ou Aplicativo', 'Atualização visual e estrutural de um produto existente para melhorar aparência, navegação, responsividade e experiência.', 240)
)
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
  d.name,
  d.description,
  'Designer Gráfico e UI/UX',
  0,
  d.duration_minutes,
  NULL,
  false,
  true
FROM designer_services d
JOIN public.segments s ON s.slug = 'designer-grafico-ui-ux' AND s.active
WHERE NOT EXISTS (
  SELECT 1
  FROM public.service_templates existing
  WHERE existing.business_id IS NULL
    AND existing.segment_id = s.id
    AND lower(existing.name) = lower(d.name)
);

COMMIT;
