-- Garante que a resposta do cliente seja salva mesmo se o envio da
-- notificação/outbox estiver indisponível. O cancelamento não pode ser
-- desfeito por uma falha secundária de mensagem.
CREATE OR REPLACE FUNCTION public.appointment_presence_by_token(_token_hash text, _presence text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  row_data record;
  next_status public.appointment_status;
BEGIN
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

  next_status := CASE
    WHEN _presence = 'DECLINED' THEN 'CANCELED'::public.appointment_status
    ELSE row_data.status
  END;

  UPDATE public.appointments
     SET presence_status = _presence,
         status = next_status,
         cancel_reason = CASE
           WHEN _presence = 'DECLINED' THEN 'Cliente informou que não poderá comparecer'
           ELSE cancel_reason
         END
   WHERE id = row_data.id;

  -- A atualização acima é a operação principal. A notificação é secundária:
  -- se a tabela/outbox ainda não estiver disponível, não desfaz o cancelamento.
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
          'reason', 'Cliente informou que não poderá comparecer'
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
    RAISE NOTICE 'A resposta foi salva, mas a notificação não foi enfileirada: %', SQLERRM;
  END;

  RETURN jsonb_build_object(
    'id', row_data.id,
    'presence_status', _presence,
    'status', next_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.appointment_presence_by_token(text, text)
  TO anon, authenticated, service_role;
