-- Canal de feedback do cliente com limite de 2 envios por mês.
CREATE TABLE IF NOT EXISTS public.feedback_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'sugestao' CHECK (category IN ('sugestao', 'problema', 'duvida')),
  message text NOT NULL CHECK (char_length(trim(message)) BETWEEN 10 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feedback_submissions_business_created_idx
  ON public.feedback_submissions (business_id, created_by, created_at DESC);

ALTER TABLE public.feedback_submissions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.feedback_submissions TO authenticated;
GRANT ALL ON public.feedback_submissions TO service_role;

DROP POLICY IF EXISTS feedback_member_read ON public.feedback_submissions;
CREATE POLICY feedback_member_read ON public.feedback_submissions FOR SELECT TO authenticated
  USING (public.is_business_member(auth.uid(), business_id) AND created_by = auth.uid());

DROP POLICY IF EXISTS feedback_member_insert ON public.feedback_submissions;
CREATE POLICY feedback_member_insert ON public.feedback_submissions FOR INSERT TO authenticated
  WITH CHECK (public.has_business_role(auth.uid(), business_id, 'owner') AND created_by = auth.uid());

CREATE OR REPLACE FUNCTION public.enforce_feedback_monthly_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  monthly_count integer;
BEGIN
  SELECT count(*) INTO monthly_count
  FROM public.feedback_submissions
  WHERE business_id = NEW.business_id
    AND created_by = NEW.created_by
    AND created_at >= date_trunc('month', now())
    AND created_at < date_trunc('month', now()) + interval '1 month';

  IF monthly_count >= 2 THEN
    RAISE EXCEPTION 'monthly_feedback_limit_reached';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS feedback_monthly_limit ON public.feedback_submissions;
CREATE TRIGGER feedback_monthly_limit
  BEFORE INSERT ON public.feedback_submissions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_feedback_monthly_limit();
