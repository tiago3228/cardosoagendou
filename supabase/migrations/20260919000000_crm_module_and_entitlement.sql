-- CRM completo: tags, interações, tarefas e pipeline por negócio.
BEGIN;

CREATE TABLE IF NOT EXISTS public.crm_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#7c3aed',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, name)
);

CREATE TABLE IF NOT EXISTS public.crm_client_tags (
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.crm_tags(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, tag_id)
);

CREATE TABLE IF NOT EXISTS public.crm_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('NOTE','CALL','WHATSAPP','EMAIL','MEETING')),
  content text NOT NULL,
  next_action_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  due_at timestamptz,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','DONE','CANCELED')),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.crm_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  name text NOT NULL,
  whatsapp text,
  email text,
  source text,
  stage text NOT NULL DEFAULT 'NEW' CHECK (stage IN ('NEW','CONTACTED','PROPOSAL','NEGOTIATION','WON','LOST')),
  estimated_value_cents integer NOT NULL DEFAULT 0 CHECK (estimated_value_cents >= 0),
  loss_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_interactions_client_idx ON public.crm_interactions(business_id, client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_tasks_business_status_idx ON public.crm_tasks(business_id, status, due_at);
CREATE INDEX IF NOT EXISTS crm_leads_business_stage_idx ON public.crm_leads(business_id, stage, updated_at DESC);

ALTER TABLE public.crm_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_client_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_tags_owner_all ON public.crm_tags;
CREATE POLICY crm_tags_owner_all ON public.crm_tags FOR ALL TO authenticated
  USING (public.is_business_owner(auth.uid(), business_id))
  WITH CHECK (public.is_business_owner(auth.uid(), business_id));
DROP POLICY IF EXISTS crm_client_tags_owner_all ON public.crm_client_tags;
CREATE POLICY crm_client_tags_owner_all ON public.crm_client_tags FOR ALL TO authenticated
  USING (public.is_business_owner(auth.uid(), business_id))
  WITH CHECK (public.is_business_owner(auth.uid(), business_id));
DROP POLICY IF EXISTS crm_interactions_member_all ON public.crm_interactions;
CREATE POLICY crm_interactions_member_all ON public.crm_interactions FOR ALL TO authenticated
  USING (public.is_business_member(auth.uid(), business_id))
  WITH CHECK (public.is_business_member(auth.uid(), business_id));
DROP POLICY IF EXISTS crm_tasks_member_all ON public.crm_tasks;
CREATE POLICY crm_tasks_member_all ON public.crm_tasks FOR ALL TO authenticated
  USING (public.is_business_member(auth.uid(), business_id))
  WITH CHECK (public.is_business_member(auth.uid(), business_id));
DROP POLICY IF EXISTS crm_leads_owner_all ON public.crm_leads;
CREATE POLICY crm_leads_owner_all ON public.crm_leads FOR ALL TO authenticated
  USING (public.is_business_owner(auth.uid(), business_id))
  WITH CHECK (public.is_business_owner(auth.uid(), business_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_tags, public.crm_client_tags, public.crm_interactions, public.crm_tasks, public.crm_leads TO authenticated;
GRANT ALL ON public.crm_tags, public.crm_client_tags, public.crm_interactions, public.crm_tasks, public.crm_leads TO service_role;

-- CRM é um benefício do plano Ilimitado; trials continuam com acesso completo.
UPDATE public.plans
SET features = COALESCE(features, '{}'::jsonb) || jsonb_build_object('crm', true), updated_at = now()
WHERE code = 'UNLIMITED';

CREATE OR REPLACE FUNCTION public.business_entitlements(_business_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb; state text; entitled boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_business_member(auth.uid(), _business_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  state := public.business_booking_state(_business_id); entitled := state IN ('OPEN','GRACE');
  SELECT jsonb_build_object(
    'plan_code', p.code, 'plan_name', p.name,
    'professional_limit', CASE WHEN entitled AND s.status = 'TRIALING' THEN NULL WHEN entitled THEN p.professional_limit ELSE 0 END,
    'status', s.status, 'booking_state', state, 'entitled', entitled, 'accepts_bookings', entitled,
    'features', CASE WHEN NOT entitled THEN '{}'::jsonb WHEN s.status = 'TRIALING' THEN jsonb_build_object(
      'appointments', true, 'clients', true, 'services', true, 'inventory', true, 'reports', true,
      'commissions', true, 'finance', true, 'team_manage', true, 'crm', true
    ) ELSE COALESCE(p.features, '{}'::jsonb) END,
    'current_period_end', s.current_period_end, 'trial_ends_at', s.trial_ends_at,
    'grace_expires_at', s.grace_expires_at, 'cancel_at_period_end', s.cancel_at_period_end,
    'grace_period_days', public.platform_setting_int('billing.grace_period_days', 7)
  ) INTO result FROM public.subscriptions s JOIN public.plans p ON p.id = s.plan_id WHERE s.business_id = _business_id;
  RETURN COALESCE(result, jsonb_build_object('plan_code', NULL, 'plan_name', NULL, 'professional_limit', 0,
    'status', NULL, 'booking_state', state, 'entitled', false, 'accepts_bookings', false,
    'features', '{}'::jsonb, 'grace_period_days', public.platform_setting_int('billing.grace_period_days', 7)));
END $$;

COMMIT;
