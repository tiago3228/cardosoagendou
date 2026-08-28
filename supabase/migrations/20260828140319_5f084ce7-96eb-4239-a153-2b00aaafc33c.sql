-- ============================================================
-- PART 1.2 — public visibility toggles for business PII
-- ============================================================
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS show_address boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_whatsapp boolean NOT NULL DEFAULT true;

-- ============================================================
-- PART 1.1 / 1.2 — remove unrestricted anonymous table reads
-- ============================================================
DROP POLICY IF EXISTS businesses_public_read ON public.businesses;
DROP POLICY IF EXISTS services_public_read ON public.services;
DROP POLICY IF EXISTS professionals_public_read ON public.professionals;
DROP POLICY IF EXISTS business_hours_public_read ON public.business_hours;
DROP POLICY IF EXISTS professional_hours_public_read ON public.professional_hours;
DROP POLICY IF EXISTS prof_services_public_read ON public.professional_services;

DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t.relname);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t.relname);
  END LOOP;
END $$;

-- Authenticated keeps table access (RLS scopes it); read-only tables stay read-only.
GRANT SELECT ON public.plans, public.platform_settings, public.subscriptions,
  public.payments, public.professional_invites, public.notifications, public.audit_logs TO authenticated;
REVOKE ALL ON public.payment_events FROM authenticated;

-- ============================================================
-- PART 1.1 — scoped public read functions (definer, public fields only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.public_business(_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', b.id,
    'slug', b.slug,
    'name', b.name,
    'business_type', b.business_type,
    'description', b.description,
    'logo_url', b.logo_url,
    'cover_url', b.cover_url,
    'whatsapp', CASE WHEN b.show_whatsapp THEN b.whatsapp END,
    'address', CASE WHEN b.show_address THEN b.address END,
    'booking_policy', b.booking_policy,
    'timezone', b.timezone,
    'slot_interval_minutes', b.slot_interval_minutes,
    'min_notice_minutes', b.min_notice_minutes,
    'max_advance_days', b.max_advance_days,
    'accepts_bookings', public.business_accepts_bookings(b.id)
  )
  FROM public.businesses b
  WHERE b.slug = _slug AND b.active;
$$;

CREATE OR REPLACE FUNCTION public.public_catalog(_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE bid uuid; result jsonb;
BEGIN
  SELECT id INTO bid FROM public.businesses WHERE slug = _slug AND active;
  IF bid IS NULL THEN RETURN NULL; END IF;

  SELECT jsonb_build_object(
    'services', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'description', s.description,
        'category', s.category, 'price_cents', s.price_cents, 'duration_minutes', s.duration_minutes,
        'image_url', s.image_url) ORDER BY s.category NULLS LAST, s.name)
      FROM public.services s
      WHERE s.business_id = bid AND s.active AND s.deleted_at IS NULL), '[]'::jsonb),
    'professionals', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'photo_url', p.photo_url,
        'bio', p.bio) ORDER BY p.name)
      FROM public.professionals p
      WHERE p.business_id = bid AND p.active AND p.deleted_at IS NULL), '[]'::jsonb),
    'links', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('professional_id', ps.professional_id, 'service_id', ps.service_id))
      FROM public.professional_services ps
      JOIN public.professionals p ON p.id = ps.professional_id AND p.active AND p.deleted_at IS NULL
      WHERE ps.business_id = bid), '[]'::jsonb),
    'businessHours', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('weekday', h.weekday, 'opens_at', h.opens_at,
        'closes_at', h.closes_at, 'closed', h.closed) ORDER BY h.weekday)
      FROM public.business_hours h WHERE h.business_id = bid), '[]'::jsonb),
    'professionalHours', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('professional_id', ph.professional_id, 'weekday', ph.weekday,
        'starts_at', ph.starts_at, 'ends_at', ph.ends_at, 'enabled', ph.enabled))
      FROM public.professional_hours ph
      JOIN public.professionals p ON p.id = ph.professional_id AND p.active AND p.deleted_at IS NULL
      WHERE ph.business_id = bid), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;

