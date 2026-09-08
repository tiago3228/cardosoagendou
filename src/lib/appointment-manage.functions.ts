import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const tokenSchema = z.object({ token: z.string().trim().min(32).max(100) });
const presenceSchema = tokenSchema.extend({ presence: z.enum(["CONFIRMED", "DECLINED"]) });
const rescheduleByTokenSchema = tokenSchema.extend({
  professionalId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
});

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export const getAppointmentByManageToken = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => tokenSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: appointment, error } = await supabaseAdmin.rpc("appointment_manage_by_token", {
      _token_hash: hashToken(data.token),
    });
    if (error) throw new Error(`MANAGE_LINK_FAILED: ${error.message}`);
    const managedAppointment = appointment as {
      id: string;
      business_id: string;
      business_name: string;
      business_slug: string;
      client_name: string;
      starts_at: string;
      ends_at: string;
      status: string;
      presence_status: string | null;
      allow_cancel: boolean;
      allow_reschedule: boolean;
    } | null;
    if (!managedAppointment) return null;

    const { data: business, error: businessError } = await supabaseAdmin
      .from("businesses")
      .select("primary_color, secondary_color")
      .eq("id", managedAppointment.business_id)
      .single();
    if (businessError) throw new Error(`MANAGE_THEME_FAILED: ${businessError.message}`);

    return {
      ...managedAppointment,
      primary_color: business.primary_color,
      secondary_color: business.secondary_color,
    };
  });

export const confirmAppointmentPresence = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => presenceSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("appointment_presence_by_token", {
      _token_hash: hashToken(data.token),
      _presence: data.presence,
    });
    if (error) throw new Error(`PRESENCE_FAILED: ${error.message}`);
    return result;
  });

export const cancelAppointmentByManageToken = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => tokenSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("appointment_cancel_by_token", {
      _token_hash: hashToken(data.token),
    });
    if (error) throw new Error(`CANCEL_FAILED: ${error.message}`);
    return result;
  });

export const rescheduleAppointmentByManageToken = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => rescheduleByTokenSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadBusinessById, assertBookableAppointment } = await import("./booking.server");
    const tokenHash = hashToken(data.token);
    const { data: appointment, error: lookupError } = await supabaseAdmin.rpc(
      "appointment_manage_by_token",
      { _token_hash: tokenHash },
    );
    if (lookupError) throw new Error(`MANAGE_LINK_FAILED: ${lookupError.message}`);
    const current = appointment as {
      business_id: string;
      service_ids: string[];
      status: string;
      allow_reschedule: boolean;
    } | null;
    if (!current) throw new Error("MANAGE_LINK_INVALID");
    if (!current.allow_reschedule || !["PENDING", "CONFIRMED"].includes(current.status)) {
      throw new Error("APPOINTMENT_NOT_RESCHEDULABLE");
    }
    const business = await loadBusinessById(supabaseAdmin, current.business_id);
    if (!business) throw new Error("BUSINESS_NOT_FOUND");
    await assertBookableAppointment(supabaseAdmin, business, {
      professionalId: data.professionalId,
      serviceIds: current.service_ids,
      startsAt: new Date(data.startsAt),
      now: new Date(),
    });
    const manageToken = crypto.randomUUID() + crypto.randomUUID();
    const { data: result, error } = await supabaseAdmin.rpc("reschedule_appointment_by_token", {
      _token_hash: tokenHash,
      _professional_id: data.professionalId,
      _starts_at: data.startsAt,
      _manage_token: manageToken,
    });
    if (error) {
      if (error.message.includes("DOUBLE_BOOKING")) {
        throw new Error("SLOT_UNAVAILABLE: o horário escolhido não está mais disponível");
      }
      throw new Error(`RESCHEDULE_FAILED: ${error.message}`);
    }
    const row = result as { starts_at: string; ends_at: string; total_price_cents: number };
    return {
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      totalPriceCents: Number(row.total_price_cents),
      manageToken,
    };
  });
