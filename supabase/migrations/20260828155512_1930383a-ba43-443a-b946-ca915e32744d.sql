-- ============================================================
-- Manual PIX billing: requests, master review, PIX configuration
-- ============================================================

CREATE TABLE public.manual_payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  plan_id uuid NOT NULL REFERENCES public.plans(id),
  billing_interval billing_interval NOT NULL DEFAULT 'MONTHLY',
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL DEFAULT 'BRL',
  payment_method text NOT NULL DEFAULT 'PIX_MANUAL',
  status text NOT NULL DEFAULT 'PENDING',
  proof_path text,
  customer_note text,
  admin_note text,
  requested_by uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  approved_at timestamptz,
  rejected_at timestamptz,
  period_start timestamptz,
  period_end timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT manual_payment_requests_status_check
    CHECK (status IN ('PENDING','APPROVED','REJECTED','EXPIRED')),
  CONSTRAINT manual_payment_requests_method_check
    CHECK (payment_method = 'PIX_MANUAL')
);

-- Only one open PIX request per business: blocks duplicate/abusive submissions.
CREATE UNIQUE INDEX manual_payment_requests_one_pending
  ON public.manual_payment_requests (business_id)
  WHERE status = 'PENDING';
CREATE INDEX manual_payment_requests_business_idx
  ON public.manual_payment_requests (business_id, created_at DESC);
CREATE INDEX manual_payment_requests_status_idx
  ON public.manual_payment_requests (status, created_at DESC);

GRANT SELECT ON public.manual_payment_requests TO authenticated;
GRANT ALL ON public.manual_payment_requests TO service_role;

ALTER TABLE public.manual_payment_requests ENABLE ROW LEVEL SECURITY;

-- Read-only for tenants (their own rows) and master (everything). All writes
-- happen server-side through the security-definer functions below.
CREATE POLICY "Business members read their own PIX requests"
  ON public.manual_payment_requests FOR SELECT TO authenticated
  USING (public.is_business_member(auth.uid(), business_id));

CREATE TRIGGER manual_payment_requests_updated
  BEFORE UPDATE ON public.manual_payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER manual_payment_requests_tenant_immutable
  BEFORE UPDATE ON public.manual_payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_immutable();

-- ============================================================
-- Master review: approve / reject (atomic + idempotent)
-- ============================================================

