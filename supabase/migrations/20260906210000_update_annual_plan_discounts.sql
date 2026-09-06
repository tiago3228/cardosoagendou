-- Atualiza os descontos dos planos anuais.
-- Básico: 2 meses grátis (10 meses cobrados).
-- Médio: 2 meses grátis (10 meses cobrados).
-- Ilimitado: 3 meses grátis (9 meses cobrados).
-- Os valores anuais são derivados dos preços mensais vigentes.

UPDATE public.plans
SET annual_months_charged = 10,
    annual_price_cents = monthly_price_cents * 10,
    updated_at = now()
WHERE code = 'BASIC';

UPDATE public.plans
SET annual_months_charged = 10,
    annual_price_cents = monthly_price_cents * 10,
    updated_at = now()
WHERE code = 'MEDIUM';

UPDATE public.plans
SET annual_months_charged = 9,
    annual_price_cents = monthly_price_cents * 9,
    updated_at = now()
WHERE code = 'UNLIMITED';
