import type {
  PaymentProvider,
  CreateCustomerInput,
  CreateCustomerResult,
  CreateCheckoutInput,
  CreateCheckoutResult,
  ChangeSubscriptionInput,
  CancelSubscriptionInput,
  NormalizedWebhookEvent,
  BillingInterval,
  PaymentMethod,
} from "./PaymentProvider";

/**
 * Development/test provider. Simulates gateway responses so the whole
 * subscription lifecycle can be exercised before a real gateway is contracted.
 * Never selected in production unless PAYMENT_PROVIDER=mock is explicit.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";

  async createCustomer(input: CreateCustomerInput): Promise<CreateCustomerResult> {
    return { providerCustomerId: `mock_cus_${input.businessId}` };
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    // Built with the URL API so it stays valid even when successUrl already
    // carries its own query string.
    const url = new URL(input.successUrl);
    url.searchParams.set("mock_checkout", "1");
    url.searchParams.set("plan", input.planCode);
    url.searchParams.set("interval", input.interval);
    url.searchParams.set("method", input.method);
    const id = `mock_chk_${input.businessId}_${input.planCode}_${input.interval}`;
    return {
      checkoutUrl: url.toString(),
      providerCheckoutId: id,
      ...(input.method === "PIX" ? { pixCode: `00020126MOCKPIX${input.amountCents}` } : {}),
    };
  }

  async changeSubscription(_input: ChangeSubscriptionInput): Promise<{ ok: true }> {
    return { ok: true };
  }

  async cancelSubscription(_input: CancelSubscriptionInput): Promise<{ ok: true }> {
    return { ok: true };
  }

  verifyWebhook(_rawBody: string, signature: string | null, secret: string | null): boolean {
    // The mock accepts requests when no secret is configured; when one is set it
    // must be echoed in the signature header, mirroring real providers.
    if (!secret) return true;
    return signature === secret;
  }

  parseWebhook(rawBody: string): NormalizedWebhookEvent {
    const body = JSON.parse(rawBody) as Record<string, unknown>;
    const type = String(body["type"] ?? "unknown");
    const allowed: NormalizedWebhookEvent["type"][] = [
      "payment.confirmed",
      "payment.failed",
      "subscription.renewed",
      "subscription.canceled",
    ];
    return {
      externalId: String(body["id"] ?? `mock_${type}_${Date.now()}`),
      type: (allowed as string[]).includes(type) ? (type as NormalizedWebhookEvent["type"]) : "unknown",
      businessId: (body["businessId"] as string | undefined) ?? null,
      planCode: (body["planCode"] as string | undefined) ?? null,
      interval: (body["interval"] as BillingInterval | undefined) ?? null,
      method: (body["method"] as PaymentMethod | undefined) ?? null,
      raw: body,
    };
  }
}
