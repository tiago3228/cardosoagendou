import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { availabilitySchema, publicBookingSchema } from "./schemas";

/** Public booking page data: business branding, services, professionals, hours. */
export const getPublicBusiness = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ slug: z.string().min(1).max(60) }).parse(input))
  .handler(async ({ data }) => {
    const { publicDb } = await import("./supabase-public.server");
    const { loadPublicBusinessBySlug, loadPublicCatalogBySlug } = await import("./booking.server");
    const db = publicDb();
    const found = await loadPublicBusinessBySlug(db, data.slug);
    if (!found) return null;
    const { accepts_bookings: acceptsBookings, ...business } = found;
    if (acceptsBookings !== true) {
      return {
        business,
        services: [],
        products: [],
        professionals: [],
        links: [],
        businessHours: [],
        professionalHours: [],
        serviceConflicts: [],
        acceptsBookings: false as const,
      };
    }
    const catalog = await loadPublicCatalogBySlug(db, data.slug);
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

/** Creates an appointment from the public page using the same server validation and an atomic RPC. */
export const createPublicAppointment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => publicBookingSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadBusinessBySlug, assertBookableAppointment } = await import("./booking.server");
    const { normalizeBrWhatsapp } = await import("./format");
    const { assertAcceptsBookings } = await import("./billing.server");

    const business = await loadBusinessBySlug(supabaseAdmin, data.slug);
    if (!business) throw new Error("BUSINESS_NOT_FOUND");
    await assertAcceptsBookings(supabaseAdmin, business.id);

    const whatsapp = normalizeBrWhatsapp(data.whatsapp);
    if (!whatsapp) throw new Error("WHATSAPP_INVALID: WhatsApp inválido");
    const startsAt = new Date(data.startsAt);
    const selection = await assertBookableAppointment(supabaseAdmin, business, {
      professionalId: data.professionalId,
      serviceIds: data.serviceIds,
      startsAt,
      now: new Date(),
    });

    const { data: created, error } = await supabaseAdmin.rpc("create_appointment_atomic", {
      _business_id: business.id,
      _professional_id: data.professionalId,
      _service_ids: data.serviceIds,
      _starts_at: startsAt.toISOString(),
      _client_name: data.clientName,
      _client_whatsapp: whatsapp,
      _status: "PENDING",
      _notes: data.notes ?? null,
      _source: "public_booking",
      _idempotency_key: data.idempotencyKey ?? null,
    });
    if (error || !created) {
      const message = error?.message ?? "";
      if (message.includes("DOUBLE_BOOKING")) {
        throw new Error("SLOT_UNAVAILABLE: esse horário acabou de ser reservado");
      }
      if (message.includes("Could not find the function public.create_appointment_atomic")) {
        throw new Error(
          "BOOKING_MIGRATION_REQUIRED: o banco ainda não recebeu a migration de integridade de agendamentos",
        );
      }
      throw new Error(`APPOINTMENT_FAILED: ${message}`);
    }

    const result = created as {
      id: string;
      starts_at: string;
      ends_at: string;
      total_price_cents: number;
      duration_minutes: number;
      blocks_agenda: boolean;
    };
    // Keep the server-side calculation explicit so future callers cannot mistake client totals for authority.
    void selection;
    return {
      id: result.id,
      startsAt: result.starts_at,
      endsAt: result.ends_at,
      durationMinutes: result.duration_minutes,
      totalPriceCents: result.total_price_cents,
    };
  });
