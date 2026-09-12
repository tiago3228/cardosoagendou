import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { PlanRow } from "./plans";

type Db = SupabaseClient<Database>;

/** Resolves the business the signed-in user owns; throws when they are not an owner. */
export async function requireOwnedBusinessId(db: Db, userId: string): Promise<string> {
  const { data } = await db
    .from("user_roles")
    .select("business_id")
    .eq("user_id", userId)
    .eq("role", "owner")
    .maybeSingle();
  if (!data?.business_id)
    throw new Error("FORBIDDEN: apenas o responsável pelo negócio pode fazer isso");
  return data.business_id;
}

/** Any business the user belongs to (owner or professional). */
export async function requireMemberBusinessId(db: Db, userId: string): Promise<string> {
  const { data } = await db
    .from("user_roles")
    .select("business_id, role")
    .eq("user_id", userId)
    .not("business_id", "is", null)
    .order("role", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data?.business_id) throw new Error("NO_BUSINESS: usuário sem negócio vinculado");
  return data.business_id;
}

export async function loadPlanByCode(db: Db, code: string): Promise<PlanRow> {
  const { data } = await db
    .from("plans")
    .select(
      "id, code, name, description, professional_limit, monthly_price_cents, annual_price_cents, annual_months_charged, trial_days, sort_order",
    )
    .eq("code", code)
    .eq("active", true)
    .maybeSingle();
  if (!data) throw new Error("PLAN_NOT_FOUND: plano indisponível");
  return data as PlanRow;
}

export async function countActiveProfessionals(db: Db, businessId: string): Promise<number> {
  const { count } = await db
    .from("professionals")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("active", true)
    .is("deleted_at", null);
  return count ?? 0;
}

export async function logAudit(
  db: Db,
  businessId: string | null,
  actorUserId: string | null,
  action: string,
  entity: string,
  entityId: string | null,
  data: Record<string, unknown> = {},
) {
  await db.from("audit_logs").insert({
    business_id: businessId,
    actor_user_id: actorUserId,
    action,
    entity,
    entity_id: entityId,
    data: data as never,
  });
}
