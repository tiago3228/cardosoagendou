-- Corrige o desconto anual do plano Básico para 1 mês grátis.
-- R$ 19,90 x 11 meses cobrados = R$ 218,90 por ano.

UPDATE public.plans
SET annual_months_charged = 11,
    annual_price_cents = monthly_price_cents * 11,
    updated_at = now()
WHERE code = 'BASIC';
