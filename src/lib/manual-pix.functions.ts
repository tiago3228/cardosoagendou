import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { manualPixRequestSchema, pixQuoteSchema, pixReviewSchema } from "./schemas";

/**
 * Manual PIX: the customer pays the SaaS owner directly and the Master account
 * approves. This path NEVER touches Mercado Pago.
 */

/** PIX receiving details + amount for the chosen plan + pending request, if any. */
export const getPixCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => pixQuoteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { requireOwnedBusinessId, loadPlanByCode } = await import("./subscription.server");
    const { loadPixConfig, findPendingPixRequest, listBusinessPixRequests } = await import(
      "./manual-pix.server"
    );
    const { planPriceCents } = await import("./plans");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const businessId = await requireOwnedBusinessId(context.supabase, context.userId);
    const plan = await loadPlanByCode(context.supabase, data.planCode);
    const pix = await loadPixConfig(supabaseAdmin);

    return {
      businessId,
      pix,
      plan: { code: plan.code, name: plan.name },
      interval: data.interval,
      amountCents: planPriceCents(plan, data.interval),
      pending: await findPendingPixRequest(context.supabase, businessId),
      history: await listBusinessPixRequests(context.supabase, businessId),
    };
  });

/** Requests are read through RLS, so this is always tenant-scoped. */
export const listMyPixRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireMemberBusinessId } = await import("./subscription.server");
    const { listBusinessPixRequests } = await import("./manual-pix.server");
    const businessId = await requireMemberBusinessId(context.supabase, context.userId);
    return { businessId, requests: await listBusinessPixRequests(context.supabase, businessId) };
  });

/**
 * "Já fiz o PIX" — creates a PENDING request. The business is resolved
 * server-side from the session; a client-provided id is never trusted. Amount
 * comes from the plans table, not from the browser.
 */
export const createManualPixRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => manualPixRequestSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { requireOwnedBusinessId, loadPlanByCode, logAudit } = await import("./subscription.server");
    const { loadSubscriptionByBusiness } = await import("./billing.server");
    const { findPendingPixRequest, pixRequestExpiryDays } = await import("./manual-pix.server");
    const { planPriceCents } = await import("./plans");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const businessId = await requireOwnedBusinessId(context.supabase, context.userId);

    const existing = await findPendingPixRequest(context.supabase, businessId);
    if (existing) {
      return { created: false as const, request: existing };
    }

    const plan = await loadPlanByCode(context.supabase, data.planCode);
    const amountCents = planPriceCents(plan, data.interval);
    const subscription = await loadSubscriptionByBusiness(supabaseAdmin, businessId);

    // A proof path is only accepted inside the tenant's own storage folder.
    if (data.proofPath && !data.proofPath.startsWith(`${businessId}/`)) {
      throw new Error("INVALID_PROOF: comprovante inválido");
    }

    const days = await pixRequestExpiryDays(supabaseAdmin);
    const insert = await supabaseAdmin
      .from("manual_payment_requests")
      .insert({
        business_id: businessId,
        subscription_id: subscription?.id ?? null,
        plan_id: plan.id,
        billing_interval: data.interval,
        amount_cents: amountCents,
        payment_method: "PIX_MANUAL",
        status: "PENDING",
        proof_path: data.proofPath ?? null,
        customer_note: data.customerNote ?? null,
        requested_by: context.userId,
        expires_at: new Date(Date.now() + days * 86400000).toISOString(),
      })
      .select("id, status, amount_cents, billing_interval, created_at, expires_at")
      .single();

    if (insert.error) {
      // Unique partial index → a pending request was created concurrently.
      if (insert.error.code === "23505") {
        const pending = await findPendingPixRequest(context.supabase, businessId);
        return { created: false as const, request: pending };
      }
      throw new Error("PIX_REQUEST_FAILED: não foi possível registrar sua solicitação");
    }

    await logAudit(
      supabaseAdmin,
      businessId,
      context.userId,
      "PIX_MANUAL_REQUEST_CREATED",
      "manual_payment_request",
      insert.data.id,
      { plan: plan.code, interval: data.interval, amount_cents: amountCents },
    );

    return { created: true as const, request: insert.data };
  });

/** True when the signed-in user is the platform Master. */
export const getMasterStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("is_master", { _user_id: context.userId });
    return { isMaster: data === true };
  });

/** Master review queue with business/plan context. */
export const listPixRequestsForReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isMaster } = await context.supabase.rpc("is_master", { _user_id: context.userId });
    if (isMaster !== true) throw new Error("FORBIDDEN: acesso restrito à conta master");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { PIX_REQUEST_COLUMNS } = await import("./manual-pix.server");
    const { data, error } = await supabaseAdmin
      .from("manual_payment_requests")
      .select(`${PIX_REQUEST_COLUMNS}, businesses:business_id (name, slug, email), plans:plan_id (code, name)`)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error("PIX_LIST_FAILED: não foi possível carregar as solicitações");

    // Short-lived links so the Master can inspect proofs without a public bucket.
    const rows = await Promise.all(
      (data ?? []).map(async (row) => {
        let proofUrl: string | null = null;
        if (row.proof_path) {
          const signed = await supabaseAdmin.storage
            .from("pix-proofs")
            .createSignedUrl(row.proof_path, 300);
          proofUrl = signed.data?.signedUrl ?? null;
        }
        return { ...row, proofUrl };
      }),
    );
    return { requests: rows };
  });

/**
 * Approve or reject. The whole state change (request + subscription + payment +
 * transaction + audit) runs inside one database function, so it is atomic and
 * cannot be applied twice.
 */
export const reviewPixRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => pixReviewSchema.parse(input))
  .handler(async ({ data, context }) => {
    const fn = data.action === "APPROVE" ? "approve_manual_payment_request" : "reject_manual_payment_request";
    const { data: result, error } = await context.supabase.rpc(fn, {
      _request_id: data.requestId,
      ...(data.adminNote ? { _admin_note: data.adminNote } : {}),
    });
    if (error) throw new Error(error.message);
    return result as { already: boolean; status: string; period_start?: string; period_end?: string };
  });
