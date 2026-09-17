-- Resposta oficial do Administrador Master, visível ao cliente que enviou o feedback.
ALTER TABLE public.feedback_submissions
  ADD COLUMN IF NOT EXISTS master_response text,
  ADD COLUMN IF NOT EXISTS responded_at timestamptz;

ALTER TABLE public.feedback_submissions
  DROP CONSTRAINT IF EXISTS feedback_master_response_length;
ALTER TABLE public.feedback_submissions
  ADD CONSTRAINT feedback_master_response_length
  CHECK (master_response IS NULL OR char_length(trim(master_response)) BETWEEN 1 AND 2000);
