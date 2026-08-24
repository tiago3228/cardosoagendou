import { createServerFn } from "@tanstack/react-start";

/** Public plan catalogue for the pricing section. */
export const listPlans = createServerFn({ method: "GET" }).handler(async () => {
  const { publicDb } = await import("./supabase-public.server");
  const { data } = await publicDb()
    .from("plans")
    .select(
      "id, code, name, description, professional_limit, monthly_price_cents, annual_price_cents, annual_months_charged, trial_days, sort_order",
    )
    .eq("active", true)
    .order("sort_order");
  return data ?? [];
});
