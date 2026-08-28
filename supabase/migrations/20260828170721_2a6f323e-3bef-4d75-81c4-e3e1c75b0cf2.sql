CREATE POLICY "business media owner read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'business-media' AND public.is_business_member(auth.uid(), (storage.foldername(name))[1]::uuid));

CREATE POLICY "business media owner insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'business-media' AND public.is_business_owner(auth.uid(), (storage.foldername(name))[1]::uuid));

CREATE POLICY "business media owner update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'business-media' AND public.is_business_owner(auth.uid(), (storage.foldername(name))[1]::uuid))
WITH CHECK (bucket_id = 'business-media' AND public.is_business_owner(auth.uid(), (storage.foldername(name))[1]::uuid));

CREATE POLICY "business media owner delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'business-media' AND public.is_business_owner(auth.uid(), (storage.foldername(name))[1]::uuid));