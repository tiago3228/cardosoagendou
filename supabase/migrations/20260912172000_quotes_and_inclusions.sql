-- Quotes and optional inclusions
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  quote_number text not null,
  customer_name text not null,
  customer_phone text,
  customer_email text,
  title text not null default 'Orçamento',
  issue_date date not null default current_date,
  valid_until date,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'VALID', 'EXPIRED', 'ACCEPTED', 'REJECTED')),
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, quote_number)
);

create table if not exists public.quote_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  name text not null,
  description text,
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  unit_price_cents integer not null default 0 check (unit_price_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  is_custom boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.quote_inclusions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  label text not null,
  is_custom boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists quotes_business_id_idx on public.quotes(business_id);
create index if not exists quote_items_quote_id_idx on public.quote_items(quote_id);
create index if not exists quote_inclusions_quote_id_idx on public.quote_inclusions(quote_id);

alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.quote_inclusions enable row level security;

drop policy if exists "business members can manage quotes" on public.quotes;
create policy "business members can manage quotes" on public.quotes
  for all using (public.is_business_member(auth.uid(), business_id))
  with check (public.is_business_member(auth.uid(), business_id));
drop policy if exists "business members can manage quote items" on public.quote_items;
create policy "business members can manage quote items" on public.quote_items
  for all using (public.is_business_member(auth.uid(), business_id))
  with check (public.is_business_member(auth.uid(), business_id));
drop policy if exists "business members can manage quote inclusions" on public.quote_inclusions;
create policy "business members can manage quote inclusions" on public.quote_inclusions
  for all using (public.is_business_member(auth.uid(), business_id))
  with check (public.is_business_member(auth.uid(), business_id));

create or replace function public.set_quotes_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists quotes_updated_at on public.quotes;
create trigger quotes_updated_at before update on public.quotes
for each row execute function public.set_quotes_updated_at();
