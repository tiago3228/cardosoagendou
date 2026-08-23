-- ===== ENUMS =====
CREATE TYPE public.business_type AS ENUM ('BARBERSHOP','HAIR_SALON','BEAUTY_SALON','AESTHETIC_CLINIC','NAIL_SALON','MASSAGE','TATTOO','THERAPY','OTHER');
CREATE TYPE public.app_role AS ENUM ('master','owner','professional');
CREATE TYPE public.billing_interval AS ENUM ('MONTHLY','ANNUAL');
CREATE TYPE public.subscription_status AS ENUM ('TRIALING','ACTIVE','PAST_DUE','SUSPENDED','CANCELED');
CREATE TYPE public.appointment_status AS ENUM ('PENDING','CONFIRMED','IN_PROGRESS','COMPLETED','CANCELED','NO_SHOW');
CREATE TYPE public.transaction_type AS ENUM ('SERVICE_INCOME','PRODUCT_INCOME','COMMISSION','EXPENSE','SUBSCRIPTION');
CREATE TYPE public.stock_movement_type AS ENUM ('IN','OUT','ADJUST');
CREATE TYPE public.payment_method AS ENUM ('PIX','CREDIT_CARD');

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ===== PROFILES =====
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text NOT NULL DEFAULT '',
  email text,
  whatsapp text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ===== PLANS =====
CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  professional_limit integer,
  monthly_price_cents integer NOT NULL,
  annual_price_cents integer NOT NULL,
  annual_months_charged numeric(4,1) NOT NULL DEFAULT 10,
  trial_days integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plans TO anon, authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY plans_public_read ON public.plans FOR SELECT TO anon, authenticated USING (active);
CREATE TRIGGER plans_updated BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== BUSINESSES =====
CREATE TABLE public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  business_type public.business_type NOT NULL DEFAULT 'OTHER',
  description text,
  logo_url text,
  cover_url text,
  whatsapp text,
  email text,
  address text,
  booking_policy text,
  slot_interval_minutes integer NOT NULL DEFAULT 15,
  min_notice_minutes integer NOT NULL DEFAULT 60,
  max_advance_days integer NOT NULL DEFAULT 60,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.businesses TO anon;
GRANT SELECT, INSERT, UPDATE ON public.businesses TO authenticated;
GRANT ALL ON public.businesses TO service_role;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER businesses_updated BEFORE UPDATE ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== ROLES =====
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX user_roles_unique ON public.user_roles (user_id, coalesce(business_id, '00000000-0000-0000-0000-000000000000'::uuid), role);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ===== SECURITY HELPERS =====
CREATE OR REPLACE FUNCTION public.is_master(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'master');
$$;

CREATE OR REPLACE FUNCTION public.has_business_role(_user_id uuid, _business_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND business_id = _business_id AND role = _role
  ) OR public.is_master(_user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_business_member(_user_id uuid, _business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND business_id = _business_id
  ) OR public.is_master(_user_id);
$$;

CREATE POLICY profiles_self ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_master(auth.uid()));
CREATE POLICY profiles_insert_self ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

CREATE POLICY user_roles_read ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_business_member(auth.uid(), business_id));

CREATE POLICY businesses_public_read ON public.businesses FOR SELECT TO anon, authenticated USING (active);
CREATE POLICY businesses_member_read ON public.businesses FOR SELECT TO authenticated USING (public.is_business_member(auth.uid(), id));
CREATE POLICY businesses_owner_update ON public.businesses FOR UPDATE TO authenticated
  USING (public.has_business_role(auth.uid(), id, 'owner')) WITH CHECK (public.has_business_role(auth.uid(), id, 'owner'));

-- ===== BUSINESS HOURS =====
CREATE TABLE public.business_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  opens_at time NOT NULL DEFAULT '09:00',
  closes_at time NOT NULL DEFAULT '18:00',
  closed boolean NOT NULL DEFAULT false,
  UNIQUE (business_id, weekday)
);
GRANT SELECT ON public.business_hours TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_hours TO authenticated;
GRANT ALL ON public.business_hours TO service_role;
ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY business_hours_public_read ON public.business_hours FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY business_hours_owner_write ON public.business_hours FOR ALL TO authenticated
  USING (public.has_business_role(auth.uid(), business_id, 'owner')) WITH CHECK (public.has_business_role(auth.uid(), business_id, 'owner'));