CREATE OR REPLACE FUNCTION public.approve_manual_payment_request(_request_id uuid, _admin_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req record;
  sub record;
  start_at timestamptz;
  end_at timestamptz;
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR NOT public.is_master(uid) THEN
    RAISE EXCEPTION 'FORBIDDEN: apenas a conta master pode analisar pagamentos';
  END IF;

  SELECT * INTO req FROM public.manual_payment_requests WHERE id = _request_id FOR UPDATE;
  IF req IS NULL THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
  IF req.status = 'APPROVED' THEN
    -- Idempotent: a second approval must not extend the period again.
    RETURN jsonb_build_object('already', true, 'status', 'APPROVED',
      'period_start', req.period_start, 'period_end', req.period_end);
  END IF;
  IF req.status <> 'PENDING' THEN
    RAISE EXCEPTION 'REQUEST_NOT_PENDING: solicitação já analisada';
  END IF;

  SELECT * INTO sub FROM public.subscriptions WHERE business_id = req.business_id FOR UPDATE;
  IF sub IS NULL THEN RAISE EXCEPTION 'SUBSCRIPTION_NOT_FOUND'; END IF;

  -- Never shorten a period the business already paid for.
  IF sub.status IN ('ACTIVE','TRIALING') AND sub.current_period_end > now() THEN
    start_at := sub.current_period_end;
  ELSE
    start_at := now();
  END IF;
  end_at := CASE WHEN req.billing_interval = 'ANNUAL'
                 THEN start_at + interval '1 year'
                 ELSE start_at + interval '30 days' END;

  UPDATE public.subscriptions SET
    plan_id = req.plan_id,
    billing_interval = req.billing_interval,
    status = 'ACTIVE',
    payment_method = 'PIX',
    provider = 'pix_manual',
    amount_cents = req.amount_cents,
    current_period_start = CASE WHEN start_at > now() THEN sub.current_period_start ELSE start_at END,
    current_period_end = end_at,
    trial_ends_at = NULL,
    grace_expires_at = NULL,
    last_payment_at = now(),
    cancel_at_period_end = false,
    canceled_at = NULL,
    pending_plan_id = NULL,
    pending_billing_interval = NULL
  WHERE id = sub.id;

  UPDATE public.manual_payment_requests SET
    status = 'APPROVED',
    subscription_id = sub.id,
    admin_note = COALESCE(_admin_note, admin_note),
    reviewed_at = now(),
    reviewed_by = uid,
    approved_at = now(),
    period_start = start_at,
    period_end = end_at
  WHERE id = req.id;

  INSERT INTO public.payments (business_id, subscription_id, provider, provider_payment_id,
    amount_cents, currency, status, payment_method, description, paid_at)
  VALUES (req.business_id, sub.id, 'pix_manual', req.id::text, req.amount_cents, req.currency,
    'PAID', 'PIX', 'Pagamento manual via PIX', now())
  ON CONFLICT (provider, provider_payment_id) DO NOTHING;

  INSERT INTO public.transactions (business_id, type, amount_cents, description, occurred_at)
  VALUES (req.business_id, 'SUBSCRIPTION', req.amount_cents, 'Assinatura paga via PIX manual', now());

  INSERT INTO public.audit_logs (business_id, actor_user_id, action, entity, entity_id, data)
  VALUES (req.business_id, uid, 'PIX_MANUAL_APPROVED', 'manual_payment_request', req.id::text,
    jsonb_build_object('amount_cents', req.amount_cents, 'plan_id', req.plan_id,
      'period_start', start_at, 'period_end', end_at));

  INSERT INTO public.audit_logs (business_id, actor_user_id, action, entity, entity_id, data)
  VALUES (req.business_id, uid, 'SUBSCRIPTION_EXTENDED', 'subscription', sub.id::text,
    jsonb_build_object('source', 'PIX_MANUAL', 'period_end', end_at));

  RETURN jsonb_build_object('already', false, 'status', 'APPROVED',
    'period_start', start_at, 'period_end', end_at);
END $$;

REVOKE EXECUTE ON FUNCTION public.approve_manual_payment_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_manual_payment_request(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reject_manual_payment_request(_request_id uuid, _admin_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE req record; uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR NOT public.is_master(uid) THEN
    RAISE EXCEPTION 'FORBIDDEN: apenas a conta master pode analisar pagamentos';
  END IF;

  SELECT * INTO req FROM public.manual_payment_requests WHERE id = _request_id FOR UPDATE;
  IF req IS NULL THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
  IF req.status = 'REJECTED' THEN
    RETURN jsonb_build_object('already', true, 'status', 'REJECTED');
  END IF;
  IF req.status <> 'PENDING' THEN
    RAISE EXCEPTION 'REQUEST_NOT_PENDING: solicitação já analisada';
  END IF;

  UPDATE public.manual_payment_requests SET
    status = 'REJECTED',
    admin_note = COALESCE(_admin_note, admin_note),
    reviewed_at = now(),
    reviewed_by = uid,
    rejected_at = now()
  WHERE id = req.id;

  INSERT INTO public.audit_logs (business_id, actor_user_id, action, entity, entity_id, data)
  VALUES (req.business_id, uid, 'PIX_MANUAL_REJECTED', 'manual_payment_request', req.id::text,
    jsonb_build_object('reason', _admin_note));

  RETURN jsonb_build_object('already', false, 'status', 'REJECTED');
END $$;

REVOKE EXECUTE ON FUNCTION public.reject_manual_payment_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_manual_payment_request(uuid, text) TO authenticated, service_role;

-- Stale requests stop blocking new ones.
CREATE OR REPLACE FUNCTION public.expire_manual_payment_requests()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  WITH expired AS (
    UPDATE public.manual_payment_requests
      SET status = 'EXPIRED', reviewed_at = now()
      WHERE status = 'PENDING' AND expires_at < now()
      RETURNING id, business_id
  )
  SELECT count(*) INTO n FROM expired;
  RETURN COALESCE(n, 0);
END $$;

REVOKE EXECUTE ON FUNCTION public.expire_manual_payment_requests() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_manual_payment_requests() TO service_role;

-- Fold PIX expiry into the daily reconciliation already scheduled.
CREATE OR REPLACE FUNCTION public.reconcile_subscriptions()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE grace integer; lapsed int := 0; suspended int := 0; ended int := 0; expired_pix int := 0; r record;
BEGIN
  grace := public.platform_setting_int('billing.grace_period_days', 7);

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

  expired_pix := public.expire_manual_payment_requests();

  RETURN jsonb_build_object('lapsed', lapsed, 'suspended', suspended, 'canceled', ended,
    'expired_pix_requests', expired_pix);
END $function$;

-- ============================================================
-- Platform configuration
-- ============================================================

INSERT INTO public.platform_settings (key, value, description) VALUES
  ('billing.provider', '"mercadopago"'::jsonb, 'Provedor de assinatura automática'),
  ('billing.pix_key', '""'::jsonb, 'Chave PIX do recebedor (SaaS)'),
  ('billing.pix_holder', '""'::jsonb, 'Nome do titular da chave PIX'),
  ('billing.pix_bank', '""'::jsonb, 'Instituição financeira da chave PIX'),
  ('billing.pix_instructions',
    '"Faça o PIX no valor exato e clique em Já fiz o PIX. A liberação ocorre após conferência da nossa equipe."'::jsonb,
    'Instruções exibidas na tela de PIX manual'),
  ('billing.pix_request_expiry_days', '7'::jsonb, 'Dias para expirar uma solicitação PIX pendente')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description
  WHERE public.platform_settings.key = 'billing.provider';

-- ============================================================
-- Storage policies for PIX proofs (private bucket "pix-proofs")
-- Path convention: <business_id>/<request_id>.<ext>
-- ============================================================

CREATE POLICY "Business members upload their own PIX proofs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pix-proofs'
    AND public.is_business_member(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "Business members read their own PIX proofs"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'pix-proofs'
    AND public.is_business_member(auth.uid(), (storage.foldername(name))[1]::uuid)
  );