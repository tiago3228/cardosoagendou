import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { masterTestPlanSchema } from "./schemas";

/**
 * Master-only test mode. Lets the platform master put any business on any plan
 * so the entitlement system can be exercised end to end. The authorization
 * check lives in the database function too (`master_set_test_plan`), so this
 * cannot be reached by a normal customer even by calling the endpoint directly.
 */
export const listBusinessesForMaster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertMaster, listBusinessesWithPlans } = await import("./master.server");
    await assertMaster(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: plans, error } = await supabaseAdmin
      .from("plans")
      .select("code, name, professional_limit, monthly_price_cents, annual_price_cents, features")
      .eq("active", true)
      .order("sort_order");
    if (error) throw new Error(error.message);
    return { businesses: await listBusinessesWithPlans(supabaseAdmin), plans: plans ?? [] };
  });

export const setMasterTestPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => masterTestPlanSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { assertMaster } = await import("./master.server");
    await assertMaster(context.supabase, context.userId);
    // Executed as the master user so the RPC's own guard applies.
    const { data: result, error } = await context.supabase.rpc("master_set_test_plan", {
      _business_id: data.businessId,
      _plan_code: data.planCode,
      _interval: data.interval,
    });
    if (error) throw new Error(error.message);
    return result as {
      plan_code: string;
      plan_name: string;
      interval: string;
      current_period_end: string;
    };
  });
