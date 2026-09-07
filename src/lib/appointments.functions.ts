import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  appointmentStatusSchema,
  availabilitySchema,
  manualAppointmentSchema,
  rescheduleSchema,
} from "./schemas";

/**
 * Moves an appointment through the status state machine.
 * COMPLETED also books the service income and the professional commission.
 */
export const setAppointmentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => appointmentStatusSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { canTransition } = await import("./schemas");
    const { logAudit } = await import("./subscription.server");

    const current = await context.supabase
      .from("appointments")
      .select("id, business_id, professional_id, status, total_price_cents, starts_at")
      .eq("id", data.appointmentId)
      .maybeSingle();
    if (!current.data) throw new Error("APPOINTMENT_NOT_FOUND: agendamento não encontrado");
    if (current.data.status === data.status) return { status: data.status, changed: false as const };
    if (!canTransition(current.data.status, data.status)) {
      throw new Error(
        `INVALID_TRANSITION: não é possível mudar de ${current.data.status} para ${data.status}`,
      );
    }

    const update = await context.supabase
      .from("appointments")
      .update({
        status: data.status,
        cancel_reason: data.status === "CANCELED" ? (data.reason ?? null) : null,
      })
      .eq("id", data.appointmentId)
      .select("id, status")
      .single();
    if (update.error) throw new Error(`STATUS_UPDATE_FAILED: ${update.error.message}`);

    if (data.status === "COMPLETED") {
      const professional = await context.supabase
        .from("professionals")
        .select("commission_percent")
        .eq("id", current.data.professional_id)
        .maybeSingle();
      const commission = Math.round(
        (current.data.total_price_cents * Number(professional.data?.commission_percent ?? 0)) / 100,
      );
      const rows = [
        {
          business_id: current.data.business_id,
          type: "SERVICE_INCOME" as const,
          amount_cents: current.data.total_price_cents,
          description: "Atendimento concluído",
          appointment_id: current.data.id,
          professional_id: current.data.professional_id,
        },
        ...(commission > 0
          ? [
              {
                business_id: current.data.business_id,
                type: "COMMISSION" as const,
                amount_cents: commission,
                description: "Comissão do profissional",
                appointment_id: current.data.id,
                professional_id: current.data.professional_id,
              },
            ]
          : []),
      ];
      await context.supabase.from("transactions").insert(rows);
    }

    await logAudit(
      context.supabase,
      current.data.business_id,
      context.userId,
      `appointment.${data.status.toLowerCase()}`,
      "appointment",
      current.data.id,
      { from: current.data.status },
    );

    return { status: data.status, changed: true as const };
  });

/** Moves an appointment to a new time (and optionally professional). */
export const rescheduleAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => rescheduleSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { logAudit } = await import("./subscription.server");

    const current = await context.supabase
      .from("appointments")
      .select("id, business_id, professional_id, duration_minutes, status")
      .eq("id", data.appointmentId)
      .maybeSingle();
    if (!current.data) throw new Error("APPOINTMENT_NOT_FOUND");
    if (["COMPLETED", "CANCELED", "NO_SHOW"].includes(current.data.status)) {
      throw new Error("INVALID_TRANSITION: agendamentos finalizados não podem ser remarcados");
    }

    const startsAt = new Date(data.startsAt);
    const endsAt = new Date(startsAt.getTime() + current.data.duration_minutes * 60000);
    const update = await context.supabase
      .from("appointments")
      .update({
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        professional_id: data.professionalId ?? current.data.professional_id,
      })
      .eq("id", data.appointmentId)
      .select("id, starts_at, ends_at")
      .single();

    if (update.error) {
      if (update.error.message.includes("DOUBLE_BOOKING")) {
        throw new Error("SLOT_UNAVAILABLE: o profissional já tem um atendimento nesse horário");
      }
      throw new Error(`RESCHEDULE_FAILED: ${update.error.message}`);
    }

    await logAudit(context.supabase, current.data.business_id, context.userId, "appointment.rescheduled", "appointment", current.data.id, {
      starts_at: update.data.starts_at,
    });
    return { startsAt: update.data.starts_at, endsAt: update.data.ends_at };
  });

/** Creates an appointment from inside the panel (walk-in / phone booking). */
export const createManualAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => manualAppointmentSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { resolveSelection } = await import("./booking.server");
    const { normalizeBrWhatsapp } = await import("./format");
    const { logAudit } = await import("./subscription.server");

    const member = await context.supabase
      .from("user_roles")
      .select("business_id")
      .eq("user_id", context.userId)
      .eq("business_id", data.businessId)
      .maybeSingle();
    if (!member.data) throw new Error("FORBIDDEN: sem acesso a este negócio");

    const whatsapp = normalizeBrWhatsapp(data.whatsapp);
    if (!whatsapp) throw new Error("WHATSAPP_INVALID: WhatsApp inválido");

    await resolveSelection(context.supabase, data.businessId, data.serviceIds);
    const startsAt = new Date(data.startsAt);

    const { data: created, error: appointmentError } = await context.supabase.rpc(
      "create_appointment_atomic_with_products",
      {
        _business_id: data.businessId,
        _professional_id: data.professionalId,
        _service_ids: data.serviceIds,
        _product_ids: [],
        _starts_at: startsAt.toISOString(),
        _client_name: data.clientName,
        _client_whatsapp: whatsapp,
        _status: "CONFIRMED",
        _source: "panel",
        ...(data.notes ? { _notes: data.notes } : {}),
      },
    );

    if (appointmentError || !created) {
      const message = appointmentError?.message ?? "";
      if (message.includes("DOUBLE_BOOKING")) {
        throw new Error("SLOT_UNAVAILABLE: o profissional já tem um atendimento nesse horário");
      }
      if (message.includes("SERVICE_COMPOSITION_CONFLICT")) {
        throw new Error("SERVICE_COMPOSITION_CONFLICT");
      }
      throw new Error(`APPOINTMENT_FAILED: ${message}`);
    }
    const result = created as {
      id: string;
      starts_at: string;
      ends_at: string;
      duration_minutes: number;
      total_price_cents: number;
    };
    await logAudit(context.supabase, data.businessId, context.userId, "appointment.created_manual", "appointment", result.id, {});

    return {
      id: result.id,
      startsAt: result.starts_at,
      endsAt: result.ends_at,
      durationMinutes: result.duration_minutes,
      totalPriceCents: result.total_price_cents,
    };
  });

/** Panel-side availability (uses the same engine as the public page). */
export const getPanelAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => availabilitySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { loadBusinessBySlug, availabilityForDay } = await import("./booking.server");
    const business = await loadBusinessBySlug(context.supabase, data.slug);
    if (!business) throw new Error("BUSINESS_NOT_FOUND");
    return availabilityForDay(
      context.supabase,
      business,
      data.serviceIds,
      data.date,
      data.professionalId ?? null,
      new Date(),
    );
  });
