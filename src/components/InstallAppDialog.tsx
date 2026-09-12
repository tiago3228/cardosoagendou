import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { dismissInstallPrompt, installPromptDismissed, useInstallApp } from "@/lib/use-install-app";

/**
 * Shown once per user/device after the first successful login, inviting the
 * customer to create a shortcut (PWA install) for Agendou Pro.
 */
export function InstallAppDialog() {
  const { canInstall, installed, install, manualHint } = useInstallApp();
  const [open, setOpen] = useState(false);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (installed) return;
    if (installPromptDismissed()) return;
    const timer = window.setTimeout(() => setOpen(true), 1200);
    return () => window.clearTimeout(timer);
  }, [installed]);

  const later = () => {
    dismissInstallPrompt();
    setOpen(false);
  };

  const create = async () => {
    const outcome = await install();
    if (outcome === "accepted") {
      dismissInstallPrompt();
      setOpen(false);
      toast.success("Atalho criado! Abra o Agendou Pro pelo ícone do app.");
      return;
    }
    setShowHint(true);
    if (outcome === "dismissed") {
      toast.info("Sem problemas — veja abaixo como criar o atalho manualmente.");
      return;
    }
    toast.info("Seu navegador não abre a instalação automática", {
      description: manualHint,
      duration: 8000,
    });
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(value) => (value ? setOpen(true) : later())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Acesse o Agendou Pro mais rápido 🚀</DialogTitle>
          <DialogDescription>
            Quer criar um atalho para abrir o Agendou Pro rapidamente?
          </DialogDescription>
        </DialogHeader>
        {showHint || !canInstall ? (
          <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            {manualHint}
          </p>
        ) : null}
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={later}>
            Agora não
          </Button>
          <Button onClick={create}>Criar atalho</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
