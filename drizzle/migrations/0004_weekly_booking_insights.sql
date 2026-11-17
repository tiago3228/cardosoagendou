CREATE TABLE public.weekly_booking_insights (business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE, fingerprint text, narrative text, generated_at timestamptz, blocked_type text, error_message text);
GRANT SELECT, INSERT, UPDATE ON public.weekly_booking_insights TO authenticated;
GRANT ALL ON public.weekly_booking_insights TO service_role;
ALTER TABLE public.weekly_booking_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY weekly_insights_read ON public.weekly_booking_insights FOR SELECT TO authenticated USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY weekly_insights_insert ON public.weekly_booking_insights FOR INSERT TO authenticated WITH CHECK (public.is_business_member(auth.uid(), business_id));
CREATE POLICY weekly_insights_update ON public.weekly_booking_insights FOR UPDATE TO authenticated USING (public.is_business_member(auth.uid(), business_id)) WITH CHECK (public.is_business_member(auth.uid(), business_id));