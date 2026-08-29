import { supabase } from "@/integrations/supabase/client";

const BUCKET = "business-media";
/** Long-lived signed link so the photo also renders on the public booking page. */
const LINK_TTL_SECONDS = 60 * 60 * 24 * 365 * 10;

export type MediaFolder = "profissionais" | "produtos";

/**
 * Uploads an image to the tenant folder of the private media bucket and returns
 * a ready-to-render link. Storage policies keep each business inside its folder.
 */
export async function uploadBusinessMedia(
  businessId: string,
  folder: MediaFolder,
  file: File,
): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Envie um arquivo de imagem (JPG ou PNG)");
  if (file.size > 5 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 5 MB");

  const extension = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${businessId}/${folder}/${crypto.randomUUID()}.${extension || "jpg"}`;

  const upload = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });
  if (upload.error) throw new Error(upload.error.message);

  const signed = await supabase.storage.from(BUCKET).createSignedUrl(path, LINK_TTL_SECONDS);
  if (signed.error || !signed.data?.signedUrl) {
    throw new Error(signed.error?.message ?? "Não foi possível gerar o link da imagem");
  }
  return signed.data.signedUrl;
}
