-- Global catalog: Programador segment and software development services.
BEGIN;

INSERT INTO public.segments (name, slug, description, sort_order)
VALUES (
  'Programador',
  'programador',
  'Desenvolvimento de software, sites, aplicativos, automações e consultoria tecnológica',
  260
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  active = true,
  updated_at = now();

WITH programador_services(name, description, duration_minutes) AS (
  VALUES
    ('Desenvolvimento de Aplicativos Mobile (iOS e Android)', 'Criação de apps nativos ou híbridos com Flutter ou React Native para delivery, controle interno, redes sociais e outras tarefas específicas.', 240),
    ('Criação de Sites e Landing Pages', 'Desenvolvimento de páginas institucionais, portfólios, sites promocionais, blogs e páginas otimizadas para SEO.', 180),
    ('Desenvolvimento de E-commerce e Lojas Virtuais', 'Construção de lojas online personalizadas ou integração com Shopify, WooCommerce e Nuvemshop.', 240),
    ('Criação de Sistemas Web Sob Medida (SaaS / Painéis de Gestão)', 'Desenvolvimento de dashboards, sistemas ERP/CRM, gerenciadores de estoque e painéis administrativos.', 240),
    ('Desenvolvimento e Integração de APIs', 'Criação de rotas de comunicação entre sistemas e integração com pagamentos, notas fiscais, mapas e outros serviços.', 180),
    ('Automação de Processos e Scripts', 'Criação de automações, bots e scripts para coleta autorizada de dados e tarefas repetitivas.', 180),
    ('Desenvolvimento e Treinamento de Chatbots', 'Criação de assistentes virtuais para WhatsApp, Telegram ou sites usando inteligência artificial ou fluxos de atendimento.', 180),
    ('Manutenção, Correção de Bugs e Refatoração', 'Correção de erros, atualização de bibliotecas, manutenção de sistemas legados e melhoria de performance.', 120),
    ('Otimização de Desempenho e SEO Técnico', 'Melhoria de velocidade, arquitetura de código e configurações técnicas para ranqueamento nos mecanismos de busca.', 120),
    ('Consultoria em Arquitetura de Software e Banco de Dados', 'Modelagem SQL ou NoSQL, estruturação de microsserviços e definição de infraestrutura tecnológica.', 120),
    ('Desenvolvimento de Plugins, Extensões e Automações', 'Criação de extensões para Chrome e Firefox e plugins para plataformas como WordPress e Figma.', 180)
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
  p.name,
  p.description,
  'Programador',
  0,
  p.duration_minutes,
  NULL,
  false,
  true
FROM programador_services p
JOIN public.segments s ON s.slug = 'programador' AND s.active
WHERE NOT EXISTS (
  SELECT 1
  FROM public.service_templates existing
  WHERE existing.business_id IS NULL
    AND existing.segment_id = s.id
    AND lower(existing.name) = lower(p.name)
);

COMMIT;
