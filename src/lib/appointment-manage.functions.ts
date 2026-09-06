import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const tokenSchema = z.object({ token: z.string().trim().min(32).max(100) });
const presenceSchema = tokenSchema.extend({ presence: z.enum(["CONFIRMED", "DECLINED"]) });

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
    return appointment as {
      id: string;
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
