import type {
  BillingInterval,
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
 * Asaas adapter (https://docs.asaas.com) — Brazilian gateway with native
 * recurring subscriptions for PIX and credit card.
 *
 * Auth: `access_token` header. Sandbox and production have distinct keys/URLs.
 * Webhooks: Asaas echoes the configured auth token in `asaas-access-token`.
 */

const CYCLE: Record<BillingInterval, string> = { MONTHLY: "MONTHLY", ANNUAL: "YEARLY" };

interface AsaasCustomer {
  id: string;
}
interface AsaasSubscription {
  id: string;
}
interface AsaasPayment {
  id: string;
  value?: number;
  status?: string;
  dueDate?: string;
  invoiceUrl?: string;
  billingType?: string;
  paymentDate?: string | null;
  clientPaymentDate?: string | null;
  confirmedDate?: string | null;
  subscription?: string | null;
  externalReference?: string | null;
}

function centsToValue(amountCents: number): number {
  return Math.round(amountCents) / 100;
}
function valueToCents(value: unknown): number | null {
  return typeof value === "number" ? Math.round(value * 100) : null;
}

export class AsaasProvider implements PaymentProvider {
  readonly name = "asaas";
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly webhookToken: string;

  constructor(options?: { apiKey?: string; sandbox?: boolean; webhookToken?: string }) {
    this.apiKey = options?.apiKey ?? process.env["ASAAS_API_KEY"] ?? "";
    const sandbox = options?.sandbox ?? (process.env["ASAAS_ENV"] ?? "sandbox") !== "production";
    this.baseUrl = sandbox ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3";
    this.webhookToken = options?.webhookToken ?? process.env["ASAAS_WEBHOOK_TOKEN"] ?? "";
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  private async request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
    if (!this.isConfigured()) {
      throw new Error("PAYMENT_PROVIDER_NOT_CONFIGURED: chave de API do gateway ausente");
    }
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        // Mandatory for accounts created after 2024-06-11.
        "User-Agent": "agendou-saas",
        access_token: this.apiKey,
      },
      ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });

    const text = await response.text();
    if (!response.ok) {
      // Asaas returns { errors: [{ code, description }] }
      let detail = text.slice(0, 400);
      try {
        const parsed = JSON.parse(text) as { errors?: { description?: string }[] };
        if (parsed.errors?.length) detail = parsed.errors.map((e) => e.description).join("; ");
      } catch {
        /* keep raw text */
      }
      throw new Error(`GATEWAY_ERROR: ${detail}`);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  async ensureCustomer(input: EnsureCustomerInput): Promise<EnsureCustomerResult> {
    if (input.existingCustomerId) return { providerCustomerId: input.existingCustomerId };
    const body: Record<string, unknown> = {
      name: input.name,
      email: input.email,
      externalReference: input.businessId,
      notificationDisabled: false,
    };
    if (input.whatsapp) body["mobilePhone"] = input.whatsapp.replace(/\D/g, "").replace(/^55/, "");
    if (input.taxId) body["cpfCnpj"] = input.taxId.replace(/\D/g, "");
    const customer = await this.request<AsaasCustomer>("/customers", { method: "POST", body });
    return { providerCustomerId: customer.id };
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<CreateSubscriptionResult> {
    const subscription = await this.request<AsaasSubscription>("/subscriptions", {
      method: "POST",
      body: {
        customer: input.providerCustomerId,
        billingType: input.method === "PIX" ? "PIX" : "CREDIT_CARD",
        value: centsToValue(input.amountCents),
        nextDueDate: input.nextDueDate,
        cycle: CYCLE[input.interval],
        description: `${input.planName} · ${input.interval === "ANNUAL" ? "anual" : "mensal"}`,
        externalReference: input.businessId,
        callback: { successUrl: input.returnUrl, autoRedirect: true },
      },
    });

    // Charges are created AFTER the subscription, so fetch the first one.
    const charge = await this.getSubscriptionCharge(subscription.id);
    return {
      providerSubscriptionId: subscription.id,
      providerPaymentId: charge?.providerPaymentId ?? null,
      invoiceUrl: charge?.invoiceUrl ?? null,
      pixPayload: charge?.pixPayload ?? null,
      dueDate: charge?.dueDate ?? null,
      amountCents: charge?.amountCents ?? input.amountCents,
    };
  }

  async getSubscriptionCharge(providerSubscriptionId: string): Promise<SubscriptionChargeInfo | null> {
    const list = await this.request<{ data?: AsaasPayment[] }>(
      `/subscriptions/${providerSubscriptionId}/payments?limit=10`,
    );
    const payments = list.data ?? [];
    const open =
      payments.find((p) => p.status === "PENDING" || p.status === "OVERDUE") ?? payments[0] ?? null;
    if (!open) return null;

    let pixPayload: string | null = null;
    if (open.billingType === "PIX") {
      try {
        const qr = await this.request<{ payload?: string }>(`/payments/${open.id}/pixQrCode`);
        pixPayload = qr.payload ?? null;
      } catch {
        // A PIX QR code may not be ready yet; the invoice URL still works.
        pixPayload = null;
      }
    }

    return {
      providerPaymentId: open.id,
      invoiceUrl: open.invoiceUrl ?? null,
      pixPayload,
      dueDate: open.dueDate ?? null,
      amountCents: valueToCents(open.value),
    };
  }

  async updateSubscription(input: UpdateSubscriptionInput): Promise<{ ok: true }> {
    await this.request(`/subscriptions/${input.providerSubscriptionId}`, {
      method: "POST",
      body: {
        value: centsToValue(input.amountCents),
        cycle: CYCLE[input.interval],
        billingType: input.method === "PIX" ? "PIX" : "CREDIT_CARD",
        updatePendingPayments: input.updatePendingPayments,
      },
    });
    return { ok: true };
  }

  async cancelSubscription(input: CancelSubscriptionInput): Promise<{ ok: true }> {
    await this.request(`/subscriptions/${input.providerSubscriptionId}`, { method: "DELETE" });
    return { ok: true };
  }

  verifyWebhook(headers: Headers): boolean {
    // Asaas sends the token configured on the webhook in this header.
    const provided = headers.get("asaas-access-token") ?? headers.get("asaas_access_token");
    if (!this.webhookToken) return false; // fail closed: never accept unsigned events
    if (!provided) return false;
    if (provided.length !== this.webhookToken.length) return false;
    let diff = 0;
    for (let i = 0; i < provided.length; i++) {
      diff |= provided.charCodeAt(i) ^ this.webhookToken.charCodeAt(i);
    }
    return diff === 0;
  }

  parseWebhook(rawBody: string): NormalizedWebhookEvent {
    const body = JSON.parse(rawBody) as {
      id?: string;
      event?: string;
      payment?: AsaasPayment;
      subscription?: AsaasSubscription & { externalReference?: string | null };
    };
    const eventName = body.event ?? "UNKNOWN";
    const payment = body.payment;

    const typeMap: Record<string, WebhookEventType> = {
      PAYMENT_CREATED: "payment.pending",
      PAYMENT_AWAITING_RISK_ANALYSIS: "payment.pending",
      PAYMENT_UPDATED: "payment.pending",
      PAYMENT_CONFIRMED: "payment.confirmed",
      PAYMENT_RECEIVED: "payment.confirmed",
      PAYMENT_OVERDUE: "payment.overdue",
      PAYMENT_REFUNDED: "payment.refunded",
      PAYMENT_CHARGEBACK_REQUESTED: "payment.refunded",
      PAYMENT_REPROVED_BY_RISK_ANALYSIS: "payment.overdue",
      SUBSCRIPTION_DELETED: "subscription.canceled",
    };

    const paidAtRaw = payment?.confirmedDate ?? payment?.paymentDate ?? payment?.clientPaymentDate ?? null;
    const method: PaymentMethod | null =
      payment?.billingType === "PIX"
        ? "PIX"
        : payment?.billingType === "CREDIT_CARD"
          ? "CREDIT_CARD"
          : null;

    return {
      externalId: body.id ?? `${eventName}:${payment?.id ?? body.subscription?.id ?? Date.now()}`,
      type: typeMap[eventName] ?? "unknown",
      rawEventName: eventName,
      providerSubscriptionId: payment?.subscription ?? body.subscription?.id ?? null,
      providerPaymentId: payment?.id ?? null,
      businessId: payment?.externalReference ?? body.subscription?.externalReference ?? null,
      amountCents: valueToCents(payment?.value),
      method,
      paidAt: paidAtRaw ? new Date(`${paidAtRaw}T12:00:00Z`.slice(0, 24)).toISOString() : null,
      dueDate: payment?.dueDate ?? null,
      invoiceUrl: payment?.invoiceUrl ?? null,
      raw: body,
    };
  }
}
