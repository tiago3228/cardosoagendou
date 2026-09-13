-- Allow the owner to set a custom final total for a quote.
alter table public.quotes
  add column if not exists total_override_cents integer
  check (total_override_cents is null or total_override_cents >= 0);
