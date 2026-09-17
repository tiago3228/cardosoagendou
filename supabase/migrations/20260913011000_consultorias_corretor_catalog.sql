-- Global catalog: consulting and real-estate broker segments.
BEGIN;

INSERT INTO public.segments (name, slug, description, sort_order, active)
VALUES
  ('Consultorias', 'consultorias', 'Orientação especializada para negócios, profissionais e projetos', 300, true),
  ('Corretor', 'corretor', 'Serviços de intermediação, avaliação e consultoria imobiliária', 320, true),
  ('Consultoria Empresarial', 'consultoria-empresarial', 'Estratégia, processos e desenvolvimento de empresas', 301, true),
  ('Consultoria de Marketing', 'consultoria-de-marketing', 'Estratégia de marca, comunicação e crescimento', 302, true),
  ('Consultoria Financeira e Contábil', 'consultoria-financeira-e-contabil', 'Organização, análise e planejamento financeiro e contábil', 303, true),
  ('Consultoria Jurídica', 'consultoria-juridica', 'Orientação jurídica e análise preventiva de situações e documentos', 304, true),
  ('Consultoria de Recursos Humanos', 'consultoria-de-recursos-humanos', 'Pessoas, processos seletivos, cultura e desenvolvimento', 305, true),
  ('Consultoria de Tecnologia', 'consultoria-de-tecnologia', 'Sistemas, dados, segurança e transformação digital', 306, true),
  ('Consultoria Ambiental', 'consultoria-ambiental', 'Sustentabilidade, licenciamento e gestão ambiental', 307, true),
  ('Consultoria de Gestão de Projetos', 'consultoria-de-gestao-de-projetos', 'Planejamento, acompanhamento e melhoria de projetos', 308, true),
  ('Consultoria de Segurança do Trabalho', 'consultoria-de-seguranca-do-trabalho', 'Prevenção de riscos, conformidade e segurança ocupacional', 309, true),
  ('Consultoria em Imóveis', 'consultoria-em-imoveis', 'Orientação para compra, venda, locação e investimento imobiliário', 321, true),
  ('Corretor de Imóveis Residenciais', 'corretor-de-imoveis-residenciais', 'Intermediação de casas, apartamentos e imóveis residenciais', 322, true),
  ('Corretor de Imóveis Comerciais', 'corretor-de-imoveis-comerciais', 'Intermediação de salas, lojas, galpões e imóveis corporativos', 323, true),
  ('Corretor de Imóveis Rurais', 'corretor-de-imoveis-rurais', 'Negociação de fazendas, sítios, chácaras e terrenos rurais', 324, true),
  ('Corretor de Lançamentos', 'corretor-de-lancamentos', 'Atendimento e vendas de empreendimentos novos e lançamentos', 325, true),
  ('Corretor de Locação', 'corretor-de-locacao', 'Intermediação e acompanhamento de locações imobiliárias', 326, true),
  ('Avaliador de Imóveis', 'avaliador-de-imoveis', 'Análise de valor, características e mercado de imóveis', 327, true),
  ('Consultor de Investimentos Imobiliários', 'consultor-de-investimentos-imobiliarios', 'Análise de oportunidades e estratégias de investimento em imóveis', 328, true),
  ('Despachante Imobiliário', 'despachante-imobiliario', 'Apoio documental e acompanhamento de processos imobiliários', 329, true),
  ('Corretor de Seguros', 'corretor-de-seguros', 'Orientação e intermediação de seguros para pessoas e empresas', 330, true),
  ('Corretor de Planos de Saúde', 'corretor-de-planos-de-saude', 'Orientação e comparação de planos de saúde e benefícios', 331, true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  active = true,
  updated_at = now();

WITH catalog_services(segment_slug, category, name, description, duration_minutes) AS (
  VALUES
    ('consultoria-empresarial', 'Estratégia', 'Diagnóstico Empresarial', 'Análise da operação, desafios, oportunidades e prioridades do negócio.', 120),
    ('consultoria-empresarial', 'Estratégia', 'Planejamento Estratégico', 'Definição de objetivos, indicadores e plano de ação para a empresa.', 180),
    ('consultoria-de-marketing', 'Marketing', 'Diagnóstico de Marketing', 'Análise de marca, canais, público e oportunidades de comunicação.', 120),
    ('consultoria-de-marketing', 'Marketing', 'Plano de Marketing', 'Construção de estratégia, calendário, canais e metas de marketing.', 180),
    ('consultoria-financeira-e-contabil', 'Finanças', 'Análise Financeira', 'Leitura de receitas, custos, despesas, margens e indicadores.', 120),
    ('consultoria-financeira-e-contabil', 'Finanças', 'Planejamento Financeiro', 'Organização de orçamento, metas, fluxo de caixa e próximos passos.', 120),
    ('consultoria-juridica', 'Jurídico', 'Orientação Jurídica Inicial', 'Análise preliminar da situação e indicação dos próximos passos jurídicos.', 60),
    ('consultoria-juridica', 'Documentos', 'Análise de Contrato', 'Leitura orientativa de cláusulas, riscos e pontos que merecem atenção.', 90),
    ('consultoria-de-recursos-humanos', 'Pessoas', 'Diagnóstico de Recursos Humanos', 'Análise de processos, equipe, comunicação e oportunidades de desenvolvimento.', 120),
    ('consultoria-de-recursos-humanos', 'Pessoas', 'Estruturação de Processo Seletivo', 'Definição de perfil, etapas, critérios e roteiro de seleção.', 120),
    ('consultoria-de-tecnologia', 'Tecnologia', 'Diagnóstico de Tecnologia', 'Avaliação de sistemas, ferramentas, processos e necessidades digitais.', 120),
    ('consultoria-de-tecnologia', 'Tecnologia', 'Plano de Transformação Digital', 'Priorização de melhorias, automações e soluções tecnológicas.', 180),
    ('consultoria-ambiental', 'Ambiental', 'Diagnóstico Ambiental', 'Levantamento inicial de aspectos, riscos e oportunidades ambientais.', 120),
    ('consultoria-ambiental', 'Ambiental', 'Plano de Sustentabilidade', 'Definição de ações para reduzir impactos e melhorar práticas sustentáveis.', 180),
    ('consultoria-de-gestao-de-projetos', 'Projetos', 'Planejamento de Projeto', 'Definição de escopo, etapas, prazos, responsáveis e riscos.', 120),
    ('consultoria-de-gestao-de-projetos', 'Projetos', 'Acompanhamento de Projeto', 'Reunião de acompanhamento, análise de progresso e atualização de plano de ação.', 60),
    ('consultoria-de-seguranca-do-trabalho', 'Segurança', 'Diagnóstico de Segurança do Trabalho', 'Identificação de riscos e pontos de melhoria no ambiente ocupacional.', 120),
    ('consultoria-de-seguranca-do-trabalho', 'Segurança', 'Plano de Prevenção de Riscos', 'Orientação para organizar ações preventivas e rotinas de segurança.', 180),
    ('consultoria-em-imoveis', 'Imóveis', 'Consultoria para Compra de Imóvel', 'Orientação sobre perfil, localização, documentação e análise da oportunidade.', 90),
    ('consultoria-em-imoveis', 'Imóveis', 'Consultoria para Venda de Imóvel', 'Estratégia de preço, apresentação, divulgação e preparação para negociação.', 90),
    ('corretor-de-imoveis-residenciais', 'Residencial', 'Atendimento para Compra Residencial', 'Busca orientada de casas e apartamentos conforme perfil e orçamento.', 90),
    ('corretor-de-imoveis-residenciais', 'Residencial', 'Visita a Imóvel Residencial', 'Apresentação de imóvel residencial e esclarecimento de informações da negociação.', 60),
    ('corretor-de-imoveis-comerciais', 'Comercial', 'Busca de Imóvel Comercial', 'Seleção de salas, lojas, galpões ou espaços conforme atividade e localização.', 90),
    ('corretor-de-imoveis-comerciais', 'Comercial', 'Visita a Imóvel Comercial', 'Apresentação de espaço comercial e levantamento das necessidades do negócio.', 60),
    ('corretor-de-imoveis-rurais', 'Rural', 'Consultoria para Imóvel Rural', 'Orientação para busca e análise inicial de fazendas, sítios e terrenos rurais.', 120),
    ('corretor-de-imoveis-rurais', 'Rural', 'Visita a Propriedade Rural', 'Apresentação de propriedade rural e levantamento de características do local.', 120),
    ('corretor-de-lancamentos', 'Lançamentos', 'Apresentação de Lançamento Imobiliário', 'Apresentação de empreendimento, plantas, condições e diferenciais do projeto.', 60),
    ('corretor-de-lancamentos', 'Lançamentos', 'Simulação de Compra de Lançamento', 'Simulação orientativa de unidades, entrada, parcelas e condições comerciais.', 60),
    ('corretor-de-locacao', 'Locação', 'Atendimento para Locação', 'Busca e seleção de imóveis para locação conforme perfil e orçamento.', 60),
    ('corretor-de-locacao', 'Locação', 'Visita para Locação', 'Apresentação de imóvel para locação e orientação sobre o processo.', 60),
    ('avaliador-de-imoveis', 'Avaliação', 'Avaliação Mercadológica de Imóvel', 'Análise de localização, características e referências de mercado para estimar valor.', 120),
    ('avaliador-de-imoveis', 'Avaliação', 'Laudo e Relatório de Imóvel', 'Organização das informações da avaliação em relatório com evidências e referências.', 180),
    ('consultor-de-investimentos-imobiliarios', 'Investimentos', 'Análise de Oportunidade Imobiliária', 'Avaliação inicial de localização, potencial, riscos e cenário de uma oportunidade.', 120),
    ('consultor-de-investimentos-imobiliarios', 'Investimentos', 'Planejamento de Investimento Imobiliário', 'Orientação para objetivos, perfil, diversificação e análise de alternativas imobiliárias.', 120),
    ('despachante-imobiliario', 'Documentação', 'Conferência de Documentos Imobiliários', 'Organização e conferência inicial de documentos necessários para o processo.', 90),
    ('despachante-imobiliario', 'Documentação', 'Acompanhamento de Processo Imobiliário', 'Acompanhamento de etapas, pendências e comunicações do processo documental.', 60),
    ('corretor-de-seguros', 'Seguros', 'Cotação e Comparação de Seguros', 'Levantamento de necessidades e comparação orientativa de coberturas e condições.', 60),
    ('corretor-de-seguros', 'Seguros', 'Consultoria de Proteção Patrimonial', 'Orientação para identificar riscos e necessidades de proteção para pessoas ou empresas.', 90),
    ('corretor-de-planos-de-saude', 'Saúde', 'Comparação de Planos de Saúde', 'Levantamento de perfil e comparação orientativa de opções de planos e redes.', 60),
    ('corretor-de-planos-de-saude', 'Saúde', 'Consultoria de Benefícios Corporativos', 'Orientação para empresas sobre planos e benefícios para equipes.', 90)
)
INSERT INTO public.service_templates (
  business_id, service_id, segment_id, name, description, category,
  price_cents, duration_minutes, image_url, allows_parallel, active
)
SELECT NULL, NULL, s.id, c.name, c.description, c.category,
       0, c.duration_minutes, NULL, false, true
FROM catalog_services c
JOIN public.segments s ON s.slug = c.segment_slug AND s.active
WHERE NOT EXISTS (
  SELECT 1 FROM public.service_templates existing
  WHERE existing.business_id IS NULL
    AND existing.segment_id = s.id
    AND lower(existing.name) = lower(c.name)
);

COMMIT;
