INSERT INTO public.segments (name, slug, description, sort_order, active) VALUES
  ('Cursos de Beleza e Estética', 'cursos-de-beleza-e-estetica', 'Cursos de cuidados pessoais, estética e beleza', 227, true),
  ('Cursos de Design', 'cursos-de-design', 'Cursos de design gráfico, UI/UX e áreas criativas', 224, true),
  ('Cursos de Finanças e Negócios', 'cursos-de-financas-e-negocios', 'Cursos de finanças, gestão e empreendedorismo', 226, true),
  ('Cursos de Gastronomia', 'cursos-de-gastronomia', 'Cursos de culinária, gastronomia e confeitaria', 228, true),
  ('Cursos de Idiomas', 'cursos-de-idiomas', 'Cursos de línguas e idiomas estrangeiros', 222, true),
  ('Cursos de Marketing e Vendas', 'cursos-de-marketing-e-vendas', 'Cursos de marketing digital e técnicas de vendas', 225, true),
  ('Cursos de Música e Artes', 'cursos-de-musica-e-artes', 'Cursos de música, artes e expressão cultural', 229, true),
  ('Cursos de Tecnologia e Programação', 'cursos-de-tecnologia-e-programacao', 'Cursos de tecnologia, programação e informática', 223, true),
  ('Cursos Preparatórios', 'cursos-preparatorios', 'Cursos preparatórios para concursos e vestibulares', 230, true),
  ('Cursos Profissionalizantes', 'cursos-profissionalizantes', 'Cursos profissionalizantes e capacitação técnica', 221, true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  active = EXCLUDED.active,
  updated_at = now();