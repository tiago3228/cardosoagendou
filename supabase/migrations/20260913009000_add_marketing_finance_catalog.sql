-- Global catalog: Digital Marketing and Financial Consulting services.
BEGIN;

INSERT INTO public.segments (name, slug, description, sort_order, active)
VALUES
  ('Marketing Digital', 'marketing-digital', 'Estratégia, conteúdo, anúncios e crescimento de marcas no ambiente digital', 280, true),
  ('Consultoria Financeira', 'consultoria-financeira', 'Organização financeira, planejamento, análise e orientação para negócios e profissionais', 290, true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  active = true,
  updated_at = now();

WITH catalog_services(segment_slug, category, name, description, duration_minutes) AS (
  VALUES
    ('marketing-digital', 'Estratégia', 'Planejamento de Marketing Digital', 'Definição de objetivos, público, posicionamento, canais, calendário e indicadores para orientar a presença digital.', 120),
    ('marketing-digital', 'Redes sociais', 'Gestão de Redes Sociais', 'Planejamento, publicação, acompanhamento e organização da comunicação da marca nas redes sociais.', 120),
    ('marketing-digital', 'Conteúdo', 'Calendário Editorial e Conteúdo', 'Criação de pautas, temas, formatos e calendário de conteúdo para manter a comunicação consistente.', 120),
    ('marketing-digital', 'Conteúdo', 'Copywriting para Redes Sociais e Anúncios', 'Produção de textos para posts, anúncios, páginas, campanhas e chamadas para ação.', 90),
    ('marketing-digital', 'Anúncios', 'Gestão de Tráfego Pago', 'Planejamento, configuração, acompanhamento e otimização de campanhas em plataformas de anúncios.', 120),
    ('marketing-digital', 'SEO', 'SEO e Otimização de Conteúdo', 'Análise e melhoria de páginas e conteúdos para aumentar a visibilidade nos mecanismos de busca.', 120),
    ('marketing-digital', 'Marca', 'Branding e Posicionamento Digital', 'Definição de personalidade, diferenciais, tom de voz e posicionamento da marca no ambiente digital.', 180),
    ('marketing-digital', 'Análise', 'Relatório de Métricas e Desempenho', 'Leitura de indicadores, resultados de campanhas, alcance, conversões e recomendações de melhoria.', 90),
    ('marketing-digital', 'Conversão', 'Otimização de Landing Page e Funil', 'Análise da jornada do cliente e melhorias em páginas, formulários e etapas de conversão.', 180),
    ('marketing-digital', 'Consultoria', 'Consultoria de Marketing Digital', 'Orientação personalizada para escolher canais, campanhas, ferramentas e próximos passos de crescimento.', 90),
    ('consultoria-financeira', 'Organização', 'Organização Financeira Pessoal ou Empresarial', 'Mapeamento de receitas, despesas, compromissos e categorias para criar uma visão clara da situação financeira.', 90),
    ('consultoria-financeira', 'Planejamento', 'Planejamento Financeiro', 'Construção de metas, orçamento, prioridades e plano de ação para melhorar o controle financeiro.', 120),
    ('consultoria-financeira', 'Fluxo de caixa', 'Análise e Projeção de Fluxo de Caixa', 'Avaliação das entradas e saídas atuais e projeção de cenários para apoiar decisões.', 120),
    ('consultoria-financeira', 'Custos', 'Análise de Custos e Despesas', 'Identificação de custos fixos, variáveis e oportunidades de redução ou reorganização de despesas.', 120),
    ('consultoria-financeira', 'Preços', 'Formação de Preço de Venda', 'Análise de custos, margem, impostos e posicionamento para apoiar a definição de preços.', 120),
    ('consultoria-financeira', 'Indicadores', 'Análise de Indicadores Financeiros', 'Acompanhamento de faturamento, margem, lucratividade, ponto de equilíbrio e outros indicadores.', 120),
    ('consultoria-financeira', 'Dívidas', 'Plano de Reorganização de Dívidas', 'Mapeamento de compromissos e elaboração de prioridades para reorganizar pagamentos e orçamento.', 90),
    ('consultoria-financeira', 'Investimentos', 'Planejamento de Reserva Financeira', 'Definição de objetivos e organização de uma estratégia de reserva conforme o perfil e o prazo do cliente.', 90),
    ('consultoria-financeira', 'Negócios', 'Análise de Viabilidade Financeira', 'Avaliação de receitas, custos, investimento inicial e cenários para um novo projeto ou negócio.', 180),
    ('consultoria-financeira', 'Consultoria', 'Consultoria Financeira Personalizada', 'Orientação individual para decisões financeiras, organização e acompanhamento de um plano de ação.', 90)
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
  c.name,
  c.description,
  c.category,
  0,
  c.duration_minutes,
  NULL,
  false,
  true
FROM catalog_services c
JOIN public.segments s ON s.slug = c.segment_slug AND s.active
WHERE NOT EXISTS (
  SELECT 1
  FROM public.service_templates existing
  WHERE existing.business_id IS NULL
    AND existing.segment_id = s.id
    AND lower(existing.name) = lower(c.name)
);

COMMIT;
