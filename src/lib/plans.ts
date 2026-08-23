/** Plan pricing helpers. Prices/limits live in the database — nothing hardcoded here. */

export interface PlanRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  professional_limit: number | null;
  monthly_price_cents: number;
  annual_price_cents: number;
  annual_months_charged: number;
  trial_days: number;
  sort_order: number;
}

export type BillingInterval = "MONTHLY" | "ANNUAL";

export function planPriceCents(plan: PlanRow, interval: BillingInterval): number {
  return interval === "ANNUAL" ? plan.annual_price_cents : plan.monthly_price_cents;
}

/** Effective monthly cost when paying annually. */
export function annualMonthlyEquivalentCents(plan: PlanRow): number {
  return Math.round(plan.annual_price_cents / 12);
}

/** How much an annual subscription saves versus 12 monthly charges. */
export function annualSavingsCents(plan: PlanRow): number {
  return Math.max(0, plan.monthly_price_cents * 12 - plan.annual_price_cents);
}

export function annualFreeMonths(plan: PlanRow): number {
  return Math.max(0, Math.round((12 - plan.annual_months_charged) * 10) / 10);
}

export function planLimitLabel(plan: PlanRow): string {
  if (plan.professional_limit === null) return "Profissionais ilimitados";
  if (plan.professional_limit === 1) return "1 profissional";
  return `Até ${plan.professional_limit} profissionais`;
}

export function fitsLimit(limit: number | null, activeProfessionals: number): boolean {
  return limit === null || activeProfessionals <= limit;
}

/** Adds one billing period to a date, without mutating it. */
export function addPeriod(from: Date, interval: BillingInterval): Date {
  const next = new Date(from.getTime());
  if (interval === "ANNUAL") next.setUTCFullYear(next.getUTCFullYear() + 1);
  else next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

export type PlanChangeKind = "UPGRADE" | "DOWNGRADE" | "INTERVAL_CHANGE" | "NONE";

export function classifyPlanChange(
  current: PlanRow,
  next: PlanRow,
  currentInterval: BillingInterval,
  nextInterval: BillingInterval,
): PlanChangeKind {
  if (current.id === next.id) {
    return currentInterval === nextInterval ? "NONE" : "INTERVAL_CHANGE";
  }
  const currentRank = current.professional_limit ?? Number.POSITIVE_INFINITY;
  const nextRank = next.professional_limit ?? Number.POSITIVE_INFINITY;
  return nextRank > currentRank ? "UPGRADE" : "DOWNGRADE";
}
