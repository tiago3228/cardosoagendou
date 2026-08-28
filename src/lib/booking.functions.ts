import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { availabilitySchema, publicBookingSchema } from "./schemas";

/** Public booking page data: business branding, services, professionals, hours. */
export const getPublicBusiness = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ slug: z.string().min(1).max(60) }).parse(input))
  .handler(async ({ data }) => {
    const { publicDb } = await import("./supabase-public.server");
    const { loadBusinessBySlug, loadPublicCatalog } = await import("./booking.server");
    const db = publicDb();
    const business = await loadBusinessBySlug(db, data.slug);
    if (!business) return null;

    // Entitlement gate: a blocked/suspended business shows the page but no slots.
    const { data: acceptsBookings } = await db.rpc("business_accepts_bookings", {
      _business_id: business.id,
    });
    if (acceptsBookings !== true) {
      return { business, services: [], professionals: [], links: [], businessHours: [], professionalHours: [], acceptsBookings: false as const };
    }

    const catalog = await loadPublicCatalog(db, business.id);
    return { business, ...catalog, acceptsBookings: true as const };
  });

/** Time slots for a day, computed from the SUM of the selected services' durations. */
export const getAvailability = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => availabilitySchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadBusinessBySlug, availabilityForDay } = await import("./booking.server");
    const { assertAcceptsBookings } = await import("./billing.server");
    const business = await loadBusinessBySlug(supabaseAdmin, data.slug);
    if (!business) throw new Error("BUSINESS_NOT_FOUND");
    await assertAcceptsBookings(supabaseAdmin, business.id);
    return availabilityForDay(
      supabaseAdmin,
      business,
      data.serviceIds,
      data.date,
      data.professionalId ?? null,
      new Date(),
    );
  });

/** Creates an appointment from the public page. Duration/price are recomputed server-side. */
export const createPublicAppointment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => publicBookingSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadBusinessBySlug, resolveSelection, availabilityForDay } = await import("./booking.server");
    const { normalizeBrWhatsapp } = await import("./format");
    const { localDateOf } = await import("./availability");
    const { assertAcceptsBookings } = await import("./billing.server");

    const business = await loadBusinessBySlug(supabaseAdmin, data.slug);
    if (!business) throw new Error("BUSINESS_NOT_FOUND");
    // Blocked subscriptions cannot receive new bookings.
    await assertAcceptsBookings(supabaseAdmin, business.id);

    const whatsapp = normalizeBrWhatsapp(data.whatsapp);
    if (!whatsapp) throw new Error("WHATSAPP_INVALID: WhatsApp inválido");

    const selection = await resolveSelection(supabaseAdmin, business.id, data.serviceIds);
    const startsAt = new Date(data.startsAt);
    const endsAt = new Date(startsAt.getTime() + selection.durationMinutes * 60000);

    // Re-validate the slot against the engine so a stale page cannot book a taken time.
    const day = localDateOf(startsAt, business.timezone);
    const availability = await availabilityForDay(
      supabaseAdmin,
      business,
      data.serviceIds,
      day,
      data.professionalId,
      new Date(),
    );
    const offered = availability.byProfessional
      .find((p) => p.professionalId === data.professionalId)
      ?.slots.some((s) => s.startsAt === startsAt.toISOString());
    if (!offered) throw new Error("SLOT_UNAVAILABLE: esse horário não está mais disponível");

    const client = await supabaseAdmin
      .from("clients")
      .upsert(
        { business_id: business.id, name: data.clientName, whatsapp },
        { onConflict: "business_id,whatsapp" },
      )
      .select("id")
      .single();

    const appointment = await supabaseAdmin
      .from("appointments")
      .insert({
        business_id: business.id,
        professional_id: data.professionalId,
        client_id: client.data?.id ?? null,
        client_name: data.clientName,
        client_whatsapp: whatsapp,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        duration_minutes: selection.durationMinutes,
        total_price_cents: selection.priceCents,
        status: "PENDING",
        notes: data.notes ?? null,
        snapshot: {
          source: "public_booking",
          services: selection.services,
          business_name: business.name,
        },
      })
      .select("id, starts_at, ends_at, total_price_cents, duration_minutes")
      .single();

    if (appointment.error || !appointment.data) {
      const message = appointment.error?.message ?? "";
      if (message.includes("DOUBLE_BOOKING")) {
        throw new Error("SLOT_UNAVAILABLE: esse horário acabou de ser reservado");
      }
      throw new Error(`APPOINTMENT_FAILED: ${message}`);
    }

    await supabaseAdmin.from("appointment_services").insert(
      selection.services.map((s) => ({
        appointment_id: appointment.data.id,
        business_id: business.id,
        service_id: s.id,
        service_name: s.name,
        price_cents: s.price_cents,
        duration_minutes: s.duration_minutes,
      })),
    );

    await supabaseAdmin.from("notifications").insert([
      {
        business_id: business.id,
        appointment_id: appointment.data.id,
        recipient: whatsapp,
        template: "appointment.created.client",
        payload: { name: data.clientName, starts_at: appointment.data.starts_at },
      },
      ...(business.whatsapp
        ? [
            {
              business_id: business.id,
              appointment_id: appointment.data.id,
              recipient: business.whatsapp,
              template: "appointment.created.business",
              payload: { client: data.clientName, starts_at: appointment.data.starts_at },
            },
          ]
        : []),
    ]);

    return {
      id: appointment.data.id,
      startsAt: appointment.data.starts_at,
      endsAt: appointment.data.ends_at,
      durationMinutes: appointment.data.duration_minutes,
      totalPriceCents: appointment.data.total_price_cents,
    };
  });
