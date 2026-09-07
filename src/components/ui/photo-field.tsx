import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { uploadBusinessMedia, type MediaFolder } from "@/lib/media";
import { userFacingError } from "@/lib/user-facing-error";

interface PhotoFieldProps {
  businessId: string;
  folder: MediaFolder;
  value: string | null;
  onChange: (url: string | null) => void;
  label?: string;
  disabled?: boolean;
}

/** Image picker with preview used for professional and product photos. */
export function PhotoField({
  businessId,
  folder,
  value,
  onChange,
  label = "Foto",
  disabled,
}: PhotoFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const url = await uploadBusinessMedia(businessId, folder, file);
      onChange(url);
      toast.success("Foto enviada com sucesso!");
    } catch (error) {
      toast.error("Não foi possível enviar a foto", {
        description: userFacingError(error),
      });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        {value ? (
          <img src={value} alt="Pré-visualização" className="size-14 rounded-lg object-cover" />
        ) : (
          <div className="flex size-14 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground">
            <ImagePlus className="size-5" aria-hidden />
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => void pick(event.target.files?.[0])}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || disabled}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {value ? "Trocar foto" : "Escolher foto"}
        </Button>
        {value ? (
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => onChange(null)}>
            <X className="size-4" aria-hidden /> Remover
          </Button>
        ) : null}
      </div>
    </div>
  );
}