-- ===== PROFESSIONALS =====
CREATE TABLE public.professionals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid,
  name text NOT NULL,
  photo_url text,
  bio text,
  commission_percent numeric(5,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX professionals_business_idx ON public.professionals(business_id);
GRANT SELECT ON public.professionals TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professionals TO authenticated;
GRANT ALL ON public.professionals TO service_role;
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
CREATE POLICY professionals_public_read ON public.professionals FOR SELECT TO anon, authenticated USING (active AND deleted_at IS NULL);
CREATE POLICY professionals_member_read ON public.professionals FOR SELECT TO authenticated USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY professionals_owner_write ON public.professionals FOR ALL TO authenticated
  USING (public.has_business_role(auth.uid(), business_id, 'owner')) WITH CHECK (public.has_business_role(auth.uid(), business_id, 'owner'));
CREATE TRIGGER professionals_updated BEFORE UPDATE ON public.professionals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.my_professional_id(_business_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.professionals WHERE business_id = _business_id AND user_id = auth.uid() LIMIT 1;
$$;

CREATE TABLE public.professional_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  starts_at time NOT NULL DEFAULT '09:00',
  ends_at time NOT NULL DEFAULT '18:00',
  enabled boolean NOT NULL DEFAULT true,
  UNIQUE (professional_id, weekday)
);
GRANT SELECT ON public.professional_hours TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professional_hours TO authenticated;
GRANT ALL ON public.professional_hours TO service_role;
ALTER TABLE public.professional_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY professional_hours_public_read ON public.professional_hours FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY professional_hours_owner_write ON public.professional_hours FOR ALL TO authenticated
  USING (public.has_business_role(auth.uid(), business_id, 'owner')) WITH CHECK (public.has_business_role(auth.uid(), business_id, 'owner'));

-- ===== SERVICES =====
CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  category text,
  price_cents integer NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  duration_minutes integer NOT NULL DEFAULT 30 CHECK (duration_minutes > 0),
  image_url text,
  active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX services_business_idx ON public.services(business_id);
GRANT SELECT ON public.services TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY services_public_read ON public.services FOR SELECT TO anon, authenticated USING (active AND deleted_at IS NULL);
CREATE POLICY services_member_read ON public.services FOR SELECT TO authenticated USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY services_owner_write ON public.services FOR ALL TO authenticated
  USING (public.has_business_role(auth.uid(), business_id, 'owner')) WITH CHECK (public.has_business_role(auth.uid(), business_id, 'owner'));
CREATE TRIGGER services_updated BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.professional_services (
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  PRIMARY KEY (professional_id, service_id)
);
GRANT SELECT ON public.professional_services TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professional_services TO authenticated;
GRANT ALL ON public.professional_services TO service_role;
ALTER TABLE public.professional_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY prof_services_public_read ON public.professional_services FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY prof_services_owner_write ON public.professional_services FOR ALL TO authenticated
  USING (public.has_business_role(auth.uid(), business_id, 'owner')) WITH CHECK (public.has_business_role(auth.uid(), business_id, 'owner'));

-- ===== CLIENTS =====
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  whatsapp text NOT NULL,
  email text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, whatsapp)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY clients_member_read ON public.clients FOR SELECT TO authenticated USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY clients_owner_write ON public.clients FOR ALL TO authenticated
  USING (public.has_business_role(auth.uid(), business_id, 'owner')) WITH CHECK (public.has_business_role(auth.uid(), business_id, 'owner'));
CREATE TRIGGER clients_updated BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== APPOINTMENTS =====
CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name text NOT NULL,
  client_whatsapp text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL,
  total_price_cents integer NOT NULL DEFAULT 0,
  status public.appointment_status NOT NULL DEFAULT 'PENDING',
  notes text,
  cancel_reason text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX appointments_biz_time_idx ON public.appointments(business_id, starts_at);
CREATE INDEX appointments_prof_time_idx ON public.appointments(professional_id, starts_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY appointments_member_read ON public.appointments FOR SELECT TO authenticated USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY appointments_owner_write ON public.appointments FOR ALL TO authenticated
  USING (public.has_business_role(auth.uid(), business_id, 'owner')) WITH CHECK (public.has_business_role(auth.uid(), business_id, 'owner'));
CREATE POLICY appointments_professional_update ON public.appointments FOR UPDATE TO authenticated
  USING (professional_id = public.my_professional_id(business_id))
  WITH CHECK (professional_id = public.my_professional_id(business_id));
CREATE TRIGGER appointments_updated BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.appointment_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  service_name text NOT NULL,
  price_cents integer NOT NULL,
  duration_minutes integer NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointment_services TO authenticated;
GRANT ALL ON public.appointment_services TO service_role;
ALTER TABLE public.appointment_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY appt_services_member_read ON public.appointment_services FOR SELECT TO authenticated USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY appt_services_owner_write ON public.appointment_services FOR ALL TO authenticated
  USING (public.has_business_role(auth.uid(), business_id, 'owner')) WITH CHECK (public.has_business_role(auth.uid(), business_id, 'owner'));

CREATE OR REPLACE FUNCTION public.prevent_double_booking() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('CANCELED','NO_SHOW') THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.professional_id = NEW.professional_id
      AND a.id <> NEW.id
      AND a.status NOT IN ('CANCELED','NO_SHOW')
      AND a.starts_at < NEW.ends_at
      AND a.ends_at > NEW.starts_at
  ) THEN
    RAISE EXCEPTION 'DOUBLE_BOOKING: professional already has an appointment in this time range';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER appointments_no_overlap BEFORE INSERT OR UPDATE OF starts_at, ends_at, professional_id, status
ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.prevent_double_booking();

