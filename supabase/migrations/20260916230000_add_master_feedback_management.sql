-- Campos de gestão interna dos feedbacks, visíveis apenas ao Administrador Master.
ALTER TABLE public.feedback_submissions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'REVIEWED', 'ARCHIVED')),
  ADD COLUMN IF NOT EXISTS admin_note text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS feedback_submissions_status_idx
  ON public.feedback_submissions (status, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_feedback_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS feedback_updated ON public.feedback_submissions;
CREATE TRIGGER feedback_updated BEFORE UPDATE ON public.feedback_submissions
FOR EACH ROW EXECUTE FUNCTION public.set_feedback_updated_at();

-- Usuários comuns continuam vendo somente os próprios registros; o Master consulta
-- e administra os registros por funções server-side que revalidam is_master(auth.uid()).
GRANT UPDATE ON public.feedback_submissions TO authenticated;
DROP POLICY IF EXISTS feedback_master_update ON public.feedback_submissions;
CREATE POLICY feedback_master_update ON public.feedback_submissions FOR UPDATE TO authenticated
  USING (public.is_master(auth.uid()))
  WITH CHECK (public.is_master(auth.uid()));
