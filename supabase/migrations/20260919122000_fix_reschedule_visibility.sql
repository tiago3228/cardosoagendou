-- O botão Reagendar só pode aparecer para agendamentos pendentes ou confirmados.
-- Algumas bases antigas usavam apenas a antecedência do horário e exibiam o
-- botão mesmo depois de o agendamento ter sido cancelado/reagendado.
CREATE OR REPLACE FUNCTION public.appointment_manage_by_token(_token_hash text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT jsonb_build_object(
    'id', a.id,
    'business_id', a.business_id,
    'business_name', b.name,
    'business_slug', b.slug,
    'client_name', a.client_name,
    'starts_at', a.starts_at,
    'ends_at', a.ends_at,
    'status', a.status,
    'presence_status', a.presence_status,
    'professional_id', a.professional_id,
    'service_ids', COALESCE((
      SELECT jsonb_agg(aps.service_id) FILTER (WHERE aps.service_id IS NOT NULL)
      FROM public.appointment_services aps
      WHERE aps.appointment_id = a.id
    ), '[]'::jsonb),
    'policy', b.booking_policy,
    'allow_cancel', a.status IN ('PENDING', 'CONFIRMED')
      AND a.starts_at > now() + interval '1 hour',
    'allow_reschedule', a.status IN ('PENDING', 'CONFIRMED')
      AND a.starts_at > now() + interval '2 hours'
  )
  FROM public.appointments a
  JOIN public.businesses b ON b.id = a.business_id
  WHERE a.manage_token_hash = _token_hash
    AND (a.manage_token_expires_at IS NULL OR a.manage_token_expires_at > now());
$$;

GRANT EXECUTE ON FUNCTION public.appointment_manage_by_token(text)
  TO anon, authenticated, service_role;
