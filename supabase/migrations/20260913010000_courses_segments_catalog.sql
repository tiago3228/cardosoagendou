-- Consolidate Cursos e Aulas into Cursos and add ten course-focused segments.
BEGIN;

INSERT INTO public.segments (name, slug, description, sort_order, active)
VALUES
  ('Cursos', 'cursos', 'Cursos, formações, aulas e treinamentos profissionais', 220, true),
  ('Cursos Profissionalizantes', 'cursos-profissionalizantes', 'Formações práticas para desenvolvimento profissional e entrada no mercado', 221, true),
  ('Cursos de Idiomas', 'cursos-de-idiomas', 'Aulas e treinamentos de idiomas para diferentes níveis e objetivos', 222, true),
  ('Cursos de Tecnologia e Programação', 'cursos-de-tecnologia-e-programacao', 'Programação, ferramentas digitais, dados e desenvolvimento tecnológico', 223, true),
  ('Cursos de Design', 'cursos-de-design', 'Design gráfico, UI/UX, ferramentas criativas e comunicação visual', 224, true),
  ('Cursos de Marketing e Vendas', 'cursos-de-marketing-e-vendas', 'Marketing digital, vendas, atendimento e crescimento de negócios', 225, true),
  ('Cursos de Finanças e Negócios', 'cursos-de-financas-e-negocios', 'Finanças, empreendedorismo, gestão e planejamento empresarial', 226, true),
  ('Cursos de Beleza e Estética', 'cursos-de-beleza-e-estetica', 'Cabeleireiro, maquiagem, unhas, estética e cuidados pessoais', 227, true),
  ('Cursos de Gastronomia', 'cursos-de-gastronomia', 'Culinária, confeitaria, panificação e técnicas de cozinha', 228, true),
  ('Cursos de Música e Artes', 'cursos-de-musica-e-artes', 'Instrumentos musicais, canto, produção artística e expressão criativa', 229, true),
  ('Cursos Preparatórios', 'cursos-preparatorios', 'Preparação para provas, concursos, vestibulares e certificações', 230, true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  active = true,
  updated_at = now();

DO $$
DECLARE
  canonical_id uuid;
  duplicate_id uuid;
BEGIN
  SELECT id INTO canonical_id FROM public.segments WHERE slug = 'cursos';
  SELECT id INTO duplicate_id FROM public.segments WHERE slug = 'cursos-e-aulas';

  IF duplicate_id IS NULL OR duplicate_id = canonical_id THEN
    RETURN;
  END IF;

  DELETE FROM public.service_templates old_template
  WHERE old_template.business_id IS NULL
    AND old_template.segment_id = duplicate_id
    AND EXISTS (
      SELECT 1 FROM public.service_templates canonical_template
      WHERE canonical_template.business_id IS NULL
        AND canonical_template.segment_id = canonical_id
        AND lower(canonical_template.name) = lower(old_template.name)
    );

  UPDATE public.service_templates
  SET segment_id = canonical_id, updated_at = now()
  WHERE business_id IS NULL AND segment_id = duplicate_id;

  UPDATE public.business_segments bs
  SET segment_id = canonical_id,
      name = 'Cursos',
      slug = 'cursos',
      description = 'Cursos, formações, aulas e treinamentos profissionais',
      updated_at = now()
  WHERE bs.segment_id = duplicate_id
    AND NOT EXISTS (
      SELECT 1 FROM public.business_segments existing
      WHERE existing.business_id = bs.business_id AND existing.segment_id = canonical_id
    );

  DELETE FROM public.business_segments duplicate_business_segment
  WHERE duplicate_business_segment.segment_id = duplicate_id;

  DELETE FROM public.segments WHERE id = duplicate_id;
END $$;

WITH course_services(segment_slug, category, name, description, duration_minutes) AS (
  VALUES
    ('cursos-profissionalizantes', 'Profissional', 'Curso de Atendimento ao Cliente', 'Treinamento prático de comunicação, acolhimento, resolução de problemas e experiência do cliente.', 180),
    ('cursos-profissionalizantes', 'Profissional', 'Curso de Assistente Administrativo', 'Formação em rotinas administrativas, organização, documentos, agenda e atendimento.', 240),
    ('cursos-profissionalizantes', 'Profissional', 'Curso de Departamento Pessoal', 'Introdução a rotinas de admissão, documentação, folha, benefícios e organização trabalhista.', 240),
    ('cursos-de-idiomas', 'Idiomas', 'Aula de Inglês para Iniciantes', 'Aulas introdutórias de vocabulário, conversação e compreensão para quem está começando.', 60),
    ('cursos-de-idiomas', 'Idiomas', 'Conversação em Espanhol', 'Prática de conversação, pronúncia e situações cotidianas em espanhol.', 60),
    ('cursos-de-idiomas', 'Idiomas', 'Preparação para Certificação de Idiomas', 'Acompanhamento focado em vocabulário, gramática, compreensão e simulados.', 90),
    ('cursos-de-tecnologia-e-programacao', 'Tecnologia', 'Curso de Programação para Iniciantes', 'Fundamentos de lógica, algoritmos e primeiros projetos de programação.', 180),
    ('cursos-de-tecnologia-e-programacao', 'Tecnologia', 'Curso de Desenvolvimento Web', 'HTML, CSS, JavaScript e criação de páginas web responsivas.', 240),
    ('cursos-de-tecnologia-e-programacao', 'Tecnologia', 'Curso de Ferramentas Digitais', 'Uso prático de editores, armazenamento em nuvem, colaboração e produtividade digital.', 120),
    ('cursos-de-design', 'Design', 'Curso de Design Gráfico', 'Fundamentos de composição, cor, tipografia e criação de peças visuais.', 180),
    ('cursos-de-design', 'Design', 'Curso de UI/UX Design', 'Pesquisa, wireframes, protótipos, interfaces e fundamentos de experiência do usuário.', 240),
    ('cursos-de-design', 'Design', 'Curso de Ferramentas Criativas', 'Introdução a ferramentas de edição e criação para projetos digitais e impressos.', 180),
    ('cursos-de-marketing-e-vendas', 'Marketing', 'Curso de Marketing Digital', 'Estratégia, conteúdo, redes sociais, anúncios e métricas para negócios.', 180),
    ('cursos-de-marketing-e-vendas', 'Vendas', 'Curso de Técnicas de Vendas', 'Prospecção, abordagem, negociação, fechamento e relacionamento com clientes.', 180),
    ('cursos-de-marketing-e-vendas', 'Marketing', 'Curso de Redes Sociais para Negócios', 'Planejamento de conteúdo, posicionamento e rotina de publicação para marcas.', 120),
    ('cursos-de-financas-e-negocios', 'Finanças', 'Curso de Educação Financeira', 'Organização de orçamento, metas, consumo consciente e planejamento financeiro.', 180),
    ('cursos-de-financas-e-negocios', 'Negócios', 'Curso de Empreendedorismo', 'Validação de ideias, modelo de negócio, clientes, operação e primeiros passos.', 180),
    ('cursos-de-financas-e-negocios', 'Gestão', 'Curso de Gestão para Pequenos Negócios', 'Rotinas de gestão, indicadores, processos, pessoas e tomada de decisão.', 240),
    ('cursos-de-beleza-e-estetica', 'Beleza', 'Curso de Corte e Escova', 'Técnicas fundamentais de corte, escova, finalização e atendimento em salão.', 240),
    ('cursos-de-beleza-e-estetica', 'Beleza', 'Curso de Maquiagem Profissional', 'Preparação de pele, técnicas de maquiagem social e produção para diferentes ocasiões.', 240),
    ('cursos-de-beleza-e-estetica', 'Estética', 'Curso de Manicure e Pedicure', 'Fundamentos de cuidados com unhas, esmaltação, higiene e atendimento.', 180),
    ('cursos-de-gastronomia', 'Culinária', 'Curso de Culinária Básica', 'Técnicas essenciais de preparo, cortes, temperos, cocção e organização da cozinha.', 180),
    ('cursos-de-gastronomia', 'Confeitaria', 'Curso de Confeitaria', 'Massas, recheios, coberturas e montagem de doces e bolos.', 240),
    ('cursos-de-gastronomia', 'Panificação', 'Curso de Pães Artesanais', 'Fermentação, modelagem e forneamento de pães artesanais.', 240),
    ('cursos-de-musica-e-artes', 'Música', 'Aula de Violão', 'Aulas individuais de acordes, ritmos, leitura básica e repertório.', 60),
    ('cursos-de-musica-e-artes', 'Música', 'Aula de Canto', 'Técnica vocal, respiração, afinação e interpretação musical.', 60),
    ('cursos-de-musica-e-artes', 'Artes', 'Curso de Desenho e Ilustração', 'Exercícios de traço, proporção, luz, sombra e desenvolvimento de estilo.', 120),
    ('cursos-preparatorios', 'Preparatório', 'Aula de Reforço Escolar', 'Acompanhamento individual para revisão de conteúdos e apoio nas atividades escolares.', 60),
    ('cursos-preparatorios', 'Preparatório', 'Preparação para Vestibular e ENEM', 'Revisão de conteúdos, resolução de exercícios e organização de estudos.', 120),
    ('cursos-preparatorios', 'Preparatório', 'Preparação para Concursos', 'Planejamento, revisão, questões e simulados conforme o edital escolhido.', 120)
)
INSERT INTO public.service_templates (
  business_id, service_id, segment_id, name, description, category,
  price_cents, duration_minutes, image_url, allows_parallel, active
)
SELECT NULL, NULL, s.id, c.name, c.description, c.category,
       0, c.duration_minutes, NULL, false, true
FROM course_services c
JOIN public.segments s ON s.slug = c.segment_slug AND s.active
WHERE NOT EXISTS (
  SELECT 1 FROM public.service_templates existing
  WHERE existing.business_id IS NULL
    AND existing.segment_id = s.id
    AND lower(existing.name) = lower(c.name)
);

COMMIT;
