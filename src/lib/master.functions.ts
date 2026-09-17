/* eslint-disable @typescript-eslint/no-explicit-any */
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

export const listMasterAdminData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertMaster } = await import("./master.server");
    await assertMaster(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: feedback, error: feedbackError }, { data: businesses, error: businessesError }] =
      await Promise.all([
        supabaseAdmin
          .from("feedback_submissions" as never)
          .select(
            "id, business_id, created_by, category, message, status, admin_note, created_at, updated_at",
          )
          .order("created_at", { ascending: false })
          .limit(500),
        supabaseAdmin
          .from("businesses")
          .select(
            "id, name, slug, email, active, created_at, subscriptions(status, provider, amount_cents, billing_interval, canceled_at, cancel_at_period_end, current_period_end, plans(name, code))",
          )
          .order("created_at", { ascending: false })
          .limit(500),
      ]);
    if (feedbackError) throw new Error(`FEEDBACK_LIST_FAILED: ${feedbackError.message}`);
    if (businessesError) throw new Error(`BUSINESS_LIST_FAILED: ${businessesError.message}`);

    const businessIds = (businesses ?? []).map((business: any) => business.id);
    const { data: owners, error: ownersError } = await supabaseAdmin
      .from("user_roles")
      .select("business_id, user_id, role")
      .eq("role", "owner")
      .in(
        "business_id",
        businessIds.length ? businessIds : ["00000000-0000-0000-0000-000000000000"],
      );
    if (ownersError) throw new Error(`OWNER_LIST_FAILED: ${ownersError.message}`);

    const ownerIds = [...new Set((owners ?? []).map((owner: any) => owner.user_id))];
    const usersById = new Map<string, { email: string | null; name: string | null }>();
    for (let from = 0; from < ownerIds.length; from += 1000) {
      const page = await supabaseAdmin.auth.admin.listUsers({
        page: Math.floor(from / 1000) + 1,
        perPage: 1000,
      });
      for (const user of page.data.users) {
        usersById.set(user.id, {
          email: user.email ?? null,
          name: (user.user_metadata?.full_name as string | undefined) ?? null,
        });
      }
      if (page.data.users.length < 1000) break;
    }
    const ownerByBusiness = new Map<string, { email: string | null; name: string | null }>();
    for (const owner of owners ?? []) {
      const user = usersById.get(owner.user_id);
      if (user) ownerByBusiness.set(owner.business_id, user);
    }

    return {
      feedback: (feedback ?? []) as unknown as Array<Record<string, unknown>>,
      businesses: (businesses ?? []).map((business: any) => ({
        ...business,
        owner: ownerByBusiness.get(business.id) ?? null,
      })),
    };
  });

export const updateMasterFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Dados inválidos");
    const value = input as Record<string, unknown>;
    if (typeof value.feedbackId !== "string") throw new Error("Feedback inválido");
    if (!["PENDING", "REVIEWED", "ARCHIVED"].includes(String(value.status)))
      throw new Error("Status inválido");
    return {
      feedbackId: value.feedbackId,
      status: String(value.status),
      adminNote: typeof value.adminNote === "string" ? value.adminNote.trim().slice(0, 2000) : null,
    };
  })
  .handler(async ({ data, context }) => {
    const { assertMaster } = await import("./master.server");
    await assertMaster(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("feedback_submissions" as never)
      .update({ status: data.status, admin_note: data.adminNote } as never)
      .eq("id", data.feedbackId);
    if (error) throw new Error(`FEEDBACK_UPDATE_FAILED: ${error.message}`);
    return { updated: true };
  });
