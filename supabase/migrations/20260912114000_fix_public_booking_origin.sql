INSERT INTO public.platform_settings (key, value, description)
VALUES (
  'app.public_origin',
  '"https://agendou-br.lovable.app"'::jsonb,
  'Domínio público oficial usado nos links de reserva'
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    description = EXCLUDED.description;
