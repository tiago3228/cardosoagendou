import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { checkoutSchema, planChangeSchema } from "./schemas";

/** Current subscription + plan catalogue + usage for the owner dashboard. */
export const getMySubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireOwnedBusinessId, countActiveProfessionals } = await import("./subscription.server");
    const businessId = await requireOwnedBusinessId(context.supabase, context.userId);

    const [subscription, plans, activeProfessionals] = await Promise.all([
      context.supabase
        .from("subscriptions")
        .select(
          "id, status, billing_interval, payment_method, current_period_start, current_period_end, trial_ends_at, cancel_at_period_end, canceled_at, plan_id, pending_plan_id, pending_billing_interval, provider",
        )
        .eq("business_id", businessId)
        .maybeSingle(),
      context.supabase
        .from("plans")
        .select(
          "id, code, name, description, professional_limit, monthly_price_cents, annual_price_cents, annual_months_charged, trial_days, sort_order",
        )
        .eq("active", true)
        .order("sort_order"),
      countActiveProfessionals(context.supabase, businessId),
    ]);

    return {
      businessId,
      subscription: subscription.data ?? null,
      plans: plans.data ?? [],
      activeProfessionals,
    };
  });

/** Starts a PIX or credit-card checkout through the configured provider. */
export const createSubscriptionCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => checkoutSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { requireOwnedBusinessId, loadPlanByCode, logAudit } = await import("./subscription.server");
    const { getPaymentProvider } = await import("./payments");
    const { planPriceCents } = await import("./plans");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const businessId = await requireOwnedBusinessId(context.supabase, context.userId);
    const plan = await loadPlanByCode(context.supabase, data.planCode);
    const business = await supabaseAdmin
      .from("businesses")
      .select("id, name, email, whatsapp")
      .eq("id", businessId)
      .single();

    const provider = getPaymentProvider(process.env["PAYMENT_PROVIDER"] ?? "mock");
    const customer = await provider.createCustomer({
      businessId,
      name: business.data?.name ?? "Negócio",
      email: business.data?.email ?? `${businessId}@example.invalid`,
      whatsapp: business.data?.whatsapp ?? null,
    });

    const origin = process.env["APP_ORIGIN"] ?? "";
    const checkout = await provider.createCheckout({
      businessId,
      providerCustomerId: customer.providerCustomerId,
      planCode: plan.code,
      interval: data.interval,
      amountCents: planPriceCents(plan, data.interval),
      method: data.method,
      successUrl: `${origin}/app/assinatura?checkout=success`,
      cancelUrl: `${origin}/app/assinatura?checkout=canceled`,
    });

    await supabaseAdmin
      .from("subscriptions")
      .update({
        provider: provider.name,
        provider_customer_id: customer.providerCustomerId,
        payment_method: data.method,
      })
      .eq("business_id", businessId);

    await logAudit(supabaseAdmin, businessId, context.userId, "subscription.checkout_started", "subscription", businessId, {
      plan: plan.code,
      interval: data.interval,
      method: data.method,
    });

    return {
      checkoutUrl: checkout.checkoutUrl,
      providerCheckoutId: checkout.providerCheckoutId,
      pixCode: checkout.pixCode ?? null,
      amountCents: planPriceCents(plan, data.interval),
    };
  });

/**
 * Schedules a plan/interval change. Upgrades and downgrades both take effect at
 * the START OF THE NEXT BILLING CYCLE — the current plan stays active until the
 * period ends. A downgrade that would break the professional limit is refused.
 */
export const schedulePlanChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => planChangeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { requireOwnedBusinessId, loadPlanByCode, countActiveProfessionals, logAudit } = await import(
      "./subscription.server"
    );
    const { classifyPlanChange, fitsLimit } = await import("./plans");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const businessId = await requireOwnedBusinessId(context.supabase, context.userId);
    const nextPlan = await loadPlanByCode(context.supabase, data.planCode);

    const current = await supabaseAdmin
      .from("subscriptions")
      .select(
        "id, billing_interval, current_period_end, status, plans:plan_id (id, code, name, description, professional_limit, monthly_price_cents, annual_price_cents, annual_months_charged, trial_days, sort_order)",
      )
      .eq("business_id", businessId)
      .maybeSingle();
    if (!current.data) throw new Error("SUBSCRIPTION_NOT_FOUND");
    const currentPlan = current.data.plans as unknown as Awaited<ReturnType<typeof loadPlanByCode>>;

    const kind = classifyPlanChange(
      currentPlan,
      nextPlan,
      current.data.billing_interval,
      data.interval,
    );
    if (kind === "NONE") return { kind, applied: false as const };

    if (kind === "DOWNGRADE") {
      const used = await countActiveProfessionals(context.supabase, businessId);
      if (!fitsLimit(nextPlan.professional_limit, used)) {
        throw new Error(
          `DOWNGRADE_BLOCKED: você tem ${used} profissionais ativos e o plano ${nextPlan.name} permite ${nextPlan.professional_limit}. Desative profissionais antes de mudar de plano.`,
        );
      }
    }

    await supabaseAdmin
      .from("subscriptions")
      .update({
        pending_plan_id: nextPlan.id,
        pending_billing_interval: data.interval,
        cancel_at_period_end: false,
      })
      .eq("business_id", businessId);

    await logAudit(supabaseAdmin, businessId, context.userId, "subscription.change_scheduled", "subscription", businessId, {
      from: currentPlan.code,
      to: nextPlan.code,
      interval: data.interval,
      kind,
    });

    return {
      kind,
      applied: true as const,
      effectiveAt: current.data.current_period_end,
      planName: nextPlan.name,
    };
  });

/** Cancels at the end of the paid period — no penalty, access until then. */
export const cancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireOwnedBusinessId, logAudit } = await import("./subscription.server");
    const { getPaymentProvider } = await import("./payments");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const businessId = await requireOwnedBusinessId(context.supabase, context.userId);
    const current = await supabaseAdmin
      .from("subscriptions")
      .select("provider, provider_subscription_id, current_period_end")
      .eq("business_id", businessId)
      .maybeSingle();
    if (!current.data) throw new Error("SUBSCRIPTION_NOT_FOUND");

    if (current.data.provider_subscription_id) {
      const provider = getPaymentProvider(current.data.provider);
      await provider.cancelSubscription({
        providerSubscriptionId: current.data.provider_subscription_id,
        atPeriodEnd: true,
      });
    }

    await supabaseAdmin
      .from("subscriptions")
      .update({ cancel_at_period_end: true, canceled_at: new Date().toISOString(), pending_plan_id: null, pending_billing_interval: null })
      .eq("business_id", businessId);

    await logAudit(supabaseAdmin, businessId, context.userId, "subscription.canceled", "subscription", businessId, {});
    return { canceledAt: new Date().toISOString(), activeUntil: current.data.current_period_end };
  });

/** Undoes a scheduled cancellation while the period is still running. */
export const reactivateSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireOwnedBusinessId, logAudit } = await import("./subscription.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const businessId = await requireOwnedBusinessId(context.supabase, context.userId);

    await supabaseAdmin
      .from("subscriptions")
      .update({ cancel_at_period_end: false, canceled_at: null })
      .eq("business_id", businessId);

    await logAudit(supabaseAdmin, businessId, context.userId, "subscription.reactivated", "subscription", businessId, {});
    return { ok: true as const };
  });

/** Drops a scheduled plan change. */
export const clearPendingPlanChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireOwnedBusinessId } = await import("./subscription.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const businessId = await requireOwnedBusinessId(context.supabase, context.userId);
    await supabaseAdmin
      .from("subscriptions")
      .update({ pending_plan_id: null, pending_billing_interval: null })
      .eq("business_id", businessId);
    return { ok: true as const };
  });
