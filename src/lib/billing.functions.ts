import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Central entitlement read for the panel: plan, limits, billing status and
 * whether the public agenda is currently accepting bookings.
 * Every gate in the UI reads from here; the database is the source of truth.
 */
export const getMyEntitlements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireMemberBusinessId } = await import("./subscription.server");
    const { businessEntitlements } = await import("./billing.server");
    const businessId = await requireMemberBusinessId(context.supabase, context.userId);
    const entitlements = await businessEntitlements(context.supabase, businessId);
    return { businessId, ...entitlements };
  });

/** Re-fetches the open charge (PIX code / invoice link) for the current subscription. */
export const getOpenCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireOwnedBusinessId } = await import("./subscription.server");
    const { loadSubscriptionByBusiness, resolveProvider } = await import("./billing.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const businessId = await requireOwnedBusinessId(context.supabase, context.userId);
    const subscription = await loadSubscriptionByBusiness(supabaseAdmin, businessId);
    if (!subscription?.provider_subscription_id) return null;

    const provider = await resolveProvider(supabaseAdmin, subscription.provider);
    const charge = await provider.getSubscriptionCharge(subscription.provider_subscription_id);
    return charge;
  });
