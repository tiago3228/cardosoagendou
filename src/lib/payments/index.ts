import { MercadoPagoProvider } from "./MercadoPagoProvider";
import { MockPaymentProvider } from "./MockPaymentProvider";
import type { PaymentProvider } from "./PaymentProvider";

/**
 * Resolves the active gateway. Call this INSIDE a server function / server
 * route handler so env vars are read at request time.
 *
 * `name` comes from `platform_settings.billing.provider` (falling back to the
 * PAYMENT_PROVIDER env var). "mock" is only honoured outside production.
 *
 * Manual PIX is NOT a gateway: it lives in `manual-pix.server.ts` and never
 * touches Mercado Pago.
 */
export function getPaymentProvider(name?: string | null): PaymentProvider {
  const resolved = (name ?? process.env["PAYMENT_PROVIDER"] ?? "mercadopago").toLowerCase();
  switch (resolved) {
    case "mock": {
      if ((process.env["MERCADOPAGO_ENV"] ?? "test") === "production") {
        throw new Error("PAYMENT_PROVIDER_INVALID: o provedor mock não pode ser usado em produção");
      }
      return new MockPaymentProvider();
    }
    case "mercadopago":
    case "mercado_pago":
    default:
      return new MercadoPagoProvider();
  }
}

export type { PaymentProvider } from "./PaymentProvider";
