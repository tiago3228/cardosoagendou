import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import {
  getMasterStatus,
  listPixRequestsForReview,
  reviewPixRequest,
} from "@/lib/manual-pix.functions";
import { PIX_STATUS_LABEL } from "@/components/billing/PixCheckout";
import { formatBRL } from "@/lib/format";
import { userFacingError } from "@/lib/user-facing-error";
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
  const [activeTab, setActiveTab] = useState("ALL");
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);

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
        description: userFacingError(error),
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
  const statusTabs = [
    { value: "ALL", label: "Todos" },
    { value: "PENDING", label: "Pendentes" },
    { value: "APPROVED", label: "Aprovados" },
    { value: "REJECTED", label: "Recusados" },
    { value: "EXPIRED", label: "Expirados" },
  ];
  const visibleRows = activeTab === "ALL" ? rows : rows.filter((row) => row.status === activeTab);

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-8">
      <BackButton forceFallback />
      <h1 className="font-display text-2xl font-bold text-foreground">Pagamentos PIX</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Analise e libere as assinaturas pagas por PIX direto.
      </p>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">Nenhuma solicitação registrada.</p>
      ) : null}

      {rows.length > 0 ? (
        <div
          className="mt-6 flex flex-wrap gap-2"
          role="tablist"
          aria-label="Status dos pagamentos"
        >
          {statusTabs.map((tab) => {
            const count =
              tab.value === "ALL"
                ? rows.length
                : rows.filter((row) => row.status === tab.value).length;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${activeTab === tab.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:border-primary/50"}`}
              >
                {tab.label} <span className="ml-1 opacity-80">({count})</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {visibleRows.length === 0 && rows.length > 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">Nenhum pagamento nesta categoria.</p>
      ) : null}

      <ul className="mt-6 space-y-4">
        {visibleRows.map((row) => {
          const business = row.businesses as { name?: string; email?: string | null } | null;
          const plan = row.plans as { name?: string } | null;
          const expanded = expandedRequestId === row.id;
          return (
            <li
              key={row.id}
              className={`rounded-xl border bg-card p-5 ${row.status === "PENDING" ? "border-amber-400/70" : "border-border"}`}
            >
              <button
                type="button"
                className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
                onClick={() => setExpandedRequestId(expanded ? null : row.id)}
                aria-expanded={expanded}
              >
                <span>
                  <span className="block font-semibold text-card-foreground">
                    {business?.name ?? "Negócio"}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {plan?.name ?? "Plano"} ·{" "}
                    {row.billing_interval === "ANNUAL" ? "Anual" : "Mensal"} ·{" "}
                    {formatBRL(row.amount_cents)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${row.status === "PENDING" ? "animate-pulse border-amber-400 bg-amber-100 text-amber-900" : "border-border text-muted-foreground"}`}
                  >
                    {row.status === "PENDING"
                      ? "Aguardando análise"
                      : (PIX_STATUS_LABEL[row.status] ?? row.status)}
                  </span>
                  <ChevronDown
                    className={`size-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
                    aria-hidden
                  />
                </span>
              </button>

              {expanded ? (
                <div className="mt-4 border-t border-border pt-4">
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
                    <p className="mt-3 text-sm text-muted-foreground">
                      Nota interna: {row.admin_note}
                    </p>
                  ) : null}

                  {row.period_end ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Período liberado até {new Date(row.period_end).toLocaleDateString("pt-BR")}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
