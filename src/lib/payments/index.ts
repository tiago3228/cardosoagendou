import { MockPaymentProvider } from "./MockPaymentProvider";
import type { PaymentProvider } from "./PaymentProvider";

/**
 * Resolves the active provider. Call this INSIDE a server function handler /
 * server route handler so env vars are read at request time.
 */
export function getPaymentProvider(name?: string | null): PaymentProvider {
  switch ((name ?? "mock").toLowerCase()) {
    case "mock":
    default:
      // Real gateways (Asaas, Mercado Pago, Stripe) plug in here by
      // implementing PaymentProvider — no other file needs to change.
      return new MockPaymentProvider();
  }
}

export type { PaymentProvider } from "./PaymentProvider";
