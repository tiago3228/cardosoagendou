import { useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * "Voltar" action for internal pages (PIX, Master, Ajustes, etc.).
 * Uses the browser history when possible and falls back to the panel.
 */
export function BackButton({ fallbackTo = "/app" }: { fallbackTo?: string }) {
  const router = useRouter();

  return (
    <Button
      variant="ghost"
      size="sm"
      className="mb-3 -ml-2 text-muted-foreground"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.history.back();
          return;
        }
        void router.navigate({ to: fallbackTo });
      }}
    >
      <ChevronLeft className="size-4" aria-hidden /> Voltar
    </Button>
  );
}
