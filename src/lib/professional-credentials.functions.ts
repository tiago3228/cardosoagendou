import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const credentialSchema = z.object({
  professionalId: z.string().uuid(),
  username: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/, "Usuário inválido"),
  password: z.string().min(1).max(200),
});

function aliasEmail(username: string) {
  return `${username.toLowerCase()}@login.agendou.local`;
}

export const saveProfessionalCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => credentialSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { requireOwnedBusinessId } = await import("./subscription.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const businessId = await requireOwnedBusinessId(context.supabase, context.userId);
    const username = data.username.toLowerCase();

    const professional = await supabaseAdmin
      .from("professionals")
      .select("id, name, user_id")
      .eq("id", data.professionalId)
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!professional.data) throw new Error("PROFESSIONAL_NOT_FOUND");

    const duplicate = await supabaseAdmin
      .from("professionals")
      .select("id")
      .ilike("login_username", username)
      .neq("id", data.professionalId)
      .is("deleted_at", null)
      .maybeSingle();
    if (duplicate.data) throw new Error("USERNAME_ALREADY_EXISTS");

    let userId = professional.data.user_id;
    if (userId) {
      const updated = await supabaseAdmin.auth.admin.updateUserById(userId, {
        email: aliasEmail(username),
        password: data.password,
        email_confirm: true,
        user_metadata: { login_username: username, business_id: businessId },
      });
      if (updated.error) throw new Error(updated.error.message);
    } else {
      const created = await supabaseAdmin.auth.admin.createUser({
        email: aliasEmail(username),
        password: data.password,
        email_confirm: true,
        user_metadata: { login_username: username, business_id: businessId },
      });
      if (created.error || !created.data.user) {
        throw new Error(created.error?.message ?? "CREDENTIALS_CREATE_FAILED");
      }
      userId = created.data.user.id;
    }

    const update = await supabaseAdmin
      .from("professionals")
      .update({ user_id: userId, login_username: username })
      .eq("id", data.professionalId)
      .eq("business_id", businessId);
    if (update.error) throw new Error(update.error.message);

    const existingRole = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("business_id", businessId)
      .eq("role", "professional")
      .maybeSingle();
    if (existingRole.error) throw new Error(existingRole.error.message);
    if (!existingRole.data) {
      const role = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: userId, business_id: businessId, role: "professional" });
      if (role.error) throw new Error(role.error.message);
    }
    const profile = await supabaseAdmin
      .from("profiles")
      .upsert({ id: userId, full_name: professional.data.name }, { onConflict: "id" });
    if (profile.error) throw new Error(profile.error.message);

    return { ok: true as const, username, professionalName: professional.data.name };
  });

export const resolveProfessionalLogin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ username: z.string().trim().min(1).max(80) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await supabaseAdmin
      .from("professionals")
      .select("login_username")
      .ilike("login_username", data.username.toLowerCase())
      .eq("active", true)
      .is("deleted_at", null)
      .maybeSingle();
    if (result.error || !result.data?.login_username) return { email: null };
    return { email: aliasEmail(result.data.login_username) };
  });
