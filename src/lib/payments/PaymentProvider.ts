/**
 * Payment provider abstraction for RECURRING subscriptions.
 *
 * The application never talks to a gateway directly: it depends on this
 * interface only, so Asaas / Mercado Pago / Stripe / Pagar.me can be swapped
 * without touching subscription logic, routes or the UI.
 */

export type PaymentMethod = "PIX" | "CREDIT_CARD";
export type BillingInterval = "MONTHLY" | "ANNUAL";

export interface EnsureCustomerInput {
  businessId: string;
  name: string;
  email: string;
  whatsapp?: string | null;
  /** Optional CPF/CNPJ — some gateways require it for credit card. */
  taxId?: string | null;
  /** Existing gateway customer id, when the business already has one. */
  existingCustomerId?: string | null;
}
export interface EnsureCustomerResult {
  providerCustomerId: string;
}

export interface CreateSubscriptionInput {
  businessId: string;
  providerCustomerId: string;
  planCode: string;
  planName: string;
  interval: BillingInterval;
  amountCents: number;
  method: PaymentMethod;
  /** First charge date, YYYY-MM-DD in the gateway's timezone. */
  nextDueDate: string;
  /** Where the gateway should send the customer back to. */
  returnUrl: string;
}

export interface SubscriptionChargeInfo {
  providerPaymentId: string | null;
  /** Hosted invoice / checkout page for card + boleto + pix. */
  invoiceUrl: string | null;
  /** PIX copy-and-paste payload, when the method is PIX. */
  pixPayload: string | null;
  dueDate: string | null;
  amountCents: number | null;
}

export interface CreateSubscriptionResult extends SubscriptionChargeInfo {
  providerSubscriptionId: string;
}

export interface UpdateSubscriptionInput {
  providerSubscriptionId: string;
  amountCents: number;
  interval: BillingInterval;
  method: PaymentMethod;
  /** Rewrite already-created unpaid charges with the new value/method. */
  updatePendingPayments: boolean;
}

export interface CancelSubscriptionInput {
  providerSubscriptionId: string;
}

export type WebhookEventType =
  | "payment.pending"
  | "payment.confirmed"
  | "payment.overdue"
  | "payment.refunded"
  | "subscription.canceled"
  | "unknown";

export interface NormalizedWebhookEvent {
  /** Stable gateway event id, used for idempotency. */
  externalId: string;
  type: WebhookEventType;
  rawEventName: string;
  providerSubscriptionId: string | null;
  providerPaymentId: string | null;
  /** businessId echoed back through externalReference, when present. */
  businessId: string | null;
  amountCents: number | null;
  method: PaymentMethod | null;
  paidAt: string | null;
  dueDate: string | null;
  invoiceUrl: string | null;
  raw: unknown;
}

export interface PaymentProvider {
  readonly name: string;
  /** True when the adapter has the credentials it needs to reach the gateway. */
  isConfigured(): boolean;
  ensureCustomer(input: EnsureCustomerInput): Promise<EnsureCustomerResult>;
  createSubscription(input: CreateSubscriptionInput): Promise<CreateSubscriptionResult>;
  /** First (or current) open charge of a subscription — used to show PIX/invoice again. */
  getSubscriptionCharge(providerSubscriptionId: string): Promise<SubscriptionChargeInfo | null>;
  updateSubscription(input: UpdateSubscriptionInput): Promise<{ ok: true }>;
  cancelSubscription(input: CancelSubscriptionInput): Promise<{ ok: true }>;
  /** Verifies the webhook request. `headers` is the raw incoming header map. */
  verifyWebhook(headers: Headers, rawBody: string): boolean;
  parseWebhook(rawBody: string): NormalizedWebhookEvent;
  /**
   * Optional authoritative resolution: gateways that only notify "resource X
   * changed" must re-read the resource from their API instead of trusting the
   * payload. When present, the webhook route prefers this over parseWebhook.
   */
  resolveWebhook?(rawBody: string): Promise<NormalizedWebhookEvent>;
}
