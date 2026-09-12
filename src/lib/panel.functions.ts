import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type PanelBusiness = Database["public"]["Tables"]["businesses"]["Row"];

/** Everything the panel shell needs: business, role, plan usage and limits. */
export const getMyPanel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    let roles = await context.supabase
      .from("user_roles")
      .select("role, business_id")
      .eq("user_id", context.userId);

    if (!roles.data?.some((role) => role.business_id)) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        roles = await supabaseAdmin
          .from("user_roles")
          .select("role, business_id")
          .eq("user_id", context.userId);
      } catch (error) {
        console.warn("[Panel] Não foi possível consultar o vínculo administrativo:", error);
      }
    }

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

    const businessSelect =
      "id, slug, name, business_type, description, logo_url, cover_url, whatsapp, email, address, show_address, show_whatsapp, agenda_alerts_enabled, booking_share_message, booking_share_niche, booking_share_style, booking_policy, slot_interval_minutes, min_notice_minutes, max_advance_days, cancellation_deadline_hours, primary_color, secondary_color, timezone";
    const legacyBusinessSelect =
      "id, slug, name, business_type, description, logo_url, cover_url, whatsapp, email, address, show_address, show_whatsapp, booking_policy, slot_interval_minutes, min_notice_minutes, max_advance_days, cancellation_deadline_hours, primary_color, secondary_color, timezone";
    const businessQuery = context.supabase
      .from("businesses")
      .select(businessSelect)
      .eq("id", businessId)
      .maybeSingle();
    const [businessResult, subscription, professionals, profile] = await Promise.all([
      businessQuery,
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

    const business = (businessResult.error
      ? await context.supabase
          .from("businesses")
          .select(legacyBusinessSelect)
          .eq("id", businessId)
          .maybeSingle()
      : businessResult) as unknown as {
      data: Partial<PanelBusiness> | null;
      error: { message: string } | null;
    };

    const normalizedBusiness: PanelBusiness | null = business.data
      ? ({
          ...business.data,
          agenda_alerts_enabled: business.data.agenda_alerts_enabled ?? true,
          booking_share_message: business.data.booking_share_message ?? null,
          booking_share_niche: business.data.booking_share_niche ?? null,
          booking_share_style: business.data.booking_share_style ?? "professional",
        } as PanelBusiness)
      : null;

    // Official public domain for the booking link (never the preview/sandbox host).
    let origin: { data: { value: unknown } | null } = { data: null };
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      origin = await supabaseAdmin
        .from("platform_settings")
        .select("value")
        .eq("key", "app.public_origin")
        .maybeSingle();
    } catch (error) {
      console.warn("[Panel] Usando origem pública do ambiente:", error);
    }

    return {
      business: normalizedBusiness,
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
        "id, starts_at, ends_at, status, client_name, client_whatsapp, total_price_cents, duration_minutes, notes, blocks_agenda, professional_id, professionals:professional_id (name), appointment_services (service_name, price_cents, duration_minutes)",
      )
      .gte("starts_at", data.from)
      .lt("starts_at", data.to)
      .order("starts_at");
    if (appointments.error) throw new Error(appointments.error.message);
    return appointments.data ?? [];
  });
