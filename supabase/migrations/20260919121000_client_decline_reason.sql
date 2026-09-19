-- Adiciona o motivo digitado pelo cliente ao fluxo de ausência.
-- A função de dois argumentos continua existindo para compatibilidade; o
-- frontend atualizado chama esta versão com três argumentos.
CREATE OR REPLACE FUNCTION public.appointment_presence_by_token(
  _token_hash text,
  _presence text,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  row_data record;
  next_status public.appointment_status;
  clean_reason text;
BEGIN
  clean_reason := NULLIF(left(trim(COALESCE(_reason, '')), 500), '');

  SELECT *
    INTO row_data
    FROM public.appointments
   WHERE manage_token_hash = _token_hash
     AND (manage_token_expires_at IS NULL OR manage_token_expires_at > now())
   FOR UPDATE;

  IF row_data.id IS NULL THEN
    RAISE EXCEPTION 'MANAGE_LINK_INVALID';
  END IF;

  IF row_data.status NOT IN ('CONFIRMED', 'IN_PROGRESS') THEN
    RAISE EXCEPTION 'APPOINTMENT_NOT_CONFIRMABLE';
  END IF;

  IF _presence NOT IN ('CONFIRMED', 'DECLINED') THEN
    RAISE EXCEPTION 'PRESENCE_INVALID';
  END IF;

  IF _presence = 'DECLINED' AND clean_reason IS NULL THEN
    RAISE EXCEPTION 'DECLINE_REASON_REQUIRED: informe o motivo do cancelamento';
  END IF;

  next_status := CASE
    WHEN _presence = 'DECLINED' THEN 'CANCELED'::public.appointment_status
    ELSE row_data.status
  END;

  UPDATE public.appointments
     SET presence_status = _presence,
         status = next_status,
         cancel_reason = CASE
           WHEN _presence = 'DECLINED' THEN clean_reason
           ELSE cancel_reason
         END
   WHERE id = row_data.id;

  BEGIN
    IF _presence = 'DECLINED' THEN
      PERFORM public.enqueue_message(
        row_data.business_id,
        row_data.id,
        'CLIENT_CANCELED',
        row_data.client_whatsapp,
        jsonb_build_object(
          'appointment_id', row_data.id,
          'presence_status', _presence,
          'reason', clean_reason
        ),
        'presence-declined:' || row_data.id::text
      );
    ELSE
      PERFORM public.enqueue_message(
        row_data.business_id,
        row_data.id,
        'CLIENT_CONFIRMED',
        row_data.client_whatsapp,
        jsonb_build_object('appointment_id', row_data.id, 'presence_status', _presence),
        'presence:' || row_data.id::text || ':' || _presence
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Resposta salva, mas notificação não enfileirada: %', SQLERRM;
  END;

  RETURN jsonb_build_object(
    'id', row_data.id,
    'presence_status', _presence,
    'status', next_status,
    'cancel_reason', clean_reason
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.appointment_presence_by_token(text, text, text)
  TO anon, authenticated, service_role;
