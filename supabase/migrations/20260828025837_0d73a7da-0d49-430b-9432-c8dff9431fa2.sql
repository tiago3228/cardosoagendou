-- =========================================================
-- PHASE 1: SECURITY HARDENING + REAL BILLING FOUNDATIONS
-- =========================================================

-- ---------- A. PLATFORM SETTINGS ----------
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_settings_master_read ON public.platform_settings;
CREATE POLICY platform_settings_master_read ON public.platform_settings
  FOR SELECT TO authenticated USING (public.is_master(auth.uid()));
DROP TRIGGER IF EXISTS platform_settings_updated ON public.platform_settings;
CREATE TRIGGER platform_settings_updated BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.platform_settings (key, value, description) VALUES
  ('billing.grace_period_days', '7'::jsonb, 'Dias de tolerância após falha de pagamento antes da suspensão'),
  ('billing.provider', '"asaas"'::jsonb, 'Gateway de pagamento ativo')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.platform_setting_int(_key text, _default integer)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT (value #>> '{}')::integer FROM public.platform_settings WHERE key = _key), _default);
$$;

-- ---------- B. PLANS: ENTITLEMENTS ----------
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS provider_price_ref text;

UPDATE public.plans SET professional_limit = 5
  WHERE professional_limit = 3 AND code <> 'PREMIUM';

UPDATE public.plans SET features = jsonb_build_object(
  'appointments', true, 'clients', true, 'services', true,
  'inventory', professional_limit IS NULL OR professional_limit > 1,
  'reports', professional_limit IS NULL OR professional_limit > 1,
  'commissions', professional_limit IS NULL OR professional_limit > 1
) WHERE features = '{}'::jsonb;

-- ---------- C. SUBSCRIPTIONS: BILLING FIELDS ----------
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS amount_cents integer;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'BRL';
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS trial_started_at timestamptz;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS grace_expires_at timestamptz;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS last_payment_at timestamptz;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS provider_price_ref text;
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_business_uniq ON public.subscriptions(business_id);
CREATE INDEX IF NOT EXISTS subscriptions_provider_sub_idx ON public.subscriptions(provider, provider_subscription_id);

-- ---------- D. PAYMENTS ----------
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  provider text NOT NULL,
  provider_payment_id text NOT NULL,
  provider_event_id text,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'BRL',
  status text NOT NULL,
  payment_method payment_method,
  description text,
  invoice_url text,
  pix_payload text,
  paid_at timestamptz,
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payments_owner_read ON public.payments;
CREATE POLICY payments_owner_read ON public.payments
  FOR SELECT TO authenticated
  USING (public.has_business_role(auth.uid(), business_id, 'owner'::app_role));
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_payment_uniq
  ON public.payments(provider, provider_payment_id);
CREATE INDEX IF NOT EXISTS payments_business_idx ON public.payments(business_id, created_at DESC);
DROP TRIGGER IF EXISTS payments_updated ON public.payments;
CREATE TRIGGER payments_updated BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- E. WEBHOOK IDEMPOTENCY ----------
CREATE UNIQUE INDEX IF NOT EXISTS payment_events_provider_external_uniq
  ON public.payment_events(provider, external_id);
ALTER TABLE public.payment_events ADD COLUMN IF NOT EXISTS result text;

-- ---------- F. PROFESSIONAL INVITES ----------
CREATE TABLE IF NOT EXISTS public.professional_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  email text NOT NULL,
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'PENDING',
  invited_by uuid,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '14 days',
  accepted_at timestamptz,
  accepted_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.professional_invites TO authenticated;
GRANT ALL ON public.professional_invites TO service_role;
ALTER TABLE public.professional_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invites_owner_read ON public.professional_invites;
CREATE POLICY invites_owner_read ON public.professional_invites
  FOR SELECT TO authenticated
  USING (public.has_business_role(auth.uid(), business_id, 'owner'::app_role));
CREATE INDEX IF NOT EXISTS invites_business_idx ON public.professional_invites(business_id);
DROP TRIGGER IF EXISTS invites_updated ON public.professional_invites;
CREATE TRIGGER invites_updated BEFORE UPDATE ON public.professional_invites
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- G. CENTRAL AUTHORIZATION / ENTITLEMENT FUNCTIONS ----------
CREATE OR REPLACE FUNCTION public.is_business_owner(_user_id uuid, _business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_business_role(_user_id, _business_id, 'owner'::app_role);
$$;

-- Single source of truth for "can this business be booked right now".
CREATE OR REPLACE FUNCTION public.business_booking_state(_business_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b record; s record; grace integer;
BEGIN
  SELECT active INTO b FROM public.businesses WHERE id = _business_id;
  IF b IS NULL THEN RETURN 'NOT_FOUND'; END IF;
  IF NOT b.active THEN RETURN 'INACTIVE'; END IF;
  SELECT status, current_period_end, grace_expires_at INTO s
    FROM public.subscriptions WHERE business_id = _business_id;
  IF s IS NULL THEN RETURN 'BLOCKED'; END IF;
  grace := public.platform_setting_int('billing.grace_period_days', 7);
  IF s.status IN ('TRIALING','ACTIVE') THEN
    IF s.current_period_end < now() THEN RETURN 'BLOCKED'; END IF;
    RETURN 'OPEN';
  END IF;
  IF s.status = 'PAST_DUE' THEN
    IF now() <= COALESCE(s.grace_expires_at, s.current_period_end + (grace || ' days')::interval)
      THEN RETURN 'GRACE';
    END IF;
    RETURN 'BLOCKED';
  END IF;
  RETURN 'BLOCKED';
END; $$;

CREATE OR REPLACE FUNCTION public.business_accepts_bookings(_business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.business_booking_state(_business_id) IN ('OPEN','GRACE');
$$;

CREATE OR REPLACE FUNCTION public.business_entitlements(_business_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_business_member(auth.uid(), _business_id) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  SELECT jsonb_build_object(
    'plan_code', p.code,
    'plan_name', p.name,
    'professional_limit', p.professional_limit,
    'status', s.status,
    'booking_state', public.business_booking_state(_business_id),
    'accepts_bookings', public.business_accepts_bookings(_business_id),
    'features', COALESCE(p.features, '{}'::jsonb),
    'current_period_end', s.current_period_end,
    'trial_ends_at', s.trial_ends_at,
    'cancel_at_period_end', s.cancel_at_period_end,
    'grace_period_days', public.platform_setting_int('billing.grace_period_days', 7)
  ) INTO result
  FROM public.subscriptions s JOIN public.plans p ON p.id = s.plan_id
  WHERE s.business_id = _business_id;
  RETURN COALESCE(result, jsonb_build_object(
    'plan_code', NULL, 'professional_limit', 0, 'status', NULL,
    'booking_state', public.business_booking_state(_business_id),
    'accepts_bookings', false, 'features', '{}'::jsonb));
END; $$;
REVOKE ALL ON FUNCTION public.business_entitlements(uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.can_add_professional(_business_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE lim integer; used integer;
BEGIN
  IF NOT public.business_accepts_bookings(_business_id) THEN RETURN false; END IF;
  lim := public.business_professional_limit(_business_id);
  IF lim IS NULL THEN RETURN true; END IF;
  SELECT count(*) INTO used FROM public.professionals
    WHERE business_id = _business_id AND active AND deleted_at IS NULL;
  RETURN used < lim;
END; $$;

-- Plan limit enforcement now also refuses while the subscription is blocked.
CREATE OR REPLACE FUNCTION public.enforce_professional_limit()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE lim integer; used integer; state text;
BEGIN
  IF NEW.deleted_at IS NOT NULL OR NEW.active = false THEN RETURN NEW; END IF;
  state := public.business_booking_state(NEW.business_id);
  IF state NOT IN ('OPEN','GRACE') THEN
    RAISE EXCEPTION 'SUBSCRIPTION_INACTIVE: assinatura % — regularize o pagamento para gerenciar profissionais', state;
  END IF;
  lim := public.business_professional_limit(NEW.business_id);
  IF lim IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO used FROM public.professionals
    WHERE business_id = NEW.business_id AND active AND deleted_at IS NULL AND id <> NEW.id;
  IF used + 1 > lim THEN
    RAISE EXCEPTION 'PLAN_LIMIT_REACHED: plan allows % active professionals', lim;
  END IF;
  RETURN NEW;
END; $$;

-- Defense in depth: no new appointment for a blocked business.
CREATE OR REPLACE FUNCTION public.enforce_booking_allowed()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT public.business_accepts_bookings(NEW.business_id) THEN
    RAISE EXCEPTION 'BOOKING_DISABLED: estabelecimento temporariamente indisponível para novos agendamentos';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS appointments_booking_allowed ON public.appointments;
CREATE TRIGGER appointments_booking_allowed BEFORE INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_allowed();

-- Professional invite acceptance: links an authenticated user to a professional record.
CREATE OR REPLACE FUNCTION public.accept_professional_invite(_token text, _full_name text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv record; uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  SELECT * INTO inv FROM public.professional_invites
    WHERE token = _token AND status = 'PENDING' AND expires_at > now();
  IF inv IS NULL THEN RAISE EXCEPTION 'INVITE_INVALID'; END IF;

  INSERT INTO public.profiles (id, full_name)
  VALUES (uid, COALESCE(_full_name, 'Profissional'))
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.professionals SET user_id = uid
    WHERE id = inv.professional_id AND business_id = inv.business_id;

  INSERT INTO public.user_roles (user_id, business_id, role)
  VALUES (uid, inv.business_id, 'professional')
  ON CONFLICT (user_id, business_id, role) DO NOTHING;

  UPDATE public.professional_invites
    SET status = 'ACCEPTED', accepted_at = now(), accepted_user_id = uid
    WHERE id = inv.id;

  INSERT INTO public.audit_logs (business_id, actor_user_id, action, entity, entity_id, data)
  VALUES (inv.business_id, uid, 'professional.invite_accepted', 'professional', inv.professional_id::text, '{}'::jsonb);

  RETURN jsonb_build_object('business_id', inv.business_id, 'professional_id', inv.professional_id);
END; $$;
REVOKE ALL ON FUNCTION public.accept_professional_invite(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_professional_invite(text, text) TO authenticated;

-- Roles are never client-writable; block privilege escalation explicitly.
CREATE OR REPLACE FUNCTION public.guard_role_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NEW.role = 'master' THEN
      RAISE EXCEPTION 'FORBIDDEN: master role cannot be granted through the application';
    END IF;
    IF TG_OP = 'INSERT' AND NEW.role = 'owner' AND NOT public.is_master(auth.uid()) THEN
      RAISE EXCEPTION 'FORBIDDEN: owner role cannot be self-granted';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS user_roles_guard ON public.user_roles;
CREATE TRIGGER user_roles_guard BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.guard_role_changes();

-- Tenant keys are immutable once written.
CREATE OR REPLACE FUNCTION public.guard_tenant_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.business_id IS DISTINCT FROM OLD.business_id THEN
    RAISE EXCEPTION 'FORBIDDEN: business_id is immutable';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS appointments_tenant_immutable ON public.appointments;
CREATE TRIGGER appointments_tenant_immutable BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_immutable();
DROP TRIGGER IF EXISTS clients_tenant_immutable ON public.clients;
CREATE TRIGGER clients_tenant_immutable BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_immutable();
DROP TRIGGER IF EXISTS services_tenant_immutable ON public.services;
CREATE TRIGGER services_tenant_immutable BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_immutable();
DROP TRIGGER IF EXISTS professionals_tenant_immutable ON public.professionals;
CREATE TRIGGER professionals_tenant_immutable BEFORE UPDATE ON public.professionals
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_immutable();
DROP TRIGGER IF EXISTS products_tenant_immutable ON public.products;
CREATE TRIGGER products_tenant_immutable BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_immutable();
DROP TRIGGER IF EXISTS subscriptions_tenant_immutable ON public.subscriptions;
CREATE TRIGGER subscriptions_tenant_immutable BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_immutable();

-- ---------- H. RLS REWORK ----------

-- businesses: public sees only bookable businesses; e-mail is never anon-readable.
DROP POLICY IF EXISTS businesses_public_read ON public.businesses;
CREATE POLICY businesses_public_read ON public.businesses
  FOR SELECT TO anon USING (active);
DROP POLICY IF EXISTS businesses_member_read ON public.businesses;
CREATE POLICY businesses_member_read ON public.businesses
  FOR SELECT TO authenticated USING (public.is_business_member(auth.uid(), id));
REVOKE SELECT (email) ON public.businesses FROM anon;

-- professionals: anon sees only public fields of active professionals.
DROP POLICY IF EXISTS professionals_public_read ON public.professionals;
CREATE POLICY professionals_public_read ON public.professionals
  FOR SELECT TO anon USING (active AND deleted_at IS NULL);
REVOKE SELECT (user_id, commission_percent) ON public.professionals FROM anon;
DROP POLICY IF EXISTS professionals_member_read ON public.professionals;
CREATE POLICY professionals_owner_read ON public.professionals
  FOR SELECT TO authenticated
  USING (public.is_business_owner(auth.uid(), business_id) OR public.is_master(auth.uid()));
CREATE POLICY professionals_self_read ON public.professionals
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS professionals_self_update ON public.professionals;
CREATE POLICY professionals_self_update ON public.professionals
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- services: anon reads active services of bookable businesses.
DROP POLICY IF EXISTS services_public_read ON public.services;
CREATE POLICY services_public_read ON public.services
  FOR SELECT TO anon USING (active AND deleted_at IS NULL);
DROP POLICY IF EXISTS services_member_read ON public.services;
CREATE POLICY services_member_read ON public.services
  FOR SELECT TO authenticated USING (public.is_business_member(auth.uid(), business_id));

-- business hours: no more USING(true).
DROP POLICY IF EXISTS business_hours_public_read ON public.business_hours;
CREATE POLICY business_hours_public_read ON public.business_hours
  FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.active));
DROP POLICY IF EXISTS business_hours_member_read ON public.business_hours;
CREATE POLICY business_hours_member_read ON public.business_hours
  FOR SELECT TO authenticated USING (public.is_business_member(auth.uid(), business_id));

-- professional hours: anon only for active professionals; staff only their own.
DROP POLICY IF EXISTS professional_hours_public_read ON public.professional_hours;
CREATE POLICY professional_hours_public_read ON public.professional_hours
  FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.professionals p
                 WHERE p.id = professional_id AND p.active AND p.deleted_at IS NULL));
DROP POLICY IF EXISTS professional_hours_owner_read ON public.professional_hours;
CREATE POLICY professional_hours_owner_read ON public.professional_hours
  FOR SELECT TO authenticated
  USING (public.is_business_owner(auth.uid(), business_id)
         OR professional_id = public.my_professional_id(business_id));
DROP POLICY IF EXISTS professional_hours_self_write ON public.professional_hours;
CREATE POLICY professional_hours_self_write ON public.professional_hours
  FOR ALL TO authenticated
  USING (professional_id = public.my_professional_id(business_id))
  WITH CHECK (professional_id = public.my_professional_id(business_id));

-- professional_services
DROP POLICY IF EXISTS prof_services_public_read ON public.professional_services;
CREATE POLICY prof_services_public_read ON public.professional_services
  FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.professionals p
                 WHERE p.id = professional_id AND p.active AND p.deleted_at IS NULL));
DROP POLICY IF EXISTS prof_services_member_read ON public.professional_services;
CREATE POLICY prof_services_member_read ON public.professional_services
  FOR SELECT TO authenticated USING (public.is_business_member(auth.uid(), business_id));

-- clients: owner sees all; professional only clients they served.
DROP POLICY IF EXISTS clients_member_read ON public.clients;
CREATE POLICY clients_owner_read ON public.clients
  FOR SELECT TO authenticated
  USING (public.is_business_owner(auth.uid(), business_id) OR public.is_master(auth.uid()));
CREATE POLICY clients_professional_read ON public.clients
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.appointments a
                 WHERE a.client_id = clients.id
                   AND a.professional_id = public.my_professional_id(clients.business_id)));

-- appointments: professional sees only their own.
DROP POLICY IF EXISTS appointments_member_read ON public.appointments;
CREATE POLICY appointments_owner_read ON public.appointments
  FOR SELECT TO authenticated
  USING (public.is_business_owner(auth.uid(), business_id) OR public.is_master(auth.uid()));
CREATE POLICY appointments_professional_read ON public.appointments
  FOR SELECT TO authenticated
  USING (professional_id = public.my_professional_id(business_id));

-- appointment_services follows the parent appointment.
DROP POLICY IF EXISTS appt_services_member_read ON public.appointment_services;
CREATE POLICY appt_services_scoped_read ON public.appointment_services
  FOR SELECT TO authenticated
  USING (public.is_business_owner(auth.uid(), business_id)
         OR EXISTS (SELECT 1 FROM public.appointments a
                    WHERE a.id = appointment_id
                      AND a.professional_id = public.my_professional_id(business_id)));

-- finance / billing / audit: owner (or master) only.
DROP POLICY IF EXISTS transactions_member_read ON public.transactions;
CREATE POLICY transactions_owner_read ON public.transactions
  FOR SELECT TO authenticated
  USING (public.is_business_owner(auth.uid(), business_id) OR public.is_master(auth.uid()));

DROP POLICY IF EXISTS subscriptions_member_read ON public.subscriptions;
CREATE POLICY subscriptions_owner_read ON public.subscriptions
  FOR SELECT TO authenticated
  USING (public.is_business_owner(auth.uid(), business_id) OR public.is_master(auth.uid()));

DROP POLICY IF EXISTS audit_member_read ON public.audit_logs;
CREATE POLICY audit_owner_read ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.is_business_owner(auth.uid(), business_id) OR public.is_master(auth.uid()));

