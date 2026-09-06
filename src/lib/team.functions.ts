import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inviteSchema = z.object({
  professionalId: z.string().uuid(),
  email: z.string().trim().email("E-mail inválido").max(160),
});

/**
 * Creates a login invite that links a staff member's future account to their
 * professional record — this is what makes the "professional" role functional.
 * Only the business owner can invite, and only for their own professionals.
 */
export const inviteProfessional = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inviteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { requireOwnedBusinessId, logAudit } = await import("./subscription.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const businessId = await requireOwnedBusinessId(context.supabase, context.userId);

    const professional = await supabaseAdmin
      .from("professionals")
      .select("id, name, user_id")
      .eq("id", data.professionalId)
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!professional.data) throw new Error("PROFESSIONAL_NOT_FOUND");
    if (professional.data.user_id)
      throw new Error("ALREADY_LINKED: este profissional já tem acesso");

    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();

    const invite = await supabaseAdmin
      .from("professional_invites")
      .insert({
        business_id: businessId,
        professional_id: data.professionalId,
        email: data.email,
        token,
        status: "PENDING",
        invited_by: context.userId,
        expires_at: expiresAt,
      })
      .select("id")
      .single();
    if (invite.error) throw new Error(`INVITE_FAILED: ${invite.error.message}`);

    await logAudit(
      supabaseAdmin,
      businessId,
      context.userId,
      "professional.invited",
      "professional",
      data.professionalId,
      { email: data.email },
    );

    const origin = process.env["APP_ORIGIN"] ?? "";
    return {
      token,
      expiresAt,
      inviteUrl: `${origin}/convite/${token}`,
      professionalName: professional.data.name,
    };
  });

/** Pending invites for the owner's team screen. */
export const listProfessionalInvites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireOwnedBusinessId } = await import("./subscription.server");
    const businessId = await requireOwnedBusinessId(context.supabase, context.userId);
    const { data } = await context.supabase
      .from("professional_invites")
      .select("id, professional_id, email, status, expires_at, accepted_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const revokeProfessionalInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ inviteId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { requireOwnedBusinessId } = await import("./subscription.server");
    const businessId = await requireOwnedBusinessId(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("professional_invites")
      .update({ status: "REVOKED" })
      .eq("id", data.inviteId)
      .eq("business_id", businessId)
      .eq("status", "PENDING");
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * Accepts an invite for the signed-in user. The database function validates the
 * token, links `professionals.user_id`, grants the professional role and marks
 * the invite consumed — all in one transaction.
 */
export const acceptProfessionalInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        token: z.string().trim().min(20).max(120),
        fullName: z.string().trim().min(2).max(80),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error, data: result } = await context.supabase.rpc("accept_professional_invite", {
      _token: data.token,
      _full_name: data.fullName,
    });
    if (error) {
      if (error.message.includes("INVITE_INVALID")) {
        throw new Error("INVITE_INVALID: convite inválido ou expirado");
      }
      throw new Error(error.message);
    }
    return result as { business_id: string; professional_id: string };
  });
