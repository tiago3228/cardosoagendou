import { useState } from "react";
import { Download, Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useInstallApp } from "@/lib/use-install-app";

/** Lets the user create the app shortcut at any time from Ajustes. */
export function InstallAppButton() {
  const { canInstall, installed, install, manualHint } = useInstallApp();
  const [hint, setHint] = useState(false);

  if (installed) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Check className="size-4 text-primary" aria-hidden /> Atalho do app já instalado neste
        dispositivo.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={async () => {
          const outcome = await install();
          if (outcome === "accepted") {
            toast.success("Atalho criado! Abra o Agendou Pro pelo ícone do app.");
            return;
          }
          setHint(true);
        }}
      >
        <Download className="size-4" aria-hidden /> Criar atalho do app
      </Button>
      {hint || !canInstall ? (
        <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          {manualHint}
        </p>
      ) : null}
    </div>
  );
}
