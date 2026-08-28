import type {
  CancelSubscriptionInput,
  CreateSubscriptionInput,
  CreateSubscriptionResult,
  EnsureCustomerInput,
  EnsureCustomerResult,
  NormalizedWebhookEvent,
  PaymentMethod,
  PaymentProvider,
  SubscriptionChargeInfo,
  UpdateSubscriptionInput,
  WebhookEventType,
} from "./PaymentProvider";

/**
 * Sandbox/test double. Only used when `billing.provider` is explicitly set to
 * "mock" — production resolves a real gateway and refuses to fall back here.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";

  isConfigured(): boolean {
    return true;
  }

  async ensureCustomer(input: EnsureCustomerInput): Promise<EnsureCustomerResult> {
    return { providerCustomerId: input.existingCustomerId ?? `mock_cus_${input.businessId}` };
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<CreateSubscriptionResult> {
    const url = new URL(input.returnUrl);
    url.searchParams.set("mock_checkout", "1");
    return {
      providerSubscriptionId: `mock_sub_${input.businessId}_${input.planCode}`,
      providerPaymentId: `mock_pay_${input.businessId}`,
      invoiceUrl: url.toString(),
      pixPayload: input.method === "PIX" ? `00020126MOCKPIX${input.amountCents}` : null,
      dueDate: input.nextDueDate,
      amountCents: input.amountCents,
    };
  }

  async getSubscriptionCharge(providerSubscriptionId: string): Promise<SubscriptionChargeInfo | null> {
    return {
      providerPaymentId: `mock_pay_${providerSubscriptionId}`,
      invoiceUrl: null,
      pixPayload: null,
      dueDate: null,
      amountCents: null,
    };
  }

  async updateSubscription(_input: UpdateSubscriptionInput): Promise<{ ok: true }> {
    return { ok: true };
  }

  async cancelSubscription(_input: CancelSubscriptionInput): Promise<{ ok: true }> {
    return { ok: true };
  }

  verifyWebhook(headers: Headers): boolean {
    const secret = process.env["ASAAS_WEBHOOK_TOKEN"] ?? "";
    if (!secret) return false;
    return headers.get("asaas-access-token") === secret;
  }

  parseWebhook(rawBody: string): NormalizedWebhookEvent {
    const body = JSON.parse(rawBody) as Record<string, unknown>;
    const eventName = String(body["event"] ?? "UNKNOWN");
    const allowed: WebhookEventType[] = [
      "payment.pending",
      "payment.confirmed",
      "payment.overdue",
      "payment.refunded",
      "subscription.canceled",
    ];
    const type = String(body["type"] ?? "");
    return {
      externalId: String(body["id"] ?? `mock_${eventName}_${Date.now()}`),
      type: (allowed as string[]).includes(type) ? (type as WebhookEventType) : "unknown",
      rawEventName: eventName,
      providerSubscriptionId: (body["providerSubscriptionId"] as string | undefined) ?? null,
      providerPaymentId: (body["providerPaymentId"] as string | undefined) ?? null,
      businessId: (body["businessId"] as string | undefined) ?? null,
      amountCents: (body["amountCents"] as number | undefined) ?? null,
      method: (body["method"] as PaymentMethod | undefined) ?? null,
      paidAt: (body["paidAt"] as string | undefined) ?? null,
      dueDate: (body["dueDate"] as string | undefined) ?? null,
      invoiceUrl: null,
      raw: body,
    };
  }
}
