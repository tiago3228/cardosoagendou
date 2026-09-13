-- Global catalog: Informática segment and technical support services.
BEGIN;

INSERT INTO public.segments (name, slug, description, sort_order)
VALUES (
  'Informática',
  'informatica',
  'Manutenção, suporte técnico, redes, computadores e recuperação de dados',
  240
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  active = true,
  updated_at = now();

WITH informatica_services(name, description, duration_minutes) AS (
  VALUES
    ('Formatação e Reinstalação de Sistema Operacional', 'Limpeza completa do disco, instalação do Windows ou Linux, configuração de drivers e programas essenciais.', 180),
    ('Montagem de Computadores (PC Gamer / Home Office)', 'Seleção e montagem física de peças, organização de cabos e testes de desempenho.', 240),
    ('Upgrade de Hardware', 'Substituição ou adição de peças, como HD por SSD, memória RAM, placa de vídeo e processador, para aumentar o desempenho.', 120),
    ('Limpeza Técnica e Troca de Pasta Térmica', 'Manutenção preventiva interna para remoção de poeira, desobstrução de coolers e aplicação de nova pasta térmica.', 90),
    ('Remoção de Vírus e Malwares', 'Limpeza de infecções do sistema, eliminação de spywares e pop-ups e instalação de antivírus.', 120),
    ('Manutenção e Reparo de Notebooks', 'Troca de telas e baterias, reparo de teclados, conectores de carga e dobradiças.', 180),
    ('Instalação e Configuração de Redes e Wi-Fi', 'Montagem de roteadores, repetidores e redes Mesh, crimpagem de cabos e otimização do sinal.', 120),
    ('Recuperação de Dados', 'Resgate de arquivos, fotos e documentos deletados ou armazenados em mídias com falhas ou corrompidas.', 240),
    ('Backup e Migração de Dados', 'Criação de cópias de segurança locais ou em nuvem e transferência segura de arquivos para outro computador.', 120),
    ('Instalação e Configuração de Softwares', 'Instalação de pacote Office, softwares de edição, sistemas de gestão, certificados digitais e impressoras.', 90),
    ('Consultoria e Suporte Remoto', 'Atendimento à distância para problemas de software, configurações de e-mail e ajustes rápidos.', 60)
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
  i.name,
  i.description,
  'Informática',
  0,
  i.duration_minutes,
  NULL,
  false,
  true
FROM informatica_services i
JOIN public.segments s ON s.slug = 'informatica' AND s.active
WHERE NOT EXISTS (
  SELECT 1
  FROM public.service_templates existing
  WHERE existing.business_id IS NULL
    AND existing.segment_id = s.id
    AND lower(existing.name) = lower(i.name)
);

COMMIT;
