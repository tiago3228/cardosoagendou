-- Global catalog: Depilação segment and aesthetic services.
BEGIN;

INSERT INTO public.segments (name, slug, description, sort_order)
VALUES (
  'Depilação',
  'depilacao',
  'Depilação estética, facial, corporal e cuidados pós-procedimento',
  230
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  active = true,
  updated_at = now();

WITH depilacao_services(name, description, duration_minutes) AS (
  VALUES
    ('Depilação a Laser', 'Remoção duradoura ou definitiva dos pelos por meio de tecnologia de luz focada, como Laser de Diodo, Alexandrite ou Nd:YAG.', 60),
    ('Fotodepilação (LIP)', 'Tratamento para redução progressiva dos pelos utilizando luz intensa pulsada de amplo espectro.', 60),
    ('Depilação com Cera Quente', 'Remoção dos pelos pela raiz com cera aquecida, ideal para áreas sensíveis.', 45),
    ('Depilação com Cera Fria', 'Remoção com tiras adesivas, prática para regiões maiores como pernas.', 45),
    ('Depilação Egípcia (com Linha)', 'Técnica precisa que remove os pelos pela raiz usando um fio de algodão, muito usada no rosto e nas sobrancelhas.', 30),
    ('Depilação com Lâmina / Raspagem Profissional', 'Serviço rápido de corte rente dos pelos, comum em preparações pré-procedimentos ou barbearias.', 30),
    ('Depilação Corporal Masculina', 'Atendimento especializado para peito, costas, barba e abdômen.', 60),
    ('Depilação Íntima Feminina e Masculina', 'Remoção total ou parcial de pelos nas regiões genitais e perianal, conforme o serviço contratado.', 60),
    ('Design de Sobrancelhas com Depilação', 'Modelagem do formato das sobrancelhas combinada com remoção de pelos excessivos no rosto.', 30),
    ('Depilação Facial / Buço', 'Remoção direcionada de pelos do rosto, queixo, buço e bochechas.', 30),
    ('Epilação com Argila ou Cera Negra', 'Tratamento com ceras especiais enriquecidas com ativos que ajudam a acalmar e hidratar a pele.', 45),
    ('Hidratação e Acalmamento Pós-Depilatório', 'Serviço complementar com aloe vera, alta frequência ou LED azul para ajudar a evitar foliculite e irritações.', 30)
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
  'Depilação',
  0,
  d.duration_minutes,
  NULL,
  false,
  true
FROM depilacao_services d
JOIN public.segments s ON s.slug = 'depilacao' AND s.active
WHERE NOT EXISTS (
  SELECT 1
  FROM public.service_templates existing
  WHERE existing.business_id IS NULL
    AND existing.segment_id = s.id
    AND lower(existing.name) = lower(d.name)
);

COMMIT;
