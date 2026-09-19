-- Coquetelaria: serviços do catálogo começam com 60 minutos.
-- O proprietário pode alterar a duração depois de adicionar o serviço ao negócio.
UPDATE public.service_templates AS st
SET duration_minutes = 60
FROM public.segments AS s
WHERE st.business_id IS NULL
  AND st.segment_id = s.id
  AND s.slug = 'coquetelaria'
  AND st.duration_minutes IN (120, 180, 240);

UPDATE public.services AS svc
SET duration_minutes = 60
FROM public.segments AS s
WHERE svc.segment_id = s.id
  AND s.slug = 'coquetelaria'
  AND svc.duration_minutes IN (120, 180, 240);
