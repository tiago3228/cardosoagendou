-- CRM avançado do Agendou: jornada comercial, histórico, follow-ups e retenção.
BEGIN;

-- Classificação e dados complementares na ficha do cliente.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS instagram text,
  ADD COLUMN IF NOT EXISTS crm_status text NOT NULL DEFAULT 'novo',
  ADD COLUMN IF NOT EXISTS is_vip boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_contact_at timestamptz;

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_crm_status_check;
ALTER TABLE public.clients ADD CONSTRAINT clients_crm_status_check
  CHECK (crm_status IN ('novo','ativo','vip','inativo','perdido'));

-- Fontes configuráveis para leads.
CREATE TABLE IF NOT EXISTS public.crm_lead_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, name)
);
CREATE INDEX IF NOT EXISTS crm_lead_sources_business_idx ON public.crm_lead_sources(business_id);

-- Expande a tabela criada na primeira versão do CRM.
ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS instagram text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS source_id uuid REFERENCES public.crm_lead_sources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS interested_service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS interested_professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS first_contact_at timestamptz,
  ADD COLUMN IF NOT EXISTS owner_id uuid,
  ADD COLUMN IF NOT EXISTS lost_reason text,
  ADD COLUMN IF NOT EXISTS converted_at timestamptz;

-- Compatibilidade com os seis estágios da primeira versão: todos passam para a jornada avançada.
UPDATE public.crm_leads SET stage = CASE stage
  WHEN 'NEW' THEN 'novo_lead'
  WHEN 'CONTACTED' THEN 'primeiro_contato'
  WHEN 'PROPOSAL' THEN 'orcamento_enviado'
  WHEN 'NEGOTIATION' THEN 'interessado'
  WHEN 'WON' THEN 'converteu'
  WHEN 'LOST' THEN 'perdido'
  ELSE lower(stage)
END;
ALTER TABLE public.crm_leads DROP CONSTRAINT IF EXISTS crm_leads_stage_check;
ALTER TABLE public.crm_leads ADD CONSTRAINT crm_leads_stage_check CHECK
  (stage IN ('novo_lead','primeiro_contato','interessado','orcamento_enviado','aguardando_resposta','agendou','compareceu','converteu','fidelizado','perdido'));
CREATE INDEX IF NOT EXISTS crm_leads_business_contact_idx ON public.crm_leads(business_id, whatsapp, email);

CREATE TABLE IF NOT EXISTS public.crm_lead_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  previous_stage text,
  new_stage text NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_stage_history_lead_idx ON public.crm_lead_stage_history(lead_id, created_at DESC);

-- Enriquece interações existentes sem remover os campos da primeira versão.
ALTER TABLE public.crm_interactions
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS result text,
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS occurred_at timestamptz NOT NULL DEFAULT now();
UPDATE public.crm_interactions SET description = COALESCE(description, content) WHERE description IS NULL;

CREATE TABLE IF NOT EXISTS public.crm_follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  due_at timestamptz NOT NULL,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','DONE','CANCELED')),
  completed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (client_id IS NOT NULL OR lead_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS crm_follow_ups_business_due_idx ON public.crm_follow_ups(business_id, status, due_at);

CREATE TABLE IF NOT EXISTS public.crm_retention_settings (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  inactivity_days integer NOT NULL DEFAULT 60 CHECK (inactivity_days BETWEEN 1 AND 730),
  return_days integer NOT NULL DEFAULT 30 CHECK (return_days BETWEEN 1 AND 730),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  channel text NOT NULL DEFAULT 'WHATSAPP' CHECK (channel IN ('WHATSAPP','EMAIL','MESSAGE')),
  body text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, name)
);

-- Registro automático da evolução do funil.
CREATE OR REPLACE FUNCTION public.crm_record_stage_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.crm_lead_stage_history (business_id, lead_id, new_stage, changed_by)
    VALUES (NEW.business_id, NEW.id, NEW.stage, auth.uid());
  ELSIF OLD.stage IS DISTINCT FROM NEW.stage THEN
    INSERT INTO public.crm_lead_stage_history (business_id, lead_id, previous_stage, new_stage, changed_by)
    VALUES (NEW.business_id, NEW.id, OLD.stage, NEW.stage, auth.uid());
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS crm_leads_record_stage ON public.crm_leads;
CREATE TRIGGER crm_leads_record_stage AFTER INSERT OR UPDATE OF stage ON public.crm_leads
FOR EACH ROW EXECUTE FUNCTION public.crm_record_stage_change();

CREATE OR REPLACE FUNCTION public.crm_touch_lead_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS crm_leads_touch_updated_at ON public.crm_leads;
CREATE TRIGGER crm_leads_touch_updated_at BEFORE UPDATE ON public.crm_leads
FOR EACH ROW EXECUTE FUNCTION public.crm_touch_lead_updated_at();

-- Conversão segura: reutiliza cliente existente por WhatsApp ou e-mail antes de inserir.
CREATE OR REPLACE FUNCTION public.crm_convert_lead(_lead_id uuid)
RETURNS public.clients LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.crm_leads; c public.clients; phone_digits text;
BEGIN
  SELECT * INTO l FROM public.crm_leads WHERE id = _lead_id
    AND public.is_business_member(auth.uid(), business_id) FOR UPDATE;
  IF l.id IS NULL THEN RAISE EXCEPTION 'Lead não encontrado'; END IF;
  phone_digits := NULLIF(regexp_replace(COALESCE(l.whatsapp, ''), '\D', '', 'g'), '');
  SELECT * INTO c FROM public.clients
   WHERE business_id = l.business_id
     AND ((phone_digits IS NOT NULL AND regexp_replace(COALESCE(whatsapp, ''), '\D', '', 'g') = phone_digits)
       OR (l.email IS NOT NULL AND lower(email) = lower(l.email)))
   ORDER BY created_at LIMIT 1;
  IF c.id IS NULL THEN
    INSERT INTO public.clients (business_id, name, whatsapp, email, instagram, birth_date, notes)
    VALUES (l.business_id, l.name, l.whatsapp, l.email, l.instagram, l.birth_date, l.notes)
    RETURNING * INTO c;
  END IF;
  UPDATE public.crm_leads SET client_id = c.id, stage = 'converteu', converted_at = now() WHERE id = l.id;
  UPDATE public.clients SET crm_status = 'ativo', last_contact_at = now() WHERE id = c.id;
  RETURN c;
END $$;
GRANT EXECUTE ON FUNCTION public.crm_convert_lead(uuid) TO authenticated;

-- Leitura de retenção para o frontend: último atendimento, próximo atendimento e total gasto.
CREATE OR REPLACE FUNCTION public.crm_retention_snapshot(_business_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH settings AS (
    SELECT inactivity_days, return_days FROM public.crm_retention_settings WHERE business_id = _business_id
  ),
  history AS (
    SELECT a.client_id, max(a.starts_at) FILTER (WHERE a.status = 'COMPLETED') AS last_attended,
      min(a.starts_at) FILTER (WHERE a.starts_at >= now() AND a.status NOT IN ('CANCELED','NO_SHOW')) AS next_visit,
      COALESCE(sum(a.total_price_cents) FILTER (WHERE a.status = 'COMPLETED'), 0) AS total_spent,
      count(*) FILTER (WHERE a.status = 'COMPLETED') AS visit_count
    FROM public.appointments a WHERE a.business_id = _business_id AND a.client_id IS NOT NULL GROUP BY a.client_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'whatsapp', c.whatsapp,
    'email', c.email, 'last_attended', h.last_attended, 'next_visit', h.next_visit,
    'total_spent_cents', h.total_spent, 'visit_count', h.visit_count,
    'segment', CASE WHEN c.is_vip THEN 'vip' WHEN h.next_visit IS NULL AND h.last_attended IS NOT NULL
      AND h.last_attended < now() - make_interval(days => COALESCE((SELECT inactivity_days FROM settings), 60)) THEN 'inactive'
      WHEN h.visit_count > 1 THEN 'recurring' ELSE 'new' END)), '[]'::jsonb)
  FROM public.clients c JOIN history h ON h.client_id = c.id
  WHERE c.business_id = _business_id;
