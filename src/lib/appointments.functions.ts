import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  appointmentStatusSchema,
  availabilitySchema,
  manualAppointmentSchema,
  rescheduleSchema,
} from "./schemas";

export const setAppointmentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => appointmentStatusSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { canTransition } = await import("./schemas");
    const { logAudit } = await import("./subscription.server");
    const current = await context.supabase
      .from("appointments")
      .select(
        "id, business_id, professional_id, status, total_price_cents, starts_at, client_name, client_whatsapp",
      )
      .eq("id", data.appointmentId)
      .maybeSingle();
    if (!current.data) throw new Error("APPOINTMENT_NOT_FOUND: agendamento não encontrado");
    if (current.data.status === data.status)
      return { status: data.status, changed: false as const };
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

    if (data.status === "CONFIRMED") {
      const queued = await context.supabase.rpc("enqueue_message", {
        _business_id: current.data.business_id,
        _appointment_id: current.data.id,
        _event_type: "APPOINTMENT_CONFIRMED",
        _recipient: current.data.client_whatsapp,
        _payload: {
          appointment_id: current.data.id,
          business_id: current.data.business_id,
          client_name: current.data.client_name,
          starts_at: current.data.starts_at,
        },
        _dedupe_key: `confirmed:${current.data.id}`,
      });
      if (queued.error) throw new Error(`NOTIFICATION_QUEUE_FAILED: ${queued.error.message}`);
    }

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
      const financial = await context.supabase.from("transactions").insert(rows);
      // Transactions are an optional reports feature. A missing feature/RLS access
      // must not turn an already completed appointment into a visible error.
      if (financial.error && !["23505", "42501"].includes(financial.error.code ?? "")) {
        throw new Error(`FINANCIAL_UPDATE_FAILED: ${financial.error.message}`);
      }
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

export const rescheduleAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => rescheduleSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { loadBusinessById, assertBookableAppointment } = await import("./booking.server");
    const { logAudit } = await import("./subscription.server");
    const current = await context.supabase
      .from("appointments")
      .select("id, business_id, professional_id, status")
      .eq("id", data.appointmentId)
      .maybeSingle();
    if (!current.data) throw new Error("APPOINTMENT_NOT_FOUND");
    if (["COMPLETED", "CANCELED", "NO_SHOW"].includes(current.data.status)) {
      throw new Error("INVALID_TRANSITION: agendamentos finalizados não podem ser remarcados");
    }
    const services = await context.supabase
      .from("appointment_services")
      .select("service_id")
      .eq("appointment_id", data.appointmentId)
      .not("service_id", "is", null);
    const serviceIds = (services.data ?? [])
      .map((row) => row.service_id)
      .filter((id): id is string => Boolean(id));
    const business = await loadBusinessById(context.supabase, current.data.business_id);
    if (!business) throw new Error("BUSINESS_NOT_FOUND");
    const professionalId = data.professionalId ?? current.data.professional_id;
    const startsAt = new Date(data.startsAt);
    const selection = await assertBookableAppointment(context.supabase, business, {
      professionalId,
      serviceIds,
      startsAt,
      now: new Date(),
      excludeAppointmentId: data.appointmentId,
    });
    const endsAt = new Date(startsAt.getTime() + selection.durationMinutes * 60000);
    const update = await context.supabase
      .from("appointments")
      .update({
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        professional_id: professionalId,
        duration_minutes: selection.durationMinutes,
        total_price_cents: selection.priceCents,
        blocks_agenda: selection.blocksAgenda,
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
    await logAudit(
      context.supabase,
      current.data.business_id,
      context.userId,
      "appointment.rescheduled",
      "appointment",
      current.data.id,
      {
        starts_at: update.data.starts_at,
        professional_id: professionalId,
      },
    );
    return { startsAt: update.data.starts_at, endsAt: update.data.ends_at };
  });

export const createManualAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => manualAppointmentSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { loadBusinessById, assertBookableAppointment } = await import("./booking.server");
    const { normalizeBrWhatsapp } = await import("./format");
    const { logAudit } = await import("./subscription.server");
    const member = await context.supabase
      .from("user_roles")
      .select("business_id")
      .eq("user_id", context.userId)
      .eq("business_id", data.businessId)
      .maybeSingle();
    if (!member.data) throw new Error("FORBIDDEN: sem acesso a este negócio");
    const business = await loadBusinessById(context.supabase, data.businessId);
    if (!business) throw new Error("BUSINESS_NOT_FOUND");
    const whatsapp = normalizeBrWhatsapp(data.whatsapp);
    if (!whatsapp) throw new Error("WHATSAPP_INVALID: WhatsApp inválido");
    const startsAt = new Date(data.startsAt);
    await assertBookableAppointment(context.supabase, business, {
      professionalId: data.professionalId,
      serviceIds: data.serviceIds,
      startsAt,
      now: new Date(),
    });
    const { data: created, error } = await context.supabase.rpc("create_appointment_atomic", {
      _business_id: data.businessId,
      _professional_id: data.professionalId,
      _service_ids: data.serviceIds,
      _starts_at: startsAt.toISOString(),
      _client_name: data.clientName,
      _client_whatsapp: whatsapp,
      _status: "CONFIRMED",
      _notes: data.notes ?? null,
      _source: "panel",
      _idempotency_key: data.idempotencyKey ?? null,
    });
    if (error || !created) {
      if (error?.message.includes("DOUBLE_BOOKING")) {
        throw new Error("SLOT_UNAVAILABLE: o profissional já tem um atendimento nesse horário");
      }
      throw new Error(`APPOINTMENT_FAILED: ${error?.message ?? "operação recusada"}`);
    }
    const result = created as {
      id: string;
      starts_at: string;
      ends_at: string;
      duration_minutes: number;
      total_price_cents: number;
    };
    await logAudit(
      context.supabase,
      data.businessId,
      context.userId,
      "appointment.created_manual",
      "appointment",
      result.id,
      {},
    );
    return {
      id: result.id,
      startsAt: result.starts_at,
      endsAt: result.ends_at,
      durationMinutes: result.duration_minutes,
      totalPriceCents: result.total_price_cents,
    };
  });

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
