CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_payment_uniq
  ON public.payments (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

INSERT INTO public.platform_settings (key, value, description)
VALUES
  ('billing.provider', '"asaas"'::jsonb, 'Gateway de pagamento ativo'),
  ('billing.grace_period_days', '7'::jsonb, 'Dias de tolerância após vencimento')
ON CONFLICT (key) DO NOTHING;