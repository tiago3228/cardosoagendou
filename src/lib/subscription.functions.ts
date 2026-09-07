import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { checkoutSchema, planChangeSchema } from "./schemas";

/** Current subscription + plan catalogue + usage for the owner dashboard. */
export const getMySubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireOwnedBusinessId, countActiveProfessionals } =
      await import("./subscription.server");
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

/**
 * Starts (or replaces) the real recurring subscription at the gateway with PIX
 * or credit card. The subscription only becomes ACTIVE when the gateway
 * confirms the first payment through the webhook — never here.
 */
export const createSubscriptionCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => checkoutSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { requireOwnedBusinessId, loadPlanByCode, logAudit } =
      await import("./subscription.server");
    const { resolveProvider, loadSubscriptionByBusiness, dueDateString } =
      await import("./billing.server");
    const { planPriceCents } = await import("./plans");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const businessId = await requireOwnedBusinessId(context.supabase, context.userId);
    const plan = await loadPlanByCode(context.supabase, data.planCode);
    const amountCents = planPriceCents(plan, data.interval);

    const business = await supabaseAdmin
      .from("businesses")
      .select("id, name, email, whatsapp")
      .eq("id", businessId)
      .single();
    const current = await loadSubscriptionByBusiness(supabaseAdmin, businessId);
    if (!current) throw new Error("SUBSCRIPTION_NOT_FOUND");

    const provider = await resolveProvider(supabaseAdmin, null);
    if (!provider.isConfigured()) {
      throw new Error(
        "PAYMENT_PROVIDER_NOT_CONFIGURED: pagamentos indisponíveis no momento. Tente novamente em instantes.",
      );
    }

    const email = business.data?.email;
    if (!email) {
      throw new Error(
        "BUSINESS_EMAIL_REQUIRED: cadastre um e-mail de cobrança em Ajustes antes de assinar",
      );
    }

    const customer = await provider.ensureCustomer({
      businessId,
      name: business.data?.name ?? "Negócio",
      email,
      whatsapp: business.data?.whatsapp ?? null,
      existingCustomerId: current.provider_customer_id,
    });

    // Replace any previous gateway subscription so the business is never
    // charged twice for the same account.
    if (current.provider_subscription_id) {
      try {
        await provider.cancelSubscription({
          providerSubscriptionId: current.provider_subscription_id,
        });
      } catch (error) {
        console.error("[billing] failed to cancel previous subscription", error);
      }
    }

    const origin = process.env["APP_ORIGIN"] ?? "https://agendou-br.lovable.app";
    // Mercado Pago exige que auto_recurring.start_date seja estritamente futura.
    // Use pelo menos amanhã quando o trial já terminou ou termina hoje.
    const minimumGatewayDate = dueDateString(new Date(), 1);
    const trialDueDate =
      current.status === "TRIALING" &&
      current.trial_ends_at &&
      new Date(current.trial_ends_at) > new Date()
        ? dueDateString(new Date(current.trial_ends_at))
        : minimumGatewayDate;
    const created = await provider.createSubscription({
      businessId,
      providerCustomerId: customer.providerCustomerId,
      planCode: plan.code,
      planName: plan.name,
      interval: data.interval,
      amountCents,
      method: data.method,
      // Trials keep their remaining days: first charge lands when the trial ends.
      nextDueDate: trialDueDate > minimumGatewayDate ? trialDueDate : minimumGatewayDate,
      returnUrl: `${origin}/app/assinatura?checkout=done`,
    });

    await supabaseAdmin
      .from("subscriptions")
      .update({
        provider: provider.name,
        provider_customer_id: customer.providerCustomerId,
        provider_subscription_id: created.providerSubscriptionId,
        payment_method: data.method,
        pending_plan_id:
          plan.id === current.plan_id && data.interval === current.billing_interval
            ? null
            : plan.id,
        pending_billing_interval:
          plan.id === current.plan_id && data.interval === current.billing_interval
            ? null
            : data.interval,
        amount_cents: amountCents,
        cancel_at_period_end: false,
        canceled_at: null,
      })
      .eq("business_id", businessId);

    await logAudit(
      supabaseAdmin,
      businessId,
      context.userId,
      "MERCADOPAGO_SUBSCRIPTION_CREATED",
      "subscription",
      businessId,
      {
        plan: plan.code,
        interval: data.interval,
        method: data.method,
        provider: provider.name,
        provider_subscription_id: created.providerSubscriptionId,
      },
    );

    return {
      providerSubscriptionId: created.providerSubscriptionId,
      // Mercado Pago approval/checkout URL — access is only granted after the
      // webhook confirms the authorization/payment.
      checkoutUrl: created.invoiceUrl,
      invoiceUrl: created.invoiceUrl,
      pixCode: created.pixPayload,
      dueDate: created.dueDate,
      amountCents,
      method: data.method,
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
    const { requireOwnedBusinessId, loadPlanByCode, countActiveProfessionals, logAudit } =
      await import("./subscription.server");
    const { classifyPlanChange, fitsLimit } = await import("./plans");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const businessId = await requireOwnedBusinessId(context.supabase, context.userId);
    const nextPlan = await loadPlanByCode(context.supabase, data.planCode);

    const current = await supabaseAdmin
      .from("subscriptions")
      .select(
        "id, billing_interval, payment_method, current_period_end, status, plans:plan_id (id, code, name, description, professional_limit, monthly_price_cents, annual_price_cents, annual_months_charged, trial_days, sort_order)",
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

      if (nextPlan.code !== "UNLIMITED") {
        const segmentUsage = await (context.supabase as unknown as SupabaseClient)
          .from("business_segments")
          .select("id")
          .eq("business_id", businessId)
          .eq("active", true)
          .not("segment_id", "is", null);
        if (segmentUsage.error) throw new Error(segmentUsage.error.message);
        const segmentLimit = nextPlan.code === "BASIC" ? 1 : 2;
        if ((segmentUsage.data ?? []).length > segmentLimit) {
          throw new Error(
            `DOWNGRADE_BLOCKED: você tem ${segmentUsage.data?.length ?? 0} segmentos ativos e o plano ${nextPlan.name} permite ${segmentLimit}. Desative segmentos antes de mudar de plano.`,
          );
        }
      }
    }

    // Mirror the new value/cycle at the gateway so the NEXT charge is correct,
    // while the paid period keeps running on the current plan.
    const gatewaySubscriptionId = await supabaseAdmin
      .from("subscriptions")
      .select("provider, provider_subscription_id")
      .eq("business_id", businessId)
      .maybeSingle();
    if (gatewaySubscriptionId.data?.provider_subscription_id) {
      const { resolveProvider } = await import("./billing.server");
      const { planPriceCents } = await import("./plans");
      const provider = await resolveProvider(supabaseAdmin, gatewaySubscriptionId.data.provider);
      await provider.updateSubscription({
        providerSubscriptionId: gatewaySubscriptionId.data.provider_subscription_id,
        amountCents: planPriceCents(nextPlan, data.interval),
        interval: data.interval,
        method:
          (current.data as { payment_method?: "PIX" | "CREDIT_CARD" | null }).payment_method ??
          "PIX",
        // Only future charges change — never rewrite the current paid period.
        updatePendingPayments: false,
      });
    }

    await supabaseAdmin
      .from("subscriptions")
      .update({
        pending_plan_id: nextPlan.id,
        pending_billing_interval: data.interval,
        cancel_at_period_end: false,
      })
      .eq("business_id", businessId);

    await logAudit(
      supabaseAdmin,
      businessId,
      context.userId,
      "subscription.change_scheduled",
      "subscription",
      businessId,
      {
        from: currentPlan.code,
        to: nextPlan.code,
        interval: data.interval,
        kind,
      },
    );

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
    const { resolveProvider } = await import("./billing.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const businessId = await requireOwnedBusinessId(context.supabase, context.userId);
    const current = await supabaseAdmin
      .from("subscriptions")
      .select("provider, provider_subscription_id, current_period_end")
      .eq("business_id", businessId)
      .maybeSingle();
    if (!current.data) throw new Error("SUBSCRIPTION_NOT_FOUND");

    // Stop future charges at the gateway; access stays until the period ends.
    if (current.data.provider_subscription_id) {
      const provider = await resolveProvider(supabaseAdmin, current.data.provider);
      await provider.cancelSubscription({
        providerSubscriptionId: current.data.provider_subscription_id,
      });
    }

    await supabaseAdmin
      .from("subscriptions")
      .update({
        cancel_at_period_end: true,
        canceled_at: new Date().toISOString(),
        pending_plan_id: null,
        pending_billing_interval: null,
      })
      .eq("business_id", businessId);

    await logAudit(
      supabaseAdmin,
      businessId,
      context.userId,
      "subscription.canceled",
      "subscription",
      businessId,
      {},
    );
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

    await logAudit(
      supabaseAdmin,
      businessId,
      context.userId,
      "subscription.reactivated",
      "subscription",
      businessId,
      {},
    );
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