-- Busy windows only: no client data, no prices, no notes.
CREATE OR REPLACE FUNCTION public.public_busy(_slug text, _from timestamptz, _to timestamptz)
RETURNS TABLE(professional_id uuid, starts_at timestamptz, ends_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.professional_id, a.starts_at, a.ends_at
  FROM public.appointments a
  JOIN public.businesses b ON b.id = a.business_id AND b.slug = _slug AND b.active
  WHERE a.status NOT IN ('CANCELED','NO_SHOW')
    AND a.starts_at >= _from AND a.starts_at < _to;
$$;

REVOKE ALL ON FUNCTION public.public_business(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_catalog(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_busy(text, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_business(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.public_catalog(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.public_busy(text, timestamptz, timestamptz) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.business_accepts_bookings(uuid) TO anon, authenticated, service_role;

-- ============================================================
-- PART 1.3 — professional appointment authorization
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_appointment_professional_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE allowed text[];
BEGIN
  -- Service role / server-side jobs and owners/masters are not restricted here.
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.is_business_owner(auth.uid(), OLD.business_id) THEN RETURN NEW; END IF;

  IF OLD.professional_id IS DISTINCT FROM public.my_professional_id(OLD.business_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: agendamento de outro profissional';
  END IF;

  IF NEW.business_id IS DISTINCT FROM OLD.business_id
     OR NEW.professional_id IS DISTINCT FROM OLD.professional_id
     OR NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.client_name IS DISTINCT FROM OLD.client_name
     OR NEW.client_whatsapp IS DISTINCT FROM OLD.client_whatsapp
     OR NEW.starts_at IS DISTINCT FROM OLD.starts_at
     OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
     OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes
     OR NEW.total_price_cents IS DISTINCT FROM OLD.total_price_cents
     OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'FORBIDDEN: profissional pode alterar apenas status, observações e motivo de cancelamento';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    allowed := CASE OLD.status::text
      WHEN 'PENDING' THEN ARRAY['CONFIRMED','CANCELED','NO_SHOW']
      WHEN 'CONFIRMED' THEN ARRAY['IN_PROGRESS','COMPLETED','CANCELED','NO_SHOW']
      WHEN 'IN_PROGRESS' THEN ARRAY['COMPLETED','CANCELED']
      ELSE ARRAY[]::text[]
    END;
    IF NOT (NEW.status::text = ANY(allowed)) THEN
      RAISE EXCEPTION 'INVALID_TRANSITION: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS appointments_professional_guard ON public.appointments;
CREATE TRIGGER appointments_professional_guard
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.guard_appointment_professional_update();

-- Professional self-service on their own record: profile fields only.
CREATE OR REPLACE FUNCTION public.guard_professional_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.is_business_owner(auth.uid(), OLD.business_id) THEN RETURN NEW; END IF;
  IF OLD.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN: cadastro de outro profissional';
  END IF;
  IF NEW.business_id IS DISTINCT FROM OLD.business_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.commission_percent IS DISTINCT FROM OLD.commission_percent
     OR NEW.active IS DISTINCT FROM OLD.active
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'FORBIDDEN: profissional pode alterar apenas nome, foto e bio';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS professionals_self_guard ON public.professionals;
CREATE TRIGGER professionals_self_guard
  BEFORE UPDATE ON public.professionals
  FOR EACH ROW EXECUTE FUNCTION public.guard_professional_self_update();

-- ============================================================
-- PART 13 — entitlement depends on state + grace, not plan alone
-- ============================================================
CREATE OR REPLACE FUNCTION public.business_professional_limit(_business_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE lim integer;
BEGIN
  IF public.business_booking_state(_business_id) NOT IN ('OPEN','GRACE') THEN
    RETURN 0;
  END IF;
  SELECT p.professional_limit INTO lim
  FROM public.subscriptions s JOIN public.plans p ON p.id = s.plan_id
  WHERE s.business_id = _business_id
  LIMIT 1;
  RETURN lim;
END $$;

CREATE OR REPLACE FUNCTION public.business_entitlements(_business_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result jsonb; state text; entitled boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_business_member(auth.uid(), _business_id) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  state := public.business_booking_state(_business_id);
  entitled := state IN ('OPEN','GRACE');
  SELECT jsonb_build_object(
    'plan_code', p.code,
    'plan_name', p.name,
    'professional_limit', CASE WHEN entitled THEN p.professional_limit ELSE 0 END,
    'status', s.status,
    'booking_state', state,
    'entitled', entitled,
    'accepts_bookings', entitled,
    'features', CASE WHEN entitled THEN COALESCE(p.features, '{}'::jsonb) ELSE '{}'::jsonb END,
    'current_period_end', s.current_period_end,
    'trial_ends_at', s.trial_ends_at,
    'grace_expires_at', s.grace_expires_at,
    'cancel_at_period_end', s.cancel_at_period_end,
    'grace_period_days', public.platform_setting_int('billing.grace_period_days', 7)
  ) INTO result
  FROM public.subscriptions s JOIN public.plans p ON p.id = s.plan_id
  WHERE s.business_id = _business_id;
  RETURN COALESCE(result, jsonb_build_object(
    'plan_code', NULL, 'plan_name', NULL, 'professional_limit', 0, 'status', NULL,
    'booking_state', state, 'entitled', false, 'accepts_bookings', false,
    'features', '{}'::jsonb,
    'grace_period_days', public.platform_setting_int('billing.grace_period_days', 7)));
END $$;

-- ============================================================
-- PART 6 / 17 — payment idempotency
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_payment_id_key
  ON public.payments (provider, provider_payment_id);
CREATE INDEX IF NOT EXISTS payment_events_business_idx ON public.payment_events (business_id, created_at DESC);

-- ============================================================
-- PART 10 / 11 — automatic lifecycle (single source of truth)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reconcile_subscriptions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE grace integer; lapsed int := 0; suspended int := 0; ended int := 0; r record;
BEGIN
  grace := public.platform_setting_int('billing.grace_period_days', 7);

  -- Cancellation scheduled for period end has arrived.
  FOR r IN
    SELECT id, business_id FROM public.subscriptions
    WHERE cancel_at_period_end AND status <> 'CANCELED' AND current_period_end < now()
  LOOP
    UPDATE public.subscriptions
      SET status = 'CANCELED', canceled_at = COALESCE(canceled_at, now())
      WHERE id = r.id;
    INSERT INTO public.audit_logs (business_id, action, entity, entity_id, data)
      VALUES (r.business_id, 'subscription.canceled', 'subscription', r.id::text,
        jsonb_build_object('source', 'reconcile'));
    ended := ended + 1;
  END LOOP;

  -- Expired trial or lapsed paid period becomes PAST_DUE and starts the grace clock.
  FOR r IN
    SELECT id, business_id, status FROM public.subscriptions
    WHERE status IN ('TRIALING','ACTIVE') AND current_period_end < now()
  LOOP
    UPDATE public.subscriptions
      SET status = 'PAST_DUE',
          grace_expires_at = COALESCE(grace_expires_at, current_period_end + (grace || ' days')::interval)
      WHERE id = r.id;
    INSERT INTO public.audit_logs (business_id, action, entity, entity_id, data)
      VALUES (r.business_id, 'subscription.past_due', 'subscription', r.id::text,
        jsonb_build_object('from', r.status, 'source', 'reconcile'));
    lapsed := lapsed + 1;
  END LOOP;

  -- Grace expired: suspend (bookings blocked, data preserved).
  FOR r IN
    SELECT id, business_id FROM public.subscriptions
    WHERE status = 'PAST_DUE'
      AND COALESCE(grace_expires_at, current_period_end + (grace || ' days')::interval) < now()
  LOOP
    UPDATE public.subscriptions SET status = 'SUSPENDED' WHERE id = r.id;
    INSERT INTO public.audit_logs (business_id, action, entity, entity_id, data)
      VALUES (r.business_id, 'subscription.suspended', 'subscription', r.id::text,
        jsonb_build_object('source', 'reconcile'));
    suspended := suspended + 1;
  END LOOP;

  RETURN jsonb_build_object('lapsed', lapsed, 'suspended', suspended, 'canceled', ended);
END $$;

REVOKE ALL ON FUNCTION public.reconcile_subscriptions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_subscriptions() TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconcile-subscriptions') THEN
    PERFORM cron.unschedule('reconcile-subscriptions');
  END IF;
  PERFORM cron.schedule('reconcile-subscriptions', '20 4 * * *',
    $cron$SELECT public.reconcile_subscriptions();$cron$);
END $$;

INSERT INTO public.platform_settings (key, value, description)
VALUES ('billing.grace_period_days', '7'::jsonb, 'Dias de tolerância após falha de pagamento')
ON CONFLICT (key) DO NOTHING;