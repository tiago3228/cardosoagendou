import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
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
        segments: [],
        services: [],
        products: [],
        professionals: [],
        links: [],
        businessHours: [],
        professionalHours: [],
        serviceCompositions: [],
        serviceConflicts: [],
        acceptsBookings: false as const,
      };
    }
    const catalog = await loadPublicCatalogBySlug(db, data.slug);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: serviceCompositions } = await (supabaseAdmin as unknown as SupabaseClient)
      .from("service_compositions")
      .select("composite_service_id, component_service_id")
      .eq("business_id", found.id);
    return {
      business,
      ...catalog,
      serviceCompositions: serviceCompositions ?? [],
      acceptsBookings: true as const,
    };
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
    let coupon: {
      id: string;
      discount_percent: number;
      usage_limit: number | null;
      single_use_per_client: boolean;
    } | null = null;
    if (data.couponCode?.trim()) {
      const code = data.couponCode.trim().toUpperCase();
      const { data: foundCoupon, error: couponError } = await supabaseAdmin
        .from("coupons")
        .select(
          "id, discount_percent, starts_at, expires_at, active, usage_limit, single_use_per_client",
        )
        .eq("business_id", business.id)
        .eq("code", code)
        .maybeSingle();
      if (couponError || !foundCoupon) throw new Error("COUPON_INVALID: cupom não encontrado");
      const today = new Date().toISOString().slice(0, 10);
      if (
        !foundCoupon.active ||
        foundCoupon.starts_at > today ||
        (foundCoupon.expires_at && foundCoupon.expires_at < today)
      )
        throw new Error("COUPON_INVALID: cupom fora da validade ou inativo");
      const { count } = await supabaseAdmin
        .from("coupon_usages")
        .select("id", { count: "exact", head: true })
        .eq("business_id", business.id)
        .eq("coupon_id", foundCoupon.id);
      if (foundCoupon.usage_limit !== null && (count ?? 0) >= foundCoupon.usage_limit)
        throw new Error("COUPON_INVALID: limite de utilizações atingido");
      coupon = foundCoupon;
    }
    const manageToken = crypto.randomUUID() + crypto.randomUUID();

    let bookingRpc = await supabaseAdmin.rpc("create_appointment_atomic_with_products", {
      _business_id: business.id,
      _professional_id: data.professionalId,
      _service_ids: data.serviceIds,
      _product_ids: data.productIds.flatMap((id) =>
        Array.from({ length: data.productQuantities[id] ?? 1 }, () => id),
      ),
      _starts_at: startsAt.toISOString(),
      _client_name: data.clientName,
      _client_whatsapp: whatsapp,
      _status: "PENDING",
      ...(data.notes ? { _notes: data.notes } : {}),
      _source: "public_booking",
      ...(data.idempotencyKey ? { _idempotency_key: data.idempotencyKey } : {}),
      _policy_accepted: data.policyAccepted,
      ...(business.booking_policy ? { _policy_text: business.booking_policy } : {}),
      _manage_token: manageToken,
    });
    const missingProductsRpc =
      bookingRpc.error &&
      (bookingRpc.error.message.includes(
        "Could not find the function public.create_appointment_atomic_with_products",
      ) ||
        bookingRpc.error.message.includes(
          "function public.create_appointment_atomic_with_products",
        ));
    if (missingProductsRpc) {
      if (data.productIds.length > 0) {
        throw new Error(
          "BOOKING_MIGRATION_REQUIRED: o banco ainda não recebeu a migration de produtos e agendamentos",
        );
      }
      bookingRpc = await supabaseAdmin.rpc("create_appointment_atomic", {
        _business_id: business.id,
        _professional_id: data.professionalId,
        _service_ids: data.serviceIds,
        _starts_at: startsAt.toISOString(),
        _client_name: data.clientName,
        _client_whatsapp: whatsapp,
        _status: "PENDING",
        ...(data.notes ? { _notes: data.notes } : {}),
        _source: "public_booking",
        ...(data.idempotencyKey ? { _idempotency_key: data.idempotencyKey } : {}),
        _policy_accepted: data.policyAccepted,
        ...(business.booking_policy ? { _policy_text: business.booking_policy } : {}),
        _manage_token: manageToken,
      });
    }
    const { data: created, error } = bookingRpc;
    if (error || !created) {
      const message = error?.message ?? "";
      if (message.includes("DOUBLE_BOOKING")) {
        throw new Error("SLOT_UNAVAILABLE: esse horário acabou de ser reservado");
      }
      if (message.includes("SERVICE_COMPOSITION_CONFLICT")) {
        throw new Error("SERVICE_COMPOSITION_CONFLICT");
      }
      if (
        message.includes("Could not find the function public.create_appointment_atomic") ||
        message.includes(
          "Could not find the function public.create_appointment_atomic_with_products",
        )
      ) {
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
    if (coupon) {
      const { data: appointment } = await supabaseAdmin
        .from("appointments")
        .select("client_id")
        .eq("id", result.id)
        .maybeSingle();
      const clientId = appointment?.client_id ?? null;
      if (coupon.single_use_per_client && clientId) {
        const { count } = await supabaseAdmin
          .from("coupon_usages")
          .select("id", { count: "exact", head: true })
          .eq("business_id", business.id)
          .eq("coupon_id", coupon.id)
          .eq("client_id", clientId);
        if ((count ?? 0) > 0)
          throw new Error("COUPON_INVALID: cupom já utilizado por este cliente");
      }
      const original = result.total_price_cents;
      const discount = Math.floor((original * coupon.discount_percent) / 100);
      const finalAmount = Math.max(0, original - discount);
      const update = await supabaseAdmin
        .from("appointments")
        .update({ total_price_cents: finalAmount })
        .eq("id", result.id);
      if (update.error) throw new Error(`COUPON_FAILED: ${update.error.message}`);
      const usage = await supabaseAdmin.from("coupon_usages").insert({
        business_id: business.id,
        coupon_id: coupon.id,
        client_id: clientId,
        appointment_id: result.id,
        discount_percent: coupon.discount_percent,
        original_amount_cents: original,
        discount_amount_cents: discount,
        final_amount_cents: finalAmount,
      });
      if (usage.error) throw new Error(`COUPON_FAILED: ${usage.error.message}`);
      result.total_price_cents = finalAmount;
    }
    // Keep the server-side calculation explicit so future callers cannot mistake client totals for authority.
    void selection;
    return {
      id: result.id,
      startsAt: result.starts_at,
      endsAt: result.ends_at,
      durationMinutes: result.duration_minutes,
      totalPriceCents: result.total_price_cents,
      manageToken,
      productIds: data.productIds,
    };
  });
