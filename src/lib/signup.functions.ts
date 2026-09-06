import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { provisionSchema } from "./schemas";

/**
 * Finishes onboarding for the currently signed-in user: creates the business,
 * the owner role, default opening hours, a first professional, a sample service
 * catalog for the chosen business type and a trial subscription on the entry plan.
 */
export const provisionBusiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => provisionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, claims } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { normalizeBrWhatsapp, slugify } = await import("./format");
    const { businessTypeConfig } = await import("./business-types");

    const existing = await supabaseAdmin
      .from("user_roles")
      .select("business_id")
      .eq("user_id", userId)
      .eq("role", "owner")
      .maybeSingle();
    if (existing.data?.business_id) {
      return { businessId: existing.data.business_id, alreadyProvisioned: true as const };
    }

    const whatsapp = normalizeBrWhatsapp(data.whatsapp);
    if (!whatsapp) throw new Error("WHATSAPP_INVALID: WhatsApp inválido");

    const base = slugify(data.businessName) || "negocio";
    let slug = base;
    for (let attempt = 0; attempt < 25; attempt++) {
      const taken = await supabaseAdmin
        .from("businesses")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (!taken.data) break;
      slug = `${base}-${attempt + 2}`;
    }

    const email = (claims as { email?: string }).email ?? null;

    const business = await supabaseAdmin
      .from("businesses")
      .insert({
        slug,
        name: data.businessName,
        business_type: data.businessType,
        whatsapp,
        email,
      })
      .select("id, slug")
      .single();
    if (business.error || !business.data) {
      throw new Error(`BUSINESS_CREATE_FAILED: ${business.error?.message ?? "erro desconhecido"}`);
    }
    const businessId = business.data.id;

    await supabaseAdmin
      .from("profiles")
      .upsert({ id: userId, full_name: data.ownerName, email, whatsapp }, { onConflict: "id" });

    await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, business_id: businessId, role: "owner" });

    // Mon-Fri 09-19, Sat 09-14, Sun closed.
    await supabaseAdmin.from("business_hours").insert(
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        business_id: businessId,
        weekday,
        opens_at: "09:00",
        closes_at: weekday === 6 ? "14:00" : "19:00",
        closed: weekday === 0,
      })),
    );

    const plan = await supabaseAdmin
      .from("plans")
      .select("id, trial_days")
      .eq("code", "BASIC")
      .maybeSingle();
    if (plan.error || !plan.data) {
      throw new Error(
        `TRIAL_PLAN_NOT_FOUND: ${plan.error?.message ?? "plano BASIC não encontrado"}`,
      );
    }
    const periodStart = new Date();
    const trialEnd = new Date(periodStart.getTime() + 30 * 86400000);
    const subscription = await supabaseAdmin.from("subscriptions").insert({
      business_id: businessId,
      plan_id: plan.data.id,
      status: "TRIALING",
      billing_interval: "MONTHLY",
      current_period_start: periodStart.toISOString(),
      current_period_end: trialEnd.toISOString(),
      trial_ends_at: trialEnd.toISOString(),
    });
    if (subscription.error) {
      throw new Error(`TRIAL_CREATE_FAILED: ${subscription.error.message}`);
    }

    const professional = await supabaseAdmin
      .from("professionals")
      .insert({ business_id: businessId, user_id: userId, name: data.ownerName, active: true })
      .select("id")
      .single();

    const config = businessTypeConfig(data.businessType);
    const services = await supabaseAdmin
      .from("services")
      .insert(
        config.sampleServices.map((s) => ({
          business_id: businessId,
          name: s.name,
          category: s.category,
          duration_minutes: s.duration_minutes,
          price_cents: s.price_cents,
        })),
      )
      .select("id");

    if (professional.data && services.data) {
      await supabaseAdmin.from("professional_hours").insert(
        [1, 2, 3, 4, 5, 6].map((weekday) => ({
          professional_id: professional.data.id,
          business_id: businessId,
          weekday,
          starts_at: "09:00",
          ends_at: weekday === 6 ? "14:00" : "19:00",
          enabled: true,
        })),
      );
      await supabaseAdmin.from("professional_services").insert(
        services.data.map((s) => ({
          professional_id: professional.data.id,
          service_id: s.id,
          business_id: businessId,
        })),
      );
    }

    await supabaseAdmin.from("audit_logs").insert({
      business_id: businessId,
      actor_user_id: userId,
      action: "business.created",
      entity: "business",
      entity_id: businessId,
      data: { slug, business_type: data.businessType },
    });

    return { businessId, slug: business.data.slug, alreadyProvisioned: false as const };
  });
