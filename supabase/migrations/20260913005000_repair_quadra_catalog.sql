-- Repair the Quadra global catalog if the initial seed only created the segment
-- or left some templates inactive.
BEGIN;

INSERT INTO public.segments (name, slug, description, sort_order)
VALUES (
  'Quadra',
  'quadra',
  'Aluguel de quadras e espaços esportivos para partidas recreativas',
  210
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  active = true,
  updated_at = now();

UPDATE public.business_segments bs
SET segment_id = s.id,
    updated_at = now()
FROM public.segments s
WHERE s.slug = 'quadra'
  AND bs.slug = 'quadra'
  AND bs.segment_id IS DISTINCT FROM s.id;

WITH quadra_services(name, description, duration_minutes) AS (
  VALUES
    ('Futebol / Futsal', 'Aluguel de quadra society ou salão para jogos entre amigos.', 60),
    ('Futevôlei', 'Quadra de areia para partidas recreativas em grupo.', 60),
    ('Beach Tennis', 'Aluguel de quadra de areia com empréstimo ou aluguel de raquetes e bolinhas.', 60),
    ('Vôlei de Praia / Vôlei de Quadra', 'Uso de espaço para partidas casuais de vôlei.', 60),
    ('Basquete / Basquete 3x3', 'Aluguel de meia quadra ou quadra inteira para rachas de basquete.', 60),
    ('Tênis', 'Reserva de quadra de saibro ou rápida para jogos individuais ou em dupla.', 60),
    ('Padel', 'Esporte dinâmico jogado em quadras fechadas por vidro, muito popular para duplas.', 60),
    ('Pickleball', 'Modalidade rápida, fácil de aprender e muito social, ideal para todas as idades.', 60),
    ('Badminton', 'Uso de quadra e rede para jogo recreativo de peteca.', 60),
    ('Queimada (Dodgeball)', 'Reserva de quadras poliesportivas para eventos, aniversários e jogos em grupo.', 90),
    ('Patinação / Roller', 'Aluguel de espaço de quadra lisa para prática de patins, fita ou ringue.', 60),
    ('Squash', 'Quadra indoor fechada para jogos rápidos de rebatedoria.', 45)
),
updated AS (
  UPDATE public.service_templates st
  SET description = q.description,
      category = 'Quadra',
      duration_minutes = q.duration_minutes,
      active = true,
      updated_at = now()
  FROM quadra_services q
  JOIN public.segments s ON s.id = st.segment_id
  WHERE st.business_id IS NULL
    AND s.slug = 'quadra'
    AND lower(st.name) = lower(q.name)
  RETURNING st.id
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
  q.name,
  q.description,
  'Quadra',
  0,
  q.duration_minutes,
  NULL,
  false,
  true
FROM quadra_services q
JOIN public.segments s ON s.slug = 'quadra' AND s.active
WHERE NOT EXISTS (
  SELECT 1
  FROM public.service_templates existing
  WHERE existing.business_id IS NULL
    AND existing.segment_id = s.id
    AND lower(existing.name) = lower(q.name)
);

COMMIT;
