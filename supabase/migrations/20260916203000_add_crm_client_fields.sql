-- Campos complementares para a ficha CRM, sem alterar os clientes já existentes.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS address text;

CREATE INDEX IF NOT EXISTS clients_business_name_idx
  ON public.clients (business_id, name);
