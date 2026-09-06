import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  getMasterStatus,
  listPixRequestsForReview,
  reviewPixRequest,
} from "@/lib/manual-pix.functions";
import { PIX_STATUS_LABEL } from "@/components/billing/PixCheckout";
import { formatBRL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/BackButton";

export const Route = createFileRoute("/_authenticated/master/pagamentos")({
  head: () => ({
    meta: [
      { title: "Pagamentos PIX — Master · Agendou Pro" },
      {
        name: "description",
        content: "Análise e liberação de pagamentos PIX manuais das assinaturas.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MasterPixPage,
});

/**
 * Minimum Master interface to review manual PIX payments. The full Master
 * panel is a later phase — every action here goes through a security-definer
 * database function that re-checks the master role server-side.
 */
function MasterPixPage() {
  const fetchStatus = useServerFn(getMasterStatus);
  const fetchRequests = useServerFn(listPixRequestsForReview);
  const review = useServerFn(reviewPixRequest);
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});

  const master = useQuery({ queryKey: ["master-status"], queryFn: () => fetchStatus() });
  const requests = useQuery({
    queryKey: ["pix-review"],
    queryFn: () => fetchRequests(),
    enabled: master.data?.isMaster === true,
  });

  const act = useMutation({
    mutationFn: (input: { requestId: string; action: "APPROVE" | "REJECT" }) =>
      review({
        data: {
          ...input,
          ...(notes[input.requestId]?.trim() ? { adminNote: notes[input.requestId]!.trim() } : {}),
        },
      }),
    onSuccess: (result) => {
      toast.success(
        result.status === "APPROVED"
          ? result.already
            ? "Pagamento já estava aprovado"
            : "Pagamento aprovado! Assinatura liberada."
          : "Pagamento recusado",
      );
      void queryClient.invalidateQueries({ queryKey: ["pix-review"] });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível concluir a análise.", {
        description: error.message.replace(/^[A-Z_]+:\s*/, ""),
      }),
  });

  if (master.isPending)
    return <main className="p-6 text-sm text-muted-foreground">Carregando…</main>;

  if (!master.data?.isMaster) {
    return (
      <main className="flex min-h-screen items-center justify-center px-5 text-center">
        <div>
          <h1 className="font-display text-2xl font-bold">Acesso restrito</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Esta área é exclusiva da conta master.
          </p>
          <Button asChild className="mt-6">
            <Link to="/app">Voltar ao painel</Link>
          </Button>
        </div>
      </main>
    );
  }

  const rows = requests.data?.requests ?? [];

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-8">
      <BackButton />
      <h1 className="font-display text-2xl font-bold text-foreground">Pagamentos PIX</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Analise e libere as assinaturas pagas por PIX direto.
      </p>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">Nenhuma solicitação registrada.</p>
      ) : null}

      <ul className="mt-6 space-y-4">
        {rows.map((row) => {
          const business = row.businesses as { name?: string; email?: string | null } | null;
          const plan = row.plans as { name?: string } | null;
          return (
            <li key={row.id} className="rounded-xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-card-foreground">
                    {business?.name ?? "Negócio"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {plan?.name ?? "Plano"} ·{" "}
                    {row.billing_interval === "ANNUAL" ? "Anual" : "Mensal"} ·{" "}
                    {formatBRL(row.amount_cents)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Solicitado em {new Date(row.requested_at).toLocaleString("pt-BR")}
                    {business?.email ? ` · ${business.email}` : ""}
                  </p>
                  {row.customer_note ? (
                    <p className="mt-2 text-sm text-foreground">“{row.customer_note}”</p>
                  ) : null}
                  {row.proofUrl ? (
                    <a
                      className="mt-2 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
                      href={row.proofUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ver comprovante
                    </a>
                  ) : null}
                </div>
                <span className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
                  {PIX_STATUS_LABEL[row.status] ?? row.status}
                </span>
              </div>

              {row.status === "PENDING" ? (
                <div className="mt-4 space-y-2">
                  <input
                    value={notes[row.id] ?? ""}
                    onChange={(event) =>
                      setNotes((prev) => ({ ...prev, [row.id]: event.target.value }))
                    }
                    placeholder="Observação interna (opcional)"
                    maxLength={500}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={act.isPending}
                      onClick={() => act.mutate({ requestId: row.id, action: "APPROVE" })}
                    >
                      Aprovar pagamento
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={act.isPending}
                      onClick={() => act.mutate({ requestId: row.id, action: "REJECT" })}
                    >
                      Recusar
                    </Button>
                  </div>
                </div>
              ) : row.admin_note ? (
                <p className="mt-3 text-sm text-muted-foreground">Nota interna: {row.admin_note}</p>
              ) : null}

              {row.period_end ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Período liberado até {new Date(row.period_end).toLocaleDateString("pt-BR")}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
