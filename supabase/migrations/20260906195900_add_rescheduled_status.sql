-- Status histórico para preservar a reserva anterior sem bloquear a agenda.
ALTER TYPE public.appointment_status ADD VALUE IF NOT EXISTS 'RESCHEDULED';
