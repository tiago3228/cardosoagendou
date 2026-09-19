-- Global catalog: cocktail consulting and bar operation services.
BEGIN;

INSERT INTO public.segments (name, slug, description, sort_order, active)
VALUES (
  'Coquetelaria',
  'coquetelaria',
  'Consultoria de bar, coquetelaria, operação, treinamento e lucratividade',
  340,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  active = true,
  updated_at = now();

WITH catalog_services(category, name, description, duration_minutes) AS (
  VALUES
    ('Consultoria', 'Consultoria de Bar', 'Diagnóstico e orientação personalizada para conceito, carta, operação, equipe e resultados do bar.', 60),
    ('Coquetelaria', 'Criação e Padronização de Coquetéis', 'Desenvolvimento, testes e padronização de coquetéis alinhados ao conceito e à identidade do bar.', 60),
    ('Carta e Fichas Técnicas', 'Desenvolvimento de Carta e Fichas Técnicas', 'Construção de carta de drinks e fichas técnicas com ingredientes, preparo, apresentação e padrão de execução.', 60),
    ('Precificação', 'Precificação Estratégica', 'Análise de custos, margens, preços de venda e posicionamento para melhorar a rentabilidade dos drinks.', 60),
    ('Operação', 'Organização e Otimização de Operação', 'Mapeamento e melhoria de processos, mise en place, estoque, fluxo de trabalho e rotina do bar.', 60),
    ('Treinamento', 'Treinamento de Equipe e Atendimento', 'Capacitação da equipe em técnicas, padrões de preparo, atendimento, hospitalidade e experiência do cliente.', 60),
    ('Gestão e Lucratividade', 'Aumento de Lucratividade e Identidade do Bar', 'Consultoria para fortalecer a identidade do bar, elevar a experiência e transformar a operação em resultado.', 60)
)
INSERT INTO public.service_templates (
  business_id, service_id, segment_id, name, description, category,
  price_cents, duration_minutes, image_url, allows_parallel, active
)
SELECT NULL, NULL, s.id, c.name, c.description, c.category,
       0, c.duration_minutes, NULL, false, true
FROM catalog_services c
JOIN public.segments s ON s.slug = 'coquetelaria' AND s.active
WHERE NOT EXISTS (
  SELECT 1 FROM public.service_templates existing
  WHERE existing.business_id IS NULL
    AND existing.segment_id = s.id
    AND lower(existing.name) = lower(c.name)
);

COMMIT;
