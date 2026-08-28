import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { addPeriod, planPriceCents, type BillingInterval, type PlanRow } from "./plans";
import { getPaymentProvider, type PaymentProvider } from "./payments";
import type { NormalizedWebhookEvent, PaymentMethod } from "./payments/PaymentProvider";

type Db = SupabaseClient<Database>;

const PLAN_COLUMNS =
  "id, code, name, description, professional_limit, monthly_price_cents, annual_price_cents, annual_months_charged, trial_days, sort_order";

/** Reads a platform setting, falling back to the given default. */
export async function platformSetting<T>(db: Db, key: string, fallback: T): Promise<T> {
  const { data } = await db.from("platform_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as T | undefined) ?? fallback;
}

/** Active gateway: platform_settings wins over the env var. */
export async function resolveProvider(db: Db, providerName?: string | null): Promise<PaymentProvider> {
  if (providerName) return getPaymentProvider(providerName);
  const configured = await platformSetting<string>(db, "billing.provider", "asaas");
  return getPaymentProvider(configured);
}

export async function graceDays(db: Db): Promise<number> {
  const value = await platformSetting<number>(db, "billing.grace_period_days", 7);
  return Number(value) || 7;
}

export interface SubscriptionRow {
  id: string;
  business_id: string;
  plan_id: string;
  status: Database["public"]["Enums"]["subscription_status"];
  billing_interval: BillingInterval;
  payment_method: PaymentMethod | null;
  current_period_start: string;
  current_period_end: string;
  trial_ends_at: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  pending_plan_id: string | null;
  pending_billing_interval: BillingInterval | null;
  provider: string;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  amount_cents: number | null;
  grace_expires_at: string | null;
}

const SUBSCRIPTION_COLUMNS =
  "id, business_id, plan_id, status, billing_interval, payment_method, current_period_start, current_period_end, trial_ends_at, cancel_at_period_end, canceled_at, pending_plan_id, pending_billing_interval, provider, provider_customer_id, provider_subscription_id, amount_cents, grace_expires_at";

export async function loadSubscriptionByBusiness(db: Db, businessId: string) {
  const { data } = await db
    .from("subscriptions")
    .select(SUBSCRIPTION_COLUMNS)
    .eq("business_id", businessId)
    .maybeSingle();
  return (data as SubscriptionRow | null) ?? null;
}

export async function loadSubscriptionByProviderId(db: Db, providerSubscriptionId: string) {
  const { data } = await db
    .from("subscriptions")
    .select(SUBSCRIPTION_COLUMNS)
    .eq("provider_subscription_id", providerSubscriptionId)
    .maybeSingle();
  return (data as SubscriptionRow | null) ?? null;
}

export async function loadPlanById(db: Db, planId: string): Promise<PlanRow | null> {
  const { data } = await db.from("plans").select(PLAN_COLUMNS).eq("id", planId).maybeSingle();
  return (data as PlanRow | null) ?? null;
}

/** Central entitlement source of truth — computed in the database. */
export async function businessEntitlements(db: Db, businessId: string) {
  const { data, error } = await db.rpc("business_entitlements", { _business_id: businessId });
  if (error) throw new Error(error.message);
  return data as {
    plan_code: string | null;
    plan_name?: string | null;
    professional_limit: number | null;
    status: string | null;
    booking_state: string;
    entitled?: boolean;
    grace_expires_at?: string | null;
    accepts_bookings: boolean;
    features: Record<string, string | number | boolean | null>;
    current_period_end?: string | null;
    trial_ends_at?: string | null;
    cancel_at_period_end?: boolean | null;
    grace_period_days?: number | null;
  };
}

export async function assertAcceptsBookings(db: Db, businessId: string): Promise<void> {
  const { data, error } = await db.rpc("business_accepts_bookings", { _business_id: businessId });
  if (error) throw new Error(error.message);
  if (data !== true) {
    throw new Error(
      "BOOKING_BLOCKED: esta agenda está temporariamente indisponível. Fale com o estabelecimento.",
    );
  }
}

/** YYYY-MM-DD for the gateway's due date, offset by whole days. */
export function dueDateString(from: Date, addDays = 0): string {
  const d = new Date(from.getTime() + addDays * 86400000);
  return d.toISOString().slice(0, 10);
}

/**
 * Records a raw gateway event. Returns false when the event was already
 * processed (idempotency), so the caller can stop early.
 */
export async function recordEventOnce(
  db: Db,
  provider: string,
  event: NormalizedWebhookEvent,
): Promise<boolean> {
  const { error } = await db.from("payment_events").insert({
    provider,
    external_id: event.externalId,
    event_type: event.rawEventName,
    business_id: event.businessId,
    payload: event.raw as never,
  });
  if (error) {
    // 23505 = unique violation → duplicate delivery.
    if (error.code === "23505") return false;
    throw new Error(error.message);
  }
  return true;
}

export async function markEventProcessed(
  db: Db,
  provider: string,
  externalId: string,
  result?: string,
) {
  await db
    .from("payment_events")
    .update({ processed_at: new Date().toISOString(), result: result ?? "OK" })
    .eq("provider", provider)
    .eq("external_id", externalId);
}

/**
 * Removes the de-duplication row when processing failed, so the gateway's
 * retry is treated as a NEW event instead of being swallowed as a duplicate.
 */
export async function discardEvent(db: Db, provider: string, externalId: string) {
  await db.from("payment_events").delete().eq("provider", provider).eq("external_id", externalId);
}

async function upsertPayment(
  db: Db,
  subscription: SubscriptionRow,
  event: NormalizedWebhookEvent,
  status: string,
) {
  if (!event.providerPaymentId) return;
  await db.from("payments").upsert(
    {
      business_id: subscription.business_id,
      subscription_id: subscription.id,
      provider: subscription.provider,
      provider_payment_id: event.providerPaymentId,
      provider_event_id: event.externalId,
      amount_cents: event.amountCents ?? subscription.amount_cents ?? 0,
      status,
      payment_method: event.method ?? subscription.payment_method,
      invoice_url: event.invoiceUrl,
      paid_at: status === "PAID" ? (event.paidAt ?? new Date().toISOString()) : null,
      due_at: event.dueDate ? new Date(`${event.dueDate}T12:00:00Z`).toISOString() : null,
    },
    { onConflict: "provider,provider_payment_id" },
  );
}

async function audit(
  db: Db,
  businessId: string | null,
  action: string,
  data: Record<string, unknown>,
) {
  await db.from("audit_logs").insert({
    business_id: businessId,
    actor_user_id: null,
    action,
    entity: "subscription",
    entity_id: businessId,
    data: data as never,
  });
}

async function resolveSubscription(db: Db, event: NormalizedWebhookEvent) {
  if (event.providerSubscriptionId) {
    const byProvider = await loadSubscriptionByProviderId(db, event.providerSubscriptionId);
    if (byProvider) return byProvider;
  }
  if (event.businessId) return loadSubscriptionByBusiness(db, event.businessId);
  return null;
}

/**
 * Applies a normalized gateway event to the subscription state machine.
 *
 * payment.confirmed → ACTIVE, period rolled forward, pending plan change applied
 * payment.overdue   → PAST_DUE with a grace deadline (agenda keeps working)
 * payment.refunded  → SUSPENDED (agenda blocked immediately)
 * subscription.canceled → CANCELED at the end of the paid period
 */
export async function applyBillingEvent(db: Db, event: NormalizedWebhookEvent) {
  const subscription = await resolveSubscription(db, event);
  if (!subscription) return { handled: false as const, reason: "SUBSCRIPTION_NOT_FOUND" };

  switch (event.type) {
    case "payment.confirmed": {
      // A confirmed payment starts a new paid period and applies any change
      // the owner scheduled for the next cycle.
      const targetPlanId = subscription.pending_plan_id ?? subscription.plan_id;
      const targetInterval = subscription.pending_billing_interval ?? subscription.billing_interval;
      const plan = await loadPlanById(db, targetPlanId);
      const start = new Date();
      const end = addPeriod(start, targetInterval);

      await db
        .from("subscriptions")
        .update({
          status: "ACTIVE",
          plan_id: targetPlanId,
          billing_interval: targetInterval,
          pending_plan_id: null,
          pending_billing_interval: null,
          payment_method: event.method ?? subscription.payment_method,
          amount_cents: plan ? planPriceCents(plan, targetInterval) : subscription.amount_cents,
          current_period_start: start.toISOString(),
          current_period_end: end.toISOString(),
          grace_expires_at: null,
          last_payment_at: event.paidAt ?? start.toISOString(),
          trial_ends_at: null,
        })
        .eq("id", subscription.id);

      await upsertPayment(db, subscription, event, "PAID");
      await db.from("transactions").insert({
        business_id: subscription.business_id,
        type: "SUBSCRIPTION",
        amount_cents: event.amountCents ?? subscription.amount_cents ?? 0,
        description: `Assinatura ${plan?.name ?? ""} (${targetInterval === "ANNUAL" ? "anual" : "mensal"})`,
        occurred_at: event.paidAt ?? start.toISOString(),
      });
      await audit(db, subscription.business_id, "billing.payment_confirmed", {
        plan: plan?.code ?? null,
        interval: targetInterval,
        amount_cents: event.amountCents,
      });
      return { handled: true as const, state: "ACTIVE" };
    }

    case "payment.overdue": {
      const days = await graceDays(db);
      await db
        .from("subscriptions")
        .update({
          status: "PAST_DUE",
          grace_expires_at: new Date(Date.now() + days * 86400000).toISOString(),
        })
        .eq("id", subscription.id);
      await upsertPayment(db, subscription, event, "OVERDUE");
      await audit(db, subscription.business_id, "billing.payment_overdue", { grace_days: days });
      return { handled: true as const, state: "PAST_DUE" };
    }

    case "payment.refunded": {
      await db
        .from("subscriptions")
        .update({ status: "SUSPENDED", grace_expires_at: null })
        .eq("id", subscription.id);
      await upsertPayment(db, subscription, event, "REFUNDED");
      await audit(db, subscription.business_id, "billing.payment_refunded", {});
      return { handled: true as const, state: "SUSPENDED" };
    }

    case "subscription.canceled": {
      await db
        .from("subscriptions")
        .update({
          status: "CANCELED",
          cancel_at_period_end: true,
          canceled_at: new Date().toISOString(),
          pending_plan_id: null,
          pending_billing_interval: null,
        })
        .eq("id", subscription.id);
      await audit(db, subscription.business_id, "billing.subscription_canceled", {});
      return { handled: true as const, state: "CANCELED" };
    }

    case "payment.pending": {
      await upsertPayment(db, subscription, event, "PENDING");
      return { handled: true as const, state: subscription.status };
    }

    default:
      return { handled: false as const, reason: "UNSUPPORTED_EVENT" };
  }
}

/**
 * Periodic reconciliation (cron): expires grace periods that ran out and
 * suspends businesses whose paid period ended without a new payment.
 */
export async function reconcileSubscriptions(db: Db) {
  const now = new Date().toISOString();
  const expiredGrace = await db
    .from("subscriptions")
    .update({ status: "SUSPENDED" })
    .eq("status", "PAST_DUE")
    .lt("grace_expires_at", now)
    .select("id, business_id");

  const lapsed = await db
    .from("subscriptions")
    .update({ status: "PAST_DUE", grace_expires_at: new Date(Date.now() + (await graceDays(db)) * 86400000).toISOString() })
    .in("status", ["TRIALING", "ACTIVE"])
    .lt("current_period_end", now)
    .select("id, business_id");

  return {
    suspended: expiredGrace.data?.length ?? 0,
    pastDue: lapsed.data?.length ?? 0,
  };
}
