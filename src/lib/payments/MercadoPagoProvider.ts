import { createHmac, timingSafeEqual } from "crypto";
import type {
  BillingInterval,
  CancelSubscriptionInput,
  CreateSubscriptionInput,
  CreateSubscriptionResult,
  EnsureCustomerInput,
  EnsureCustomerResult,
  NormalizedWebhookEvent,
  PaymentProvider,
  SubscriptionChargeInfo,
  UpdateSubscriptionInput,
} from "./PaymentProvider";

/**
 * Mercado Pago adapter — official recurring subscriptions (preapproval).
 *
 * Auth: `Authorization: Bearer <MERCADOPAGO_ACCESS_TOKEN>` (server-side only).
 * Webhooks: `x-signature` HMAC-SHA256 over
 *   `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 * using MERCADOPAGO_WEBHOOK_SECRET.
 *
 * The browser is NEVER trusted: a subscription only becomes ACTIVE after the
 * webhook path re-reads the authoritative status from the Mercado Pago API.
 */

const API = "https://api.mercadopago.com";

const FREQUENCY: Record<BillingInterval, { frequency: number; frequency_type: string }> = {
  MONTHLY: { frequency: 1, frequency_type: "months" },
  ANNUAL: { frequency: 12, frequency_type: "months" },
};

interface Preapproval {
  id: string;
  status?: string;
  init_point?: string;
  external_reference?: string | null;
  next_payment_date?: string | null;
  auto_recurring?: { transaction_amount?: number; currency_id?: string };
}
interface AuthorizedPayment {
  id: number | string;
  preapproval_id?: string;
  status?: string;
  payment?: { id?: number | string; status?: string };
  transaction_amount?: number;
  date_created?: string;
  last_modified?: string;
  external_reference?: string | null;
}
interface MpPayment {
  id: number | string;
  status?: string;
  status_detail?: string;
  transaction_amount?: number;
  date_approved?: string | null;
  external_reference?: string | null;
  metadata?: Record<string, unknown>;
  payment_method_id?: string;
  point_of_interaction?: { transaction_data?: { qr_code?: string; ticket_url?: string } };
}

function toCents(value: unknown): number | null {
  return typeof value === "number" ? Math.round(value * 100) : null;
}
function fromCents(amountCents: number): number {
  return Math.round(amountCents) / 100;
}

export class MercadoPagoProvider implements PaymentProvider {
  readonly name = "mercadopago";
  private readonly accessToken: string;
  private readonly webhookSecret: string;

  constructor(options?: { accessToken?: string; webhookSecret?: string }) {
    this.accessToken = options?.accessToken ?? process.env["MERCADOPAGO_ACCESS_TOKEN"] ?? "";
    this.webhookSecret = options?.webhookSecret ?? process.env["MERCADOPAGO_WEBHOOK_SECRET"] ?? "";
  }

  isConfigured(): boolean {
    return this.accessToken.length > 0;
  }

