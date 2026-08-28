import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Db = SupabaseClient<Database>;

/** Throws unless the caller really holds the platform master role (server-side check). */
export async function assertMaster(db: Db, userId: string): Promise<void> {
  const { data, error } = await db.rpc("is_master", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error("FORBIDDEN: acesso restrito à conta master");
}

export type MasterBusinessRow = {
  id: string;
  name: string;
  slug: string;
  planCode: string | null;
  planName: string | null;
  interval: string | null;
  status: string | null;
  currentPeriodEnd: string | null;
  provider: string | null;
};

/** Every tenant with its current plan — master-only overview. */
export async function listBusinessesWithPlans(db: Db): Promise<MasterBusinessRow[]> {
  const { data, error } = await db
    .from("businesses")
    .select(
      "id, name, slug, subscriptions (status, billing_interval, current_period_end, provider, plans:plan_id (code, name))",
    )
    .order("name");
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const list = (row as { subscriptions?: unknown }).subscriptions;
    const sub = (Array.isArray(list) ? list[0] : list) as
      | {
          status: string | null;
          billing_interval: string | null;
          current_period_end: string | null;
          provider: string | null;
          plans: { code: string | null; name: string | null } | null;
        }
      | null
      | undefined;
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      planCode: sub?.plans?.code ?? null,
      planName: sub?.plans?.name ?? null,
      interval: sub?.billing_interval ?? null,
      status: sub?.status ?? null,
      currentPeriodEnd: sub?.current_period_end ?? null,
      provider: sub?.provider ?? null,
    };
  });
}
