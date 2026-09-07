-- Structural service catalog correction
-- Global segments/templates remain separate from tenant-owned business services.
-- Legacy business_segments and service_templates rows are preserved.

CREATE TABLE IF NOT EXISTS public.segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(name)) BETWEEN 1 AND 120),
  CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

ALTER TABLE public.business_segments
  ADD COLUMN IF NOT EXISTS segment_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'business_segments_segment_fkey'
      AND conrelid = 'public.business_segments'::regclass
  ) THEN
    ALTER TABLE public.business_segments
      ADD CONSTRAINT business_segments_segment_fkey
      FOREIGN KEY (segment_id) REFERENCES public.segments(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS business_segments_business_segment_uidx
  ON public.business_segments(business_id, segment_id)
  WHERE segment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS segments_active_order_idx
  ON public.segments(active, sort_order, name);

ALTER TABLE public.service_templates
  ALTER COLUMN business_id DROP NOT NULL;

ALTER TABLE public.service_templates
  ALTER COLUMN service_id DROP NOT NULL;

ALTER TABLE public.service_templates
  ALTER COLUMN segment_id DROP NOT NULL;

DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_class target ON target.oid = con.confrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    JOIN pg_namespace target_ns ON target_ns.oid = target.relnamespace
    WHERE ns.nspname = 'public'
      AND rel.relname = 'service_templates'
      AND target_ns.nspname = 'public'
      AND target.relname = 'business_segments'
  LOOP
    EXECUTE format('ALTER TABLE public.service_templates DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'service_templates_global_or_legacy_check'
      AND conrelid = 'public.service_templates'::regclass
  ) THEN
    ALTER TABLE public.service_templates
      ADD CONSTRAINT service_templates_global_or_legacy_check
      CHECK (
        (business_id IS NULL AND service_id IS NULL)
        OR (business_id IS NOT NULL AND service_id IS NOT NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS service_templates_global_segment_idx
  ON public.service_templates(segment_id, active)
  WHERE business_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS service_templates_global_name_uidx
  ON public.service_templates(segment_id, lower(name))
  WHERE business_id IS NULL;

-- Seed the global catalog. The insert is idempotent by slug.
INSERT INTO public.segments (name, slug, description, sort_order)
VALUES
  ('Barbearia', 'barbearia', 'Cortes, barba e cuidados masculinos', 10),
  ('Salão de Beleza', 'salao-de-beleza', 'Cabelo, coloração e tratamentos', 20),
  ('Manicure & Pedicure', 'manicure-pedicure', 'Cuidados para mãos e pés', 30),
  ('Estética', 'estetica', 'Procedimentos faciais e corporais', 40),
  ('Massagem & Terapias', 'massagem-terapias', 'Massagens e terapias integrativas', 50),
  ('Pet Shop / Banho & Tosa', 'pet-shop-banho-tosa', 'Cuidados, banho e tosa para pets', 60),
  ('Clínica Odontológica', 'clinica-odontologica', 'Atendimentos odontológicos', 70),
  ('Personal Trainer / Academia', 'personal-trainer-academia', 'Treinos e acompanhamento físico', 80),
  ('Yoga & Pilates', 'yoga-pilates', 'Aulas de yoga, pilates e movimento', 90),
  ('Sobrancelhas & Cílios', 'sobrancelhas-cilios', 'Design de sobrancelhas e cílios', 100),
  ('Maquiagem', 'maquiagem', 'Maquiagem social e profissional', 110),
  ('Spa', 'spa', 'Rituais de relaxamento e bem-estar', 120),
  ('Clínica / Consultório', 'clinica-consultorio', 'Consultas e atendimentos clínicos', 130),
  ('Fisioterapia', 'fisioterapia', 'Avaliação e sessões de fisioterapia', 140),
  ('Psicologia', 'psicologia', 'Atendimentos psicológicos', 150),
  ('Joalheria / Serviços Especializados', 'joalheria-servicos-especializados', 'Ajustes, reparos e serviços especializados', 160),
  ('Estética Automotiva', 'estetica-automotiva', 'Limpeza e cuidados automotivos', 170),
  ('Serviços de Limpeza', 'servicos-de-limpeza', 'Limpeza residencial e comercial', 180),
  ('Fotografia', 'fotografia', 'Ensaios e sessões fotográficas', 190),
  ('Aulas / Professores Particulares', 'aulas-professores-particulares', 'Aulas e acompanhamento individual', 200)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  active = true,
  updated_at = now();

-- Convert existing non-legacy tenant segments to their global counterpart when possible.
UPDATE public.business_segments bs
SET segment_id = s.id,
    name = s.name,
    slug = s.slug,
    updated_at = now()
FROM public.segments s
WHERE bs.slug = s.slug
  AND bs.slug <> 'geral'
  AND bs.segment_id IS NULL;

-- Existing tenant template snapshots remain preserved, but now point to the global segment.
UPDATE public.service_templates st
SET segment_id = s.id,
    updated_at = now()
FROM public.business_segments bs
JOIN public.segments s ON s.id = bs.segment_id
WHERE st.business_id = bs.business_id
  AND st.segment_id = bs.id;

-- Legacy Geral snapshots remain available to the tenant but are not commercial templates.
UPDATE public.service_templates st
SET segment_id = NULL,
    updated_at = now()
WHERE st.business_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.business_segments bs
    WHERE bs.id = st.segment_id AND bs.slug = 'geral'
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'service_templates_global_segment_fkey'
      AND conrelid = 'public.service_templates'::regclass
  ) THEN
    ALTER TABLE public.service_templates
      ADD CONSTRAINT service_templates_global_segment_fkey
      FOREIGN KEY (segment_id) REFERENCES public.segments(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- The technical Geral bucket must not count toward commercial segment limits.
CREATE OR REPLACE FUNCTION public.enforce_business_segment_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  segment_limit integer;
  active_count integer;
BEGIN
  IF NEW.active = false OR NEW.segment_id IS NULL THEN
    RETURN NEW;
  END IF;

  segment_limit := public.business_segment_limit(NEW.business_id);
  IF segment_limit IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO active_count
  FROM public.business_segments s
  WHERE s.business_id = NEW.business_id
    AND s.active
    AND s.segment_id IS NOT NULL
    AND s.id <> NEW.id;

  IF active_count + 1 > segment_limit THEN
    RAISE EXCEPTION 'PLAN_SEGMENT_LIMIT_REACHED: plan allows % active segments', segment_limit;
  END IF;
  RETURN NEW;
END;
$$;

-- General is created lazily only when a legacy service needs a default bucket.
CREATE OR REPLACE FUNCTION public.assign_default_service_segment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE general_id uuid;
BEGIN
  IF NEW.segment_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO general_id
  FROM public.business_segments
  WHERE business_id = NEW.business_id AND slug = 'geral'
  LIMIT 1;

  IF general_id IS NULL THEN
    INSERT INTO public.business_segments (business_id, name, slug, description, sort_order, active)
    VALUES (NEW.business_id, 'Geral', 'geral', 'Serviços existentes', 0, true)
    RETURNING id INTO general_id;
  END IF;

  NEW.segment_id := general_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_service_segment_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.segment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.business_segments bs
    WHERE bs.id = NEW.segment_id
      AND bs.business_id = NEW.business_id
      AND (bs.active OR bs.slug = 'geral')
  ) THEN
    RAISE EXCEPTION 'SEGMENT_NOT_ACTIVE_FOR_BUSINESS';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS services_validate_segment ON public.services;
CREATE TRIGGER services_validate_segment
BEFORE INSERT OR UPDATE OF business_id, segment_id ON public.services
FOR EACH ROW EXECUTE FUNCTION public.validate_service_segment_assignment();

-- Stop mirroring live tenant services into templates. Existing snapshots remain intact.
DROP TRIGGER IF EXISTS services_template_sync ON public.services;

-- Global catalog suggestions. They are copied into services by an RPC below.
INSERT INTO public.service_templates (
  business_id, service_id, segment_id, name, description, category,
  price_cents, duration_minutes, image_url, allows_parallel, active
)
SELECT NULL, NULL, s.id, seed.name, seed.description, seed.category,
       0, seed.duration_minutes, NULL, false, true
FROM (
  VALUES
    ('barbearia', 'Corte masculino', 'Corte tradicional masculino', 'Cabelo', 30),
    ('barbearia', 'Barba completa', 'Modelagem e acabamento de barba', 'Barba', 30),
    ('barbearia', 'Corte + barba', 'Corte masculino com barba completa', 'Combos', 60),
    ('salao-de-beleza', 'Corte feminino', 'Corte e finalização', 'Cabelo', 60),
    ('salao-de-beleza', 'Escova', 'Escova e finalização dos cabelos', 'Penteados', 45),
    ('salao-de-beleza', 'Coloração', 'Coloração completa dos cabelos', 'Coloração', 120),
    ('manicure-pedicure', 'Manicure', 'Cuidados e esmaltação das mãos', 'Mãos', 45),
    ('manicure-pedicure', 'Pedicure', 'Cuidados e esmaltação dos pés', 'Pés', 50),
    ('manicure-pedicure', 'Alongamento em gel', 'Alongamento e acabamento em gel', 'Alongamento', 120),
    ('estetica', 'Limpeza de pele', 'Limpeza e cuidados faciais', 'Facial', 60),
    ('estetica', 'Drenagem linfática', 'Massagem de drenagem corporal', 'Corporal', 60),
    ('estetica', 'Avaliação estética', 'Avaliação inicial do procedimento', 'Avaliação', 30),
    ('massagem-terapias', 'Massagem relaxante', 'Sessão de massagem relaxante', 'Relaxante', 60),
    ('massagem-terapias', 'Massagem terapêutica', 'Sessão de massagem terapêutica', 'Terapêutica', 60),
    ('pet-shop-banho-tosa', 'Banho', 'Banho completo para pet', 'Higiene', 60),
    ('pet-shop-banho-tosa', 'Tosa higiênica', 'Tosa higiênica e acabamento', 'Tosa', 45),
    ('clinica-odontologica', 'Avaliação odontológica', 'Consulta de avaliação', 'Consulta', 45),
    ('clinica-odontologica', 'Limpeza dental', 'Profilaxia e limpeza dental', 'Prevenção', 60),
    ('personal-trainer-academia', 'Avaliação física', 'Avaliação física inicial', 'Avaliação', 60),
    ('personal-trainer-academia', 'Treino individual', 'Sessão de treino individual', 'Treino', 60),
    ('yoga-pilates', 'Aula de yoga', 'Aula individual de yoga', 'Yoga', 60),
    ('yoga-pilates', 'Aula de pilates', 'Aula individual de pilates', 'Pilates', 60),
    ('sobrancelhas-cilios', 'Design de sobrancelhas', 'Design e acabamento das sobrancelhas', 'Sobrancelhas', 30),
    ('sobrancelhas-cilios', 'Extensão de cílios', 'Aplicação de extensão de cílios', 'Cílios', 120),
    ('maquiagem', 'Maquiagem social', 'Maquiagem para eventos', 'Social', 60),
    ('maquiagem', 'Maquiagem profissional', 'Maquiagem para produção profissional', 'Profissional', 90),
    ('spa', 'Ritual relaxante', 'Ritual de relaxamento no spa', 'Relaxamento', 90),
    ('spa', 'Hidratação corporal', 'Hidratação e cuidado corporal', 'Corporal', 60),
    ('clinica-consultorio', 'Consulta', 'Consulta clínica', 'Consulta', 60),
    ('clinica-consultorio', 'Retorno', 'Retorno de consulta', 'Consulta', 30),
    ('fisioterapia', 'Avaliação fisioterapêutica', 'Avaliação funcional inicial', 'Avaliação', 60),
    ('fisioterapia', 'Sessão de fisioterapia', 'Sessão individual de fisioterapia', 'Sessão', 60),
    ('psicologia', 'Sessão de psicoterapia', 'Atendimento psicológico individual', 'Sessão', 50),
    ('psicologia', 'Avaliação psicológica', 'Avaliação psicológica inicial', 'Avaliação', 60),
    ('joalheria-servicos-especializados', 'Avaliação de peça', 'Avaliação de joia ou peça especializada', 'Avaliação', 30),
    ('joalheria-servicos-especializados', 'Ajuste ou reparo', 'Ajuste e reparo de peça', 'Reparo', 60),
    ('estetica-automotiva', 'Lavagem detalhada', 'Lavagem detalhada do veículo', 'Lavagem', 120),
    ('estetica-automotiva', 'Higienização interna', 'Higienização interna automotiva', 'Higienização', 180),
    ('servicos-de-limpeza', 'Limpeza residencial', 'Limpeza geral residencial', 'Residencial', 180),
    ('servicos-de-limpeza', 'Limpeza comercial', 'Limpeza geral comercial', 'Comercial', 240),
    ('fotografia', 'Ensaio fotográfico', 'Ensaio fotográfico individual', 'Ensaio', 120),
    ('fotografia', 'Cobertura de evento', 'Cobertura fotográfica de evento', 'Evento', 240),
    ('aulas-professores-particulares', 'Aula particular', 'Aula individual personalizada', 'Aula', 60),
    ('aulas-professores-particulares', 'Aula experimental', 'Primeira aula ou avaliação', 'Aula', 45)
) AS seed(slug, name, description, category, duration_minutes)
JOIN public.segments s ON s.slug = seed.slug
WHERE NOT EXISTS (
  SELECT 1 FROM public.service_templates existing
  WHERE existing.business_id IS NULL
    AND existing.segment_id = s.id
    AND lower(existing.name) = lower(seed.name)
);

-- Copy selected global suggestions into a tenant-owned services catalog.
CREATE OR REPLACE FUNCTION public.copy_catalog_services(
  _business_id uuid,
  _segment_id uuid,
  _template_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  copied integer;
  business_segment_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_business_role(auth.uid(), _business_id, 'owner') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT id INTO business_segment_id
  FROM public.business_segments
  WHERE business_id = _business_id
    AND segment_id = _segment_id
    AND active;

  IF business_segment_id IS NULL THEN
    RAISE EXCEPTION 'SEGMENT_NOT_ACTIVE_FOR_BUSINESS';
  END IF;

  INSERT INTO public.services (
    business_id, name, description, category, price_cents,
    duration_minutes, image_url, allows_parallel, active, segment_id
  )
  SELECT _business_id, t.name, t.description, t.category, t.price_cents,
         t.duration_minutes, t.image_url, t.allows_parallel, true, business_segment_id
  FROM public.service_templates t
  WHERE t.id = ANY(_template_ids)
    AND t.business_id IS NULL
    AND t.segment_id = _segment_id
    AND t.active
    AND NOT EXISTS (
      SELECT 1 FROM public.services existing
      WHERE existing.business_id = _business_id
        AND existing.segment_id = business_segment_id
        AND lower(existing.name) = lower(t.name)
        AND existing.deleted_at IS NULL
    );

  GET DIAGNOSTICS copied = ROW_COUNT;
  RETURN copied;
END;
$$;

REVOKE ALL ON FUNCTION public.copy_catalog_services(uuid, uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.copy_catalog_services(uuid, uuid, uuid[]) TO authenticated, service_role;

-- Global catalog is publicly readable; only service_role may mutate global suggestions.
GRANT SELECT ON public.segments TO anon, authenticated;
GRANT ALL ON public.segments TO service_role;
ALTER TABLE public.segments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS segments_public_read ON public.segments;
CREATE POLICY segments_public_read ON public.segments
  FOR SELECT TO anon, authenticated USING (active);

DROP POLICY IF EXISTS service_templates_public_read ON public.service_templates;
DROP POLICY IF EXISTS service_templates_member_read ON public.service_templates;
DROP POLICY IF EXISTS service_templates_owner_write ON public.service_templates;
CREATE POLICY service_templates_global_read ON public.service_templates
  FOR SELECT TO anon, authenticated
  USING (business_id IS NULL AND active);
CREATE POLICY service_templates_legacy_member_read ON public.service_templates
  FOR SELECT TO authenticated
  USING (business_id IS NOT NULL AND public.is_business_member(auth.uid(), business_id));
CREATE POLICY service_templates_legacy_owner_write ON public.service_templates
  FOR ALL TO authenticated
  USING (business_id IS NOT NULL AND public.has_business_role(auth.uid(), business_id, 'owner'))
  WITH CHECK (business_id IS NOT NULL AND public.has_business_role(auth.uid(), business_id, 'owner'));

DROP POLICY IF EXISTS business_segments_public_read ON public.business_segments;
CREATE POLICY business_segments_public_read ON public.business_segments
  FOR SELECT TO anon, authenticated
  USING (slug <> 'geral' AND active AND EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id AND b.active
  ));

-- Never expose the technical Geral bucket as a commercial public segment.
CREATE OR REPLACE FUNCTION public.public_catalog(_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE bid uuid; result jsonb;
BEGIN
  SELECT id INTO bid FROM public.businesses WHERE slug = _slug AND active;
  IF bid IS NULL THEN RETURN NULL; END IF;

  SELECT jsonb_build_object(
    'segments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', bs.id, 'segment_id', seg.id, 'name', seg.name, 'slug', seg.slug,
        'description', seg.description, 'sort_order', seg.sort_order
      ) ORDER BY seg.sort_order, seg.name)
      FROM public.business_segments bs
      JOIN public.segments seg ON seg.id = bs.segment_id AND seg.active
      WHERE bs.business_id = bid AND bs.active AND bs.segment_id IS NOT NULL
    ), '[]'::jsonb),
    'services', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'description', s.description,
        'category', s.category, 'price_cents', s.price_cents,
        'duration_minutes', s.duration_minutes, 'image_url', s.image_url,
        'allows_parallel', s.allows_parallel,
        'segment_id', CASE WHEN bs.slug = 'geral' THEN NULL ELSE s.segment_id END
      ) ORDER BY s.category NULLS LAST, s.name)
      FROM public.services s
      LEFT JOIN public.business_segments bs ON bs.id = s.segment_id
      WHERE s.business_id = bid AND s.active AND s.deleted_at IS NULL
    ), '[]'::jsonb),
    'products', CASE WHEN public.business_has_feature(bid, 'inventory') THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pr.id, 'name', pr.name, 'price_cents', pr.price_cents,
        'stock_quantity', pr.stock_quantity, 'image_url', pr.image_url
      ) ORDER BY pr.name)
      FROM public.products pr
      WHERE pr.business_id = bid AND pr.active AND pr.deleted_at IS NULL AND pr.stock_quantity > 0
    ), '[]'::jsonb) ELSE '[]'::jsonb END,
    'professionals', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'photo_url', p.photo_url, 'bio', p.bio
      ) ORDER BY p.name)
      FROM public.professionals p
      WHERE p.business_id = bid AND p.active AND p.deleted_at IS NULL
    ), '[]'::jsonb),
    'links', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'professional_id', ps.professional_id, 'service_id', ps.service_id
      ))
      FROM public.professional_services ps
      JOIN public.professionals p ON p.id = ps.professional_id AND p.active AND p.deleted_at IS NULL
      WHERE ps.business_id = bid
    ), '[]'::jsonb),
    'serviceConflicts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'service_id', sc.service_id,
        'conflicting_service_id', sc.conflicting_service_id,
        'reason', sc.reason
      ))
      FROM public.service_conflicts sc WHERE sc.business_id = bid
    ), '[]'::jsonb),
    'businessHours', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'weekday', h.weekday, 'opens_at', h.opens_at,
        'closes_at', h.closes_at, 'closed', h.closed
      ) ORDER BY h.weekday)
      FROM public.business_hours h WHERE h.business_id = bid
    ), '[]'::jsonb),
    'professionalHours', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'professional_id', ph.professional_id, 'weekday', ph.weekday,
        'starts_at', ph.starts_at, 'ends_at', ph.ends_at,
        'enabled', ph.enabled, 'lunch_starts_at', ph.lunch_starts_at,
        'lunch_ends_at', ph.lunch_ends_at
      ))
      FROM public.professional_hours ph
      JOIN public.professionals p ON p.id = ph.professional_id AND p.active AND p.deleted_at IS NULL
      WHERE ph.business_id = bid
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.public_catalog(text) TO anon, authenticated;

-- Keep legacy Geral hidden from commercial segment lists when it has no services.
UPDATE public.business_segments bs
SET active = false, updated_at = now()
WHERE bs.slug = 'geral'
  AND NOT EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.business_id = bs.business_id
      AND s.segment_id = bs.id
      AND s.deleted_at IS NULL
  );

COMMENT ON TABLE public.segments IS 'Global commercial service catalog segments.';
COMMENT ON TABLE public.service_templates IS 'Global catalog suggestions plus preserved legacy tenant snapshots.';
COMMENT ON FUNCTION public.copy_catalog_services(uuid, uuid, uuid[]) IS 'Copies selected global catalog suggestions into a tenant-owned services catalog.';