DROP POLICY IF EXISTS notifications_member_read ON public.notifications;
CREATE POLICY notifications_owner_read ON public.notifications
  FOR SELECT TO authenticated
  USING (public.is_business_owner(auth.uid(), business_id) OR public.is_master(auth.uid()));

DROP POLICY IF EXISTS stock_member_read ON public.stock_movements;
CREATE POLICY stock_owner_read ON public.stock_movements
  FOR SELECT TO authenticated
  USING (public.is_business_owner(auth.uid(), business_id) OR public.is_master(auth.uid()));

DROP POLICY IF EXISTS products_member_read ON public.products;
CREATE POLICY products_member_read ON public.products
  FOR SELECT TO authenticated USING (public.is_business_member(auth.uid(), business_id));

-- user_roles: own rows, own business (owner), master.
DROP POLICY IF EXISTS user_roles_read ON public.user_roles;
CREATE POLICY user_roles_read ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()
         OR public.is_business_owner(auth.uid(), business_id)
         OR public.is_master(auth.uid()));

-- ---------- I. INDEXES ----------
CREATE INDEX IF NOT EXISTS appointments_business_start_idx ON public.appointments(business_id, starts_at);
CREATE INDEX IF NOT EXISTS appointments_prof_start_idx ON public.appointments(professional_id, starts_at);
CREATE INDEX IF NOT EXISTS clients_business_idx ON public.clients(business_id);
CREATE INDEX IF NOT EXISTS services_business_idx ON public.services(business_id);
CREATE INDEX IF NOT EXISTS professionals_business_idx ON public.professionals(business_id);
CREATE INDEX IF NOT EXISTS professionals_user_idx ON public.professionals(user_id);
CREATE INDEX IF NOT EXISTS user_roles_user_idx ON public.user_roles(user_id);