  private async request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
    if (!this.isConfigured()) {
      throw new Error("PAYMENT_PROVIDER_NOT_CONFIGURED: credencial do provedor de pagamento ausente");
    }
    const response = await fetch(`${API}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.accessToken}`,
      },
      ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
    const text = await response.text();
    if (!response.ok) {
      // Never surface gateway wording to customers — callers translate this.
      let detail = text.slice(0, 400);
      try {
        const parsed = JSON.parse(text) as { message?: string; cause?: { description?: string }[] };
        detail = parsed.cause?.map((c) => c.description).join("; ") || parsed.message || detail;
      } catch {
        /* keep raw text */
      }
      throw new Error(`GATEWAY_ERROR: ${detail}`);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  /**
   * Mercado Pago preapprovals are keyed by the payer e-mail, so there is no
   * separate customer resource to create.
   */
  async ensureCustomer(input: EnsureCustomerInput): Promise<EnsureCustomerResult> {
    return { providerCustomerId: input.existingCustomerId ?? input.email };
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<CreateSubscriptionResult> {
    const recurring = FREQUENCY[input.interval];
    const preapproval = await this.request<Preapproval>("/preapproval", {
      method: "POST",
      body: {
        reason: `${input.planName} · ${input.interval === "ANNUAL" ? "anual" : "mensal"}`,
        external_reference: input.businessId,
        payer_email: input.providerCustomerId,
        back_url: input.returnUrl,
        status: "pending",
        auto_recurring: {
          frequency: recurring.frequency,
          frequency_type: recurring.frequency_type,
          transaction_amount: fromCents(input.amountCents),
          currency_id: "BRL",
          start_date: new Date(`${input.nextDueDate}T12:00:00.000Z`).toISOString(),
        },
      },
    });

    return {
      providerSubscriptionId: preapproval.id,
      providerPaymentId: null,
      // Customer must approve the recurring authorization at this URL.
      invoiceUrl: preapproval.init_point ?? null,
      pixPayload: null,
      dueDate: input.nextDueDate,
      amountCents: input.amountCents,
    };
  }

  async getSubscriptionCharge(providerSubscriptionId: string): Promise<SubscriptionChargeInfo | null> {
    const preapproval = await this.request<Preapproval>(`/preapproval/${providerSubscriptionId}`);
    if (preapproval.status === "cancelled") return null;
    return {
      providerPaymentId: null,
      invoiceUrl: preapproval.status === "authorized" ? null : (preapproval.init_point ?? null),
      pixPayload: null,
      dueDate: preapproval.next_payment_date ? preapproval.next_payment_date.slice(0, 10) : null,
      amountCents: toCents(preapproval.auto_recurring?.transaction_amount),
    };
  }

  async updateSubscription(input: UpdateSubscriptionInput): Promise<{ ok: true }> {
    const recurring = FREQUENCY[input.interval];
    await this.request(`/preapproval/${input.providerSubscriptionId}`, {
      method: "PUT",
      body: {
        auto_recurring: {
          frequency: recurring.frequency,
          frequency_type: recurring.frequency_type,
          transaction_amount: fromCents(input.amountCents),
          currency_id: "BRL",
        },
      },
    });
    return { ok: true };
  }

  async cancelSubscription(input: CancelSubscriptionInput): Promise<{ ok: true }> {
    await this.request(`/preapproval/${input.providerSubscriptionId}`, {
      method: "PUT",
      body: { status: "cancelled" },
    });
    return { ok: true };
  }

  /** HMAC validation per Mercado Pago's current webhook security spec. */
  verifyWebhook(headers: Headers, rawBody: string): boolean {
    if (!this.webhookSecret) return false; // fail closed
    const signature = headers.get("x-signature");
    if (!signature) return false;

    const parts = new Map(
      signature.split(",").map((chunk) => {
        const [k, ...rest] = chunk.split("=");
        return [(k ?? "").trim(), rest.join("=").trim()] as const;
      }),
    );
    const ts = parts.get("ts");
    const v1 = parts.get("v1");
    if (!ts || !v1) return false;

    let dataId: string | null = null;
    try {
      const body = JSON.parse(rawBody) as { data?: { id?: string | number } };
      dataId = body.data?.id != null ? String(body.data.id) : null;
    } catch {
      return false;
    }
    const requestId = headers.get("x-request-id") ?? "";

    // Mercado Pago lowercases alphanumeric ids inside the manifest.
    const manifest = `id:${(dataId ?? "").toLowerCase()};${requestId ? `request-id:${requestId};` : ""}ts:${ts};`;
    const expected = createHmac("sha256", this.webhookSecret).update(manifest).digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(v1);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /**
   * Shallow parse — used only for logging/idempotency when the async resolver
   * is unavailable. Real status decisions go through `resolveWebhook`.
   */
  parseWebhook(rawBody: string): NormalizedWebhookEvent {
    const body = JSON.parse(rawBody) as {
      id?: string | number;
      type?: string;
      topic?: string;
      action?: string;
      data?: { id?: string | number };
    };
    const kind = body.type ?? body.topic ?? "unknown";
    const id = body.data?.id != null ? String(body.data.id) : String(body.id ?? "");
    return {
      externalId: `${kind}:${id}`,
      type: "unknown",
      rawEventName: body.action ?? kind,
      providerSubscriptionId: null,
      providerPaymentId: null,
      businessId: null,
      amountCents: null,
      method: null,
      paidAt: null,
      dueDate: null,
      invoiceUrl: null,
      raw: body,
    };
  }

  /**
   * Authoritative resolution: re-reads the resource from the Mercado Pago API
   * and normalizes it. The webhook payload itself is never trusted for state.
   */
  async resolveWebhook(rawBody: string): Promise<NormalizedWebhookEvent> {
    const body = JSON.parse(rawBody) as {
      id?: string | number;
      type?: string;
      topic?: string;
      action?: string;
      data?: { id?: string | number };
    };
    const kind = (body.type ?? body.topic ?? "unknown").toLowerCase();
    const resourceId = body.data?.id != null ? String(body.data.id) : "";
    const base = this.parseWebhook(rawBody);

    if (!resourceId) return base;

    if (kind.includes("preapproval") && !kind.includes("authorized_payment")) {
      const pre = await this.request<Preapproval>(`/preapproval/${resourceId}`);
      const status = (pre.status ?? "").toLowerCase();
      return {
        ...base,
        externalId: `preapproval:${resourceId}:${status}`,
        rawEventName: `preapproval.${status || "unknown"}`,
        providerSubscriptionId: pre.id,
        businessId: pre.external_reference ?? null,
        amountCents: toCents(pre.auto_recurring?.transaction_amount),
        method: "CREDIT_CARD",
        type:
          status === "authorized"
            ? "payment.confirmed"
            : status === "cancelled"
              ? "subscription.canceled"
              : status === "paused"
                ? "payment.overdue"
                : "payment.pending",
        raw: pre,
      };
    }

    if (kind.includes("authorized_payment")) {
      const auth = await this.request<AuthorizedPayment>(`/authorized_payments/${resourceId}`);
      const status = (auth.payment?.status ?? auth.status ?? "").toLowerCase();
      return {
        ...base,
        externalId: `authorized_payment:${resourceId}:${status}`,
        rawEventName: `authorized_payment.${status || "unknown"}`,
        providerSubscriptionId: auth.preapproval_id ?? null,
        providerPaymentId: auth.payment?.id != null ? String(auth.payment.id) : String(auth.id),
        businessId: auth.external_reference ?? null,
        amountCents: toCents(auth.transaction_amount),
        method: "CREDIT_CARD",
        paidAt: status === "approved" ? (auth.last_modified ?? new Date().toISOString()) : null,
        type:
          status === "approved"
            ? "payment.confirmed"
            : status === "refunded"
              ? "payment.refunded"
              : status === "rejected" || status === "cancelled"
                ? "payment.overdue"
                : "payment.pending",
        raw: auth,
      };
    }

    if (kind.includes("payment")) {
      const payment = await this.request<MpPayment>(`/v1/payments/${resourceId}`);
      const status = (payment.status ?? "").toLowerCase();
      const preapprovalId =
        typeof payment.metadata?.["preapproval_id"] === "string"
          ? (payment.metadata["preapproval_id"] as string)
          : null;
      return {
        ...base,
        externalId: `payment:${resourceId}:${status}`,
        rawEventName: `payment.${status || "unknown"}`,
        providerSubscriptionId: preapprovalId,
        providerPaymentId: String(payment.id),
        businessId: payment.external_reference ?? null,
        amountCents: toCents(payment.transaction_amount),
        method: payment.payment_method_id === "pix" ? "PIX" : "CREDIT_CARD",
        paidAt: payment.date_approved ?? null,
        invoiceUrl: payment.point_of_interaction?.transaction_data?.ticket_url ?? null,
        type:
          status === "approved"
            ? "payment.confirmed"
            : status === "refunded" || status === "charged_back"
              ? "payment.refunded"
              : status === "rejected" || status === "cancelled"
                ? "payment.overdue"
                : "payment.pending",
        raw: payment,
      };
    }

    return base;
  }
}