$$;
GRANT EXECUTE ON FUNCTION public.crm_retention_snapshot(uuid) TO authenticated;

-- Segurança multiempresa.
DROP POLICY IF EXISTS crm_leads_owner_all ON public.crm_leads;
DROP POLICY IF EXISTS crm_leads_member_all ON public.crm_leads;
CREATE POLICY crm_leads_member_all ON public.crm_leads FOR ALL TO authenticated
  USING (public.is_business_member(auth.uid(), business_id)) WITH CHECK (public.is_business_member(auth.uid(), business_id));
ALTER TABLE public.crm_lead_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_lead_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_retention_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_message_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_sources_member_all ON public.crm_lead_sources;
CREATE POLICY crm_sources_member_all ON public.crm_lead_sources FOR ALL TO authenticated
  USING (public.is_business_member(auth.uid(), business_id)) WITH CHECK (public.is_business_member(auth.uid(), business_id));
DROP POLICY IF EXISTS crm_stage_history_member_all ON public.crm_lead_stage_history;
CREATE POLICY crm_stage_history_member_all ON public.crm_lead_stage_history FOR ALL TO authenticated
  USING (public.is_business_member(auth.uid(), business_id)) WITH CHECK (public.is_business_member(auth.uid(), business_id));
DROP POLICY IF EXISTS crm_follow_ups_member_all ON public.crm_follow_ups;
CREATE POLICY crm_follow_ups_member_all ON public.crm_follow_ups FOR ALL TO authenticated
  USING (public.is_business_member(auth.uid(), business_id)) WITH CHECK (public.is_business_member(auth.uid(), business_id));
DROP POLICY IF EXISTS crm_retention_settings_owner_all ON public.crm_retention_settings;
CREATE POLICY crm_retention_settings_owner_all ON public.crm_retention_settings FOR ALL TO authenticated
  USING (public.has_business_role(auth.uid(), business_id, 'owner')) WITH CHECK (public.has_business_role(auth.uid(), business_id, 'owner'));
DROP POLICY IF EXISTS crm_templates_owner_all ON public.crm_message_templates;
CREATE POLICY crm_templates_owner_all ON public.crm_message_templates FOR ALL TO authenticated
  USING (public.has_business_role(auth.uid(), business_id, 'owner')) WITH CHECK (public.has_business_role(auth.uid(), business_id, 'owner'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_lead_sources, public.crm_lead_stage_history, public.crm_follow_ups, public.crm_retention_settings, public.crm_message_templates TO authenticated;
GRANT ALL ON public.crm_lead_sources, public.crm_lead_stage_history, public.crm_follow_ups, public.crm_retention_settings, public.crm_message_templates TO service_role;

INSERT INTO public.crm_lead_sources (business_id, name)
SELECT b.id, source_name FROM public.businesses b
CROSS JOIN unnest(ARRAY['Instagram','WhatsApp','Google','Indicação','Site','Link público','Facebook','Anúncio','Outros']) AS source_name
ON CONFLICT (business_id, name) DO NOTHING;
INSERT INTO public.crm_retention_settings (business_id)
SELECT id FROM public.businesses ON CONFLICT (business_id) DO NOTHING;
INSERT INTO public.crm_message_templates (business_id, name, channel, body)
SELECT id, 'Reativação — sentimos sua falta', 'WHATSAPP', 'Olá, {{nome}}! Sentimos sua falta. Gostaria de verificar nossos horários disponíveis?'
FROM public.businesses ON CONFLICT (business_id, name) DO NOTHING;

COMMIT;
