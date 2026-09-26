-- Credenciais diretas e janelas extras para o Agendou.
-- Cada janela usa {"starts_at":"20:00","ends_at":"22:00","mode":"free"|"blocked"}.
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS login_username text;

CREATE UNIQUE INDEX IF NOT EXISTS professionals_login_username_unique
  ON public.professionals (lower(login_username))
  WHERE login_username IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE public.business_hours
  ADD COLUMN IF NOT EXISTS extra_windows jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.professional_hours
  ADD COLUMN IF NOT EXISTS extra_windows jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.business_hours.extra_windows IS
  'Janelas adicionais recorrentes: [{starts_at, ends_at, mode: free|blocked}]';
COMMENT ON COLUMN public.professional_hours.extra_windows IS
  'Janelas adicionais recorrentes: [{starts_at, ends_at, mode: free|blocked}]';

CREATE INDEX IF NOT EXISTS professionals_login_username_lower_idx
  ON public.professionals (lower(login_username));
