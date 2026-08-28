import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { platformSetting } from "./billing.server";

type Db = SupabaseClient<Database>;

export interface PixConfig {
  key: string;
  holder: string;
  bank: string;
  instructions: string;
  configured: boolean;
}

/**
 * PIX receiving details of the SaaS owner. Stored in `platform_settings` (and
 * overridable through env for staging) — never hardcoded in components.
 */
export async function loadPixConfig(db: Db): Promise<PixConfig> {
  const [key, holder, bank, instructions] = await Promise.all([
    platformSetting<string>(db, "billing.pix_key", ""),
    platformSetting<string>(db, "billing.pix_holder", ""),
    platformSetting<string>(db, "billing.pix_bank", ""),
    platformSetting<string>(db, "billing.pix_instructions", ""),
  ]);
  const resolvedKey = key || process.env["PIX_KEY"] || "";
  return {
    key: resolvedKey,
    holder: holder || process.env["PIX_HOLDER"] || "",
    bank: bank || process.env["PIX_BANK"] || "",
    instructions:
      instructions ||
      "Faça o PIX no valor exato e clique em “Já fiz o PIX”. A liberação ocorre após conferência da nossa equipe.",
    configured: resolvedKey.length > 0,
  };
}

export async function pixRequestExpiryDays(db: Db): Promise<number> {
  const value = await platformSetting<number>(db, "billing.pix_request_expiry_days", 7);
  return Number(value) || 7;
}

export const PIX_REQUEST_COLUMNS =
  "id, business_id, subscription_id, plan_id, billing_interval, amount_cents, currency, status, proof_path, customer_note, admin_note, requested_at, reviewed_at, approved_at, rejected_at, period_start, period_end, expires_at, created_at";

/** Latest requests of one business (tenant-scoped by the caller). */
export async function listBusinessPixRequests(db: Db, businessId: string) {
  const { data, error } = await db
    .from("manual_payment_requests")
    .select(`${PIX_REQUEST_COLUMNS}, plans:plan_id (code, name)`)
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function findPendingPixRequest(db: Db, businessId: string) {
  const { data } = await db
    .from("manual_payment_requests")
    .select(PIX_REQUEST_COLUMNS)
    .eq("business_id", businessId)
    .eq("status", "PENDING")
    .maybeSingle();
  return data ?? null;
}
