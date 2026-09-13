-- Add company and contractor identification to quotes.
alter table public.quotes
  add column if not exists company_name text;

alter table public.quotes
  add column if not exists contractor_name text;
