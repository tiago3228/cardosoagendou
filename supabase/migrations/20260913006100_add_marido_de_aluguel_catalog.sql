-- Global catalog: Marido de Aluguel segment and home maintenance services.
BEGIN;

INSERT INTO public.segments (name, slug, description, sort_order)
VALUES (
  'Marido de Aluguel',
  'marido-de-aluguel',
  'Pequenos reparos, instalações e manutenção residencial',
  250
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  active = true,
  updated_at = now();

WITH marido_services(name, description, duration_minutes) AS (
  VALUES
    ('Instalação de Suportes e TVs', 'Fixação de suportes fixos ou articulados para TVs, painéis e prateleiras em paredes de alvenaria ou drywall.', 90),
    ('Troca e Reparo de Torneiras e Chuveiros', 'Substituição de resistência de chuveiro, troca de reparos e vedações e instalação de torneiras, sifões e misturadores.', 90),
    ('Instalação e Troca de Lâmpadas, Lustres e Luminárias', 'Montagem e fixação de pendentes, plafons, fitas LED e lustres, além da substituição de soquetes ou interruptores.', 90),
    ('Desentupimento Leve de Pias e Vasos Sanitários', 'Desobstrução de sifões, ralos, pias de cozinha e banheiros sem necessidade de obras pesadas.', 60),
    ('Montagem e Desmontagem de Móveis', 'Montagem de estantes, escrivaninhas, mesas, cadeiras e prateleiras pequenas e médias.', 120),
    ('Instalação de Varais, Cortinas e Persianas', 'Fixação de trilhos, varões, persianas verticais ou horizontais e varais de teto ou parede.', 90),
    ('Pequenos Reparos em Portas e Janelas', 'Troca de fechaduras, dobradiças e maçanetas, ajuste de portas e instalação de olhos mágicos ou travas.', 90),
    ('Instalação de Eletrodomésticos', 'Conexão e nivelamento de máquinas de lavar, depuradores, coifas e fogões a gás.', 120),
    ('Pequenos Retoques de Pintura e Vedação', 'Cobertura de furos com massa corrida, retoques de tinta e aplicação de silicone em pias e boxes.', 120),
    ('Fixação de Itens Decorativos', 'Instalação de quadros, espelhos, ganchos, nichos, cabideiros e acessórios de banheiro.', 90),
    ('Substituição de Tomadas e Interruptores', 'Troca de espelhos antigos, atualização de tomadas e pequenos reparos elétricos de baixa tensão.', 90)
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
  m.name,
  m.description,
  'Marido de Aluguel',
  0,
  m.duration_minutes,
  NULL,
  false,
  true
FROM marido_services m
JOIN public.segments s ON s.slug = 'marido-de-aluguel' AND s.active
WHERE NOT EXISTS (
  SELECT 1
  FROM public.service_templates existing
  WHERE existing.business_id IS NULL
    AND existing.segment_id = s.id
    AND lower(existing.name) = lower(m.name)
);

COMMIT;
