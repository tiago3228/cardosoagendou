-- Global catalog: Drone segment and professional drone services.
BEGIN;

INSERT INTO public.segments (name, slug, description, sort_order)
VALUES (
  'Drone',
  'drone',
  'Captação aérea, inspeções, mapeamentos e operações especializadas com drones',
  220
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  active = true,
  updated_at = now();

WITH drone_services(name, description, duration_minutes) AS (
  VALUES
    ('Fotografia e Filmagem Audiovisual', 'Cobertura aérea de eventos, shows, casamentos, esportes, vídeos institucionais e produções cinematográficas.', 120),
    ('Marketing Imobiliário', 'Captação de imagens e tours aéreos de imóveis, terrenos e condomínios, destacando infraestrutura e localização.', 120),
    ('Mapeamento Aéreo e Aerofotogrametria', 'Levantamento topográfico para geração de mapas georreferenciados, ortomosaicos e modelos 3D do terreno.', 240),
    ('Acompanhamento e Monitoramento de Obras', 'Registro periódico da evolução de construções civis para relatórios de progresso e gestão de canteiros.', 120),
    ('Pulverização Agrícola', 'Aplicação localizada de defensivos, fertilizantes e sementes em lavouras.', 180),
    ('Monitoramento Agrícola', 'Análise de biomassa e estresse hídrico com câmeras multiespectrais para identificar pragas e falhas de plantio.', 240),
    ('Inspeção Técnica e Industrial', 'Avaliação visual e térmica de painéis solares, turbinas eólicas, torres de transmissão, telhados e outras infraestruturas.', 180),
    ('Segurança e Vigilância Patrimonial', 'Rondas aéreas automatizadas ou manuais para monitoramento de perímetros, grandes áreas industriais e eventos.', 120),
    ('Monitoramento Ambiental e Florestal', 'Gestão de recursos hídricos, mapeamento de desmatamento, apoio no combate a incêndios e contagem de fauna.', 240),
    ('Delivery e Logística', 'Transporte expresso de pequenos pacotes, medicamentos, exames laboratoriais ou peças internas em grandes fábricas.', 120),
    ('Contagem de Inventário Logístico', 'Varredura interna em galpões e armazéns para leitura automatizada de códigos de barras ou etiquetas RFID em prateleiras altas.', 180),
    ('Busca e Salvamento (SAR)', 'Apoio a equipes de resgate com câmeras térmicas para localização de pessoas desaparecidas em matas ou escombros.', 180)
)
INSERT INTO public.service_templates (
  business_id,
  service_id,
  segment_id,
  name,
  description,
  category,
  price_cents,
  duration_minutes,
  image_url,
  allows_parallel,
  active
)
SELECT
  NULL,
  NULL,
  s.id,
  d.name,
  d.description,
  'Drone',
  0,
  d.duration_minutes,
  NULL,
  false,
  true
FROM drone_services d
JOIN public.segments s ON s.slug = 'drone' AND s.active
WHERE NOT EXISTS (
  SELECT 1
  FROM public.service_templates existing
  WHERE existing.business_id IS NULL
    AND existing.segment_id = s.id
    AND lower(existing.name) = lower(d.name)
);

COMMIT;
