import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Everything the panel shell needs: business, role, plan usage and limits. */
export const getMyPanel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await context.supabase
      .from("user_roles")
      .select("role, business_id")
      .eq("user_id", context.userId);

    const businessId = roles.data?.find((r) => r.business_id)?.business_id ?? null;
    if (!businessId) {
      return {
        business: null,
        role: null,
        ownerName: null,
        subscription: null,
        usage: null,
        publicOrigin: null,
      };
    }

    const [business, subscription, professionals, profile] = await Promise.all([
      context.supabase
        .from("businesses")
        .select(
          "id, slug, name, business_type, description, logo_url, cover_url, whatsapp, email, address, show_address, show_whatsapp, booking_policy, slot_interval_minutes, min_notice_minutes, max_advance_days, timezone",
        )
        .eq("id", businessId)
        .maybeSingle(),
      context.supabase
        .from("subscriptions")
        .select(
          "status, billing_interval, current_period_end, trial_ends_at, cancel_at_period_end, plans:plan_id (code, name, professional_limit)",
        )
        .eq("business_id", businessId)
        .maybeSingle(),
      context.supabase
        .from("professionals")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .eq("active", true)
        .is("deleted_at", null),
      context.supabase.from("profiles").select("full_name").eq("id", context.userId).maybeSingle(),
    ]);

    // Official public domain for the booking link (never the preview/sandbox host).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const origin = await supabaseAdmin
      .from("platform_settings")
      .select("value")
      .eq("key", "app.public_origin")
      .maybeSingle();

    return {
      business: business.data ?? null,
      role: roles.data?.find((r) => r.business_id === businessId)?.role ?? null,
      ownerName: profile.data?.full_name ?? null,
      subscription: subscription.data ?? null,
      usage: { activeProfessionals: professionals.count ?? 0 },
      publicOrigin: typeof origin.data?.value === "string" ? origin.data.value : null,
    };
  });

/** Agenda for a date range plus today's headline numbers. */
export const getAgenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { from: string; to: string }) => input)
  .handler(async ({ data, context }) => {
    const appointments = await context.supabase
      .from("appointments")
      .select(
        "id, starts_at, ends_at, status, client_name, client_whatsapp, total_price_cents, duration_minutes, notes, professional_id, professionals:professional_id (name), appointment_services (service_name, price_cents, duration_minutes)",
      )
      .gte("starts_at", data.from)
      .lt("starts_at", data.to)
      .order("starts_at");
    if (appointments.error) throw new Error(appointments.error.message);
    return appointments.data ?? [];
  });
