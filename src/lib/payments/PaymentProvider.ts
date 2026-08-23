/**
 * Payment provider abstraction.
 *
 * The application never talks to a gateway directly: it depends on this
 * interface only, so Asaas / Mercado Pago / Stripe / Pagar.me can be plugged
 * in later without touching subscription logic, routes or the UI.
 */

export type PaymentMethod = "PIX" | "CREDIT_CARD";
export type BillingInterval = "MONTHLY" | "ANNUAL";

export interface CreateCustomerInput {
  businessId: string;
  name: string;
  email: string;
  whatsapp?: string | null;
}
export interface CreateCustomerResult {
  providerCustomerId: string;
}

export interface CreateCheckoutInput {
  businessId: string;
  providerCustomerId: string;
  planCode: string;
  interval: BillingInterval;
  amountCents: number;
  method: PaymentMethod;
  successUrl: string;
  cancelUrl: string;
}
export interface CreateCheckoutResult {
  checkoutUrl: string;
  providerCheckoutId: string;
  /** PIX copy-and-paste payload when the method is PIX. */
  pixCode?: string;
}

export interface ChangeSubscriptionInput {
  providerSubscriptionId: string;
  planCode: string;
  interval: BillingInterval;
  amountCents: number;
  /** Plan changes take effect on the next billing cycle by default. */
  applyAt: "NEXT_CYCLE" | "IMMEDIATELY";
}

export interface CancelSubscriptionInput {
  providerSubscriptionId: string;
  atPeriodEnd: boolean;
}

export interface NormalizedWebhookEvent {
  /** Stable id used for idempotency. */
  externalId: string;
  type:
    | "payment.confirmed"
    | "payment.failed"
    | "subscription.renewed"
    | "subscription.canceled"
    | "unknown";
  businessId?: string | null;
  planCode?: string | null;
  interval?: BillingInterval | null;
  method?: PaymentMethod | null;
  raw: unknown;
}

export interface PaymentProvider {
  readonly name: string;
  createCustomer(input: CreateCustomerInput): Promise<CreateCustomerResult>;
  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;
  changeSubscription(input: ChangeSubscriptionInput): Promise<{ ok: true }>;
  cancelSubscription(input: CancelSubscriptionInput): Promise<{ ok: true }>;
  /** Verifies the webhook signature over the RAW body. */
  verifyWebhook(rawBody: string, signature: string | null, secret: string | null): boolean;
  parseWebhook(rawBody: string): NormalizedWebhookEvent;
}
