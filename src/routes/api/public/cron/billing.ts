import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Daily billing reconciliation: expires grace periods and flags lapsed
 * periods as overdue so blocked businesses stop accepting bookings even if a
 * gateway notification was never delivered.
 */
export const Route = createFileRoute("/api/public/cron/billing")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateCronRequest(request);
        if (unauthorized) return unauthorized;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { reconcileSubscriptions } = await import("@/lib/billing.server");
        const result = await reconcileSubscriptions(supabaseAdmin);
        return Response.json({ ok: true, ...result });
      },
    },
  },
});
