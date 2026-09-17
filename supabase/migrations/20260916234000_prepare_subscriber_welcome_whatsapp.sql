-- Preparação para boas-vindas automáticas de novos assinantes.
-- A mensagem só entra na fila quando a assinatura muda para ACTIVE.
-- O envio real será ativado futuramente por um worker da Meta ou provedor externo.

INSERT INTO public.platform_settings (key, value, description) VALUES
  ('whatsapp.welcome_enabled', 'true'::jsonb, 'Prepara boas-vindas após assinatura aprovada'),
  ('whatsapp.welcome_provider', '"unconfigured"'::jsonb, 'unconfigured, meta_official ou external_provider'),
  ('whatsapp.welcome_template', '"Olá, {nome}! Seja bem-vindo ao Agendou. Sua assinatura do plano {plano} foi aprovada com sucesso. Estamos à disposição para ajudar."'::jsonb, 'Mensagem de boas-vindas; variáveis: {nome}, {plano}, {estabelecimento}')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.message_outbox
  DROP CONSTRAINT IF EXISTS message_outbox_event_type_check;
ALTER TABLE public.message_outbox
  ADD CONSTRAINT message_outbox_event_type_check CHECK (
    event_type IN (
      'APPOINTMENT_CONFIRMED', 'APPOINTMENT_REMINDER', 'CLIENT_CONFIRMED',
      'CLIENT_CANCELED', 'APPOINTMENT_RESCHEDULED', 'SUBSCRIBER_WELCOME'
    )
  );

CREATE OR REPLACE FUNCTION public.enqueue_subscriber_welcome()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_id uuid;
  owner_name text;
  recipient text;
  plan_name text;
  template text;
  provider text;
  enabled boolean;
  rendered text;
BEGIN
  -- Só dispara na transição real para ACTIVE; aprovação repetida é idempotente.
  IF OLD.status = 'ACTIVE' OR NEW.status <> 'ACTIVE' THEN RETURN NEW; END IF;

  SELECT (value #>> '{}')::boolean INTO enabled
  FROM public.platform_settings WHERE key = 'whatsapp.welcome_enabled';
  IF COALESCE(enabled, true) = false THEN RETURN NEW; END IF;

  SELECT ur.user_id INTO owner_id
  FROM public.user_roles ur
  WHERE ur.business_id = NEW.business_id AND ur.role = 'owner'
  ORDER BY ur.created_at
  LIMIT 1;

  SELECT COALESCE(NULLIF(trim(p.full_name), ''), 'novo assinante'),
         COALESCE(NULLIF(trim(p.whatsapp), ''), NULLIF(trim(b.whatsapp), ''))
    INTO owner_name, recipient
  FROM public.businesses b
  LEFT JOIN public.profiles p ON p.id = owner_id
  WHERE b.id = NEW.business_id;
  IF recipient IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(pl.name, 'Agendou') INTO plan_name
  FROM public.plans pl WHERE pl.id = NEW.plan_id;
  SELECT COALESCE(value #>> '{}', 'unconfigured') INTO provider
  FROM public.platform_settings WHERE key = 'whatsapp.welcome_provider';
  SELECT COALESCE(value #>> '{}', 'Olá, {nome}! Seja bem-vindo ao Agendou. Sua assinatura do plano {plano} foi aprovada com sucesso.') INTO template
  FROM public.platform_settings WHERE key = 'whatsapp.welcome_template';

  rendered := replace(replace(replace(template, '{nome}', owner_name), '{plano}', COALESCE(plan_name, 'Agendou')), '{estabelecimento}', (SELECT name FROM public.businesses WHERE id = NEW.business_id));

  INSERT INTO public.message_outbox (
    business_id, event_type, recipient, payload, dedupe_key, provider
  ) VALUES (
    NEW.business_id,
    'SUBSCRIBER_WELCOME',
    recipient,
    jsonb_build_object(
      'message', rendered,
      'template', template,
      'owner_name', owner_name,
      'plan_name', plan_name,
      'provider', provider,
      'subscription_id', NEW.id,
      'approved_at', now()
    ),
    'subscriber-welcome:' || NEW.id::text,
    provider
  )
  ON CONFLICT (business_id, dedupe_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscriptions_subscriber_welcome ON public.subscriptions;
CREATE TRIGGER subscriptions_subscriber_welcome
  AFTER UPDATE OF status ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_subscriber_welcome();

COMMENT ON FUNCTION public.enqueue_subscriber_welcome() IS
  'Enfileira boas-vindas após aprovação; entrega fica preparada para Meta oficial ou provedor externo.';
