import { createFileRoute } from "@tanstack/react-router";

/**
 * Mercado Pago webhook ingress (authoritative source of billing truth).
 *
 * Security: the request signature is validated with MERCADOPAGO_WEBHOOK_SECRET
 * before anything is read. The payload is never trusted for state — the
 * provider re-reads the resource from the Mercado Pago API. Deliveries are
 * at-least-once, so every event is de-duplicated by a stable external id.
 */
export const Route = createFileRoute("/api/public/webhooks/mercadopago")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();

        const { getPaymentProvider } = await import("@/lib/payments");
        const provider = getPaymentProvider("mercadopago");

        if (!provider.verifyWebhook(request.headers, rawBody)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let event;
        try {
          event = provider.resolveWebhook
            ? await provider.resolveWebhook(rawBody)
            : provider.parseWebhook(rawBody);
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          // Simulated/test deliveries carry fake resource ids (e.g. "123456"), so the
          // authoritative read 404s. Acknowledge instead of failing the delivery test.
          if (/not found|404|resource with id/i.test(detail)) {
            console.warn("[billing] webhook resource not found (test delivery?)", detail);
            return Response.json({ received: true, ignored: "resource_not_found" });
          }
          console.error("[billing] failed to resolve webhook resource", error);
          return new Response("Unresolved resource", { status: 500 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { applyBillingEvent, recordEventOnce, markEventProcessed, discardEvent } = await import(
          "@/lib/billing.server"
        );

        const isNew = await recordEventOnce(supabaseAdmin, provider.name, event);
        if (!isNew) {
          // Already handled — acknowledge so the gateway queue keeps moving.
          return Response.json({ received: true, duplicate: true });
        }

        try {
          const result = await applyBillingEvent(supabaseAdmin, event);
          await markEventProcessed(
            supabaseAdmin,
            provider.name,
            event.externalId,
            result.handled ? "OK" : result.reason,
          );
          return Response.json({ received: true, ...result });
        } catch (error) {
          console.error("[billing] webhook failed", event.rawEventName, error);
          // Release the de-dup row so the gateway retry is processed instead of
          // being mistaken for a duplicate delivery.
          await discardEvent(supabaseAdmin, provider.name, event.externalId);
          return new Response("Processing error", { status: 500 });
        }
      },
    },
  },
});
