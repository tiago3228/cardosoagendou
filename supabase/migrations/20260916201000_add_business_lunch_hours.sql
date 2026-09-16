-- Adiciona intervalo de almoço configurável aos horários de funcionamento do negócio.
-- O padrão é 12:00 às 13:00 para preservar uma pausa comum sem exigir configuração inicial.
ALTER TABLE public.business_hours
  ADD COLUMN IF NOT EXISTS lunch_starts_at time NOT NULL DEFAULT '12:00',
  ADD COLUMN IF NOT EXISTS lunch_ends_at time NOT NULL DEFAULT '13:00';
