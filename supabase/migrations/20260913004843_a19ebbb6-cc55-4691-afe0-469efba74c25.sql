-- Adiciona novos segmentos ao catálogo global de serviços
INSERT INTO public.segments (name, slug, description, sort_order, active)
VALUES
  ('Videomaker', 'videomaker', 'Filmagens, edição e produção de vídeo', 205, true),
  ('Quadras', 'quadras', 'Aluguel e agendamento de quadras esportivas', 210, true),
  ('Drones', 'drones', 'Serviços de filmagem e mapeamento com drones', 215, true),
  ('Cursos e Aulas', 'cursos-e-aulas', 'Aulas particulares, cursos e treinamentos', 220, true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  active = true,
  updated_at = now();
