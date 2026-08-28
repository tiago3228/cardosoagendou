import { createFileRoute } from "@tanstack/react-router";

/**
 * Payment gateway webhook ingress.
 *
 * Security: the request is only processed when the gateway echoes the shared
 * webhook token. The body is parsed but NEVER trusted for authorization — the
 * subscription is resolved by the gateway subscription id we stored ourselves.
 * Deliveries are at-least-once, so every event is de-duplicated by its id.
 */
export const Route = createFileRoute("/api/public/webhooks/asaas")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();

        const { getPaymentProvider } = await import("@/lib/payments");
        const provider = getPaymentProvider(process.env["PAYMENT_PROVIDER"] ?? "asaas");

        if (!provider.verifyWebhook(request.headers, rawBody)) {
          return new Response("Invalid webhook token", { status: 401 });
        }

        let event;
        try {
          event = provider.parseWebhook(rawBody);
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { applyBillingEvent, recordEventOnce, markEventProcessed, discardEvent } =
          await import("@/lib/billing.server");

        const isNew = await recordEventOnce(supabaseAdmin, provider.name, event);
        if (!isNew) {
          // Already handled — acknowledge so the gateway queue keeps moving.
          return Response.json({ received: true, duplicate: true });
        }

        try {
          const result = await applyBillingEvent(supabaseAdmin, event);
          if (!result.handled) {
            // Nothing to apply (unknown subscription / unsupported event): keep
            // the row as a processed no-op so it is not retried forever.
            await markEventProcessed(supabaseAdmin, provider.name, event.externalId, result.reason);
            return Response.json({ received: true, ...result });
          }
          await markEventProcessed(supabaseAdmin, provider.name, event.externalId, "OK");
          return Response.json({ received: true, ...result });
        } catch (error) {
          console.error("[billing] webhook failed", event.rawEventName, error);
          // Release the de-dup row so the gateway's retry is processed instead
          // of being mistaken for a duplicate delivery.
          await discardEvent(supabaseAdmin, provider.name, event.externalId);
          // Non-2xx makes the gateway retry the delivery.
          return new Response("Processing error", { status: 500 });
        }
      },
    },
  },
});
