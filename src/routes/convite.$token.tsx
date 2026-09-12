import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { acceptProfessionalInvite } from "@/lib/team.functions";
import { userFacingError } from "@/lib/user-facing-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/convite/$token")({
  head: () => ({
    meta: [
      { title: "Convite da equipe — Agendou" },
      {
        name: "description",
        content: "Ative seu acesso de profissional e comece a ver sua agenda no Agendou.",
      },
      { property: "og:title", content: "Convite da equipe — Agendou" },
      { property: "og:description", content: "Ative seu acesso de profissional no Agendou." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InvitePage,
});

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const accept = useServerFn(acceptProfessionalInvite);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user)));
  }, []);

  const activate = useMutation({
    mutationFn: () => accept({ data: { token, fullName: fullName.trim() } }),
    onSuccess: () => {
      toast.success("Acesso ativado", { description: "Bem-vindo à equipe!" });
      navigate({ to: "/app" });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível ativar", {
        description: userFacingError(error),
      }),
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12">
      <h1 className="font-display text-2xl font-bold text-foreground">Convite da equipe</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Ative seu acesso para ver sua agenda e seus atendimentos.
      </p>

      {signedIn === false ? (
        <div className="mt-6 rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-card-foreground">
            Entre ou crie sua conta com o e-mail que recebeu o convite. Depois volte para este link
            para concluir a ativação.
          </p>
          <Button
            className="mt-4 w-full"
            onClick={() => navigate({ to: "/auth", search: { next: `/convite/${token}` } })}
          >
            Entrar para continuar
          </Button>
        </div>
      ) : (
        <form
          className="mt-6 space-y-4 rounded-xl border border-border bg-card p-5"
          onSubmit={(e) => {
            e.preventDefault();
            activate.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="fullName">Seu nome completo</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Como você quer ser chamado"
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={activate.isPending || fullName.trim().length < 2}
          >
            Ativar meu acesso
          </Button>
        </form>
      )}
    </main>
  );
}