-- ===== PRODUCTS / STOCK =====
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  sku text,
  description text,
  price_cents integer NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  cost_cents integer NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
  stock_quantity integer NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  min_stock integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY products_member_read ON public.products FOR SELECT TO authenticated USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY products_owner_write ON public.products FOR ALL TO authenticated
  USING (public.has_business_role(auth.uid(), business_id, 'owner')) WITH CHECK (public.has_business_role(auth.uid(), business_id, 'owner'));
CREATE TRIGGER products_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  type public.stock_movement_type NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY stock_member_read ON public.stock_movements FOR SELECT TO authenticated USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY stock_owner_write ON public.stock_movements FOR INSERT TO authenticated
  WITH CHECK (public.has_business_role(auth.uid(), business_id, 'owner'));

CREATE OR REPLACE FUNCTION public.apply_stock_movement() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE current_qty integer;
BEGIN
  SELECT stock_quantity INTO current_qty FROM public.products WHERE id = NEW.product_id AND business_id = NEW.business_id;
  IF current_qty IS NULL THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
  IF NEW.type = 'IN' THEN
    UPDATE public.products SET stock_quantity = current_qty + NEW.quantity WHERE id = NEW.product_id;
  ELSIF NEW.type = 'OUT' THEN
    IF current_qty < NEW.quantity THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK'; END IF;
    UPDATE public.products SET stock_quantity = current_qty - NEW.quantity WHERE id = NEW.product_id;
  ELSE
    UPDATE public.products SET stock_quantity = NEW.quantity WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER stock_movements_apply AFTER INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();

-- ===== SUBSCRIPTIONS =====
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL UNIQUE REFERENCES public.businesses(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  status public.subscription_status NOT NULL DEFAULT 'TRIALING',
  billing_interval public.billing_interval NOT NULL DEFAULT 'MONTHLY',
  payment_method public.payment_method,
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  trial_ends_at timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  canceled_at timestamptz,
  pending_plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  pending_billing_interval public.billing_interval,
  provider text NOT NULL DEFAULT 'mock',
  provider_customer_id text,
  provider_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscriptions_member_read ON public.subscriptions FOR SELECT TO authenticated USING (public.is_business_member(auth.uid(), business_id));
CREATE TRIGGER subscriptions_updated BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.business_professional_limit(_business_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.professional_limit FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.business_id = _business_id AND s.status IN ('TRIALING','ACTIVE','PAST_DUE')
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.enforce_professional_limit() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE lim integer; used integer;
BEGIN
  IF NEW.deleted_at IS NOT NULL OR NEW.active = false THEN RETURN NEW; END IF;
  lim := public.business_professional_limit(NEW.business_id);
  IF lim IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO used FROM public.professionals
  WHERE business_id = NEW.business_id AND active AND deleted_at IS NULL AND id <> NEW.id;
  IF used + 1 > lim THEN
    RAISE EXCEPTION 'PLAN_LIMIT_REACHED: plan allows % active professionals', lim;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER professionals_plan_limit BEFORE INSERT OR UPDATE OF active, deleted_at ON public.professionals
FOR EACH ROW EXECUTE FUNCTION public.enforce_professional_limit();

-- ===== PAYMENT EVENTS (idempotency) =====
CREATE TABLE public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  external_id text NOT NULL,
  event_type text NOT NULL,
  business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_id)
);
GRANT ALL ON public.payment_events TO service_role;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

-- ===== TRANSACTIONS =====
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  type public.transaction_type NOT NULL,
  amount_cents integer NOT NULL,
  description text,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY transactions_member_read ON public.transactions FOR SELECT TO authenticated USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY transactions_owner_insert ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (public.has_business_role(auth.uid(), business_id, 'owner'));

-- ===== NOTIFICATIONS =====
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'whatsapp',
  recipient text NOT NULL,
  template text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_member_read ON public.notifications FOR SELECT TO authenticated USING (public.is_business_member(auth.uid(), business_id));

-- ===== AUDIT LOGS =====
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  actor_user_id uuid,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_member_read ON public.audit_logs FOR SELECT TO authenticated USING (public.is_business_member(auth.uid(), business_id));

-- ===== SEED PLANS =====
INSERT INTO public.plans (code, name, description, professional_limit, monthly_price_cents, annual_price_cents, annual_months_charged, trial_days, sort_order)
VALUES
  ('BASIC','Básico','Ideal para quem trabalha sozinho', 1, 1990, 19900, 10, 14, 1),
  ('MEDIUM','Médio','Para equipes de até 5 profissionais', 5, 3990, 43890, 11, 14, 2),
  ('UNLIMITED','Ilimitado','Profissionais ilimitados', NULL, 5990, 59900, 10, 14, 3);
