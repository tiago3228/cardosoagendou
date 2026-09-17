/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Building2, ChevronDown, MessageSquare, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BackButton } from "@/components/BackButton";
import { userFacingError } from "@/lib/user-facing-error";
import { getMasterStatus } from "@/lib/manual-pix.functions";
import { listMasterAdminData, updateMasterFeedback } from "@/lib/master.functions";

export const Route = createFileRoute("/_authenticated/master/feedback")({
  head: () => ({
    meta: [{ title: "Administração Master — Agendou" }, { name: "robots", content: "noindex" }],
  }),
  component: MasterFeedbackPage,
});

const statusLabels: Record<string, string> = {
  PENDING: "Pendente",
  REVIEWED: "Revisado",
  ARCHIVED: "Arquivado",
};
const subscriptionLabels: Record<string, string> = {
  ACTIVE: "Ativa",
  CANCELED: "Cancelada",
  PAST_DUE: "Em atraso",
  INCOMPLETE: "Incompleta",
  TRIALING: "Teste",
};

function MasterFeedbackPage() {
  const fetchStatus = useServerFn(getMasterStatus);
  const fetchData = useServerFn(listMasterAdminData);
  const updateFeedback = useServerFn(updateMasterFeedback);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"feedback" | "businesses">("feedback");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [responses, setResponses] = useState<Record<string, string>>({});
  const master = useQuery({ queryKey: ["master-status"], queryFn: () => fetchStatus() });
  const data = useQuery({
    queryKey: ["master-admin-data"],
    queryFn: () => fetchData(),
    enabled: master.data?.isMaster === true,
  });
  const act = useMutation({
    mutationFn: (input: { feedbackId: string; status: string }) =>
      updateFeedback({
        data: {
          feedbackId: input.feedbackId,
          status: input.status,
          adminNote: notes[input.feedbackId] ?? null,
          response: responses[input.feedbackId] ?? null,
        },
      }),
    onSuccess: () => {
      toast.success("Feedback atualizado");
      void queryClient.invalidateQueries({ queryKey: ["master-admin-data"] });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível atualizar", { description: userFacingError(error) }),
  });

  if (master.isPending)
    return <main className="p-6 text-sm text-muted-foreground">Carregando…</main>;
  if (!master.data?.isMaster)
    return (
      <main className="flex min-h-screen items-center justify-center px-5 text-center">
        <div>
          <h1 className="font-display text-2xl font-bold">Acesso restrito</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Somente a conta Administrador Master pode ver dados privados.
          </p>
          <Button asChild className="mt-6">
            <Link to="/app">Voltar ao painel</Link>
          </Button>
        </div>
      </main>
    );

  const feedback = (data.data?.feedback ?? []) as Array<any>;
  const businesses = (data.data?.businesses ?? []) as Array<any>;
  const pending = feedback.filter((item) => item.status === "PENDING").length;
  const canceled = businesses.filter(
    (item) => item.subscriptions?.status === "CANCELED" || item.subscriptions?.canceled_at,
  ).length;

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8">
      <BackButton />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" aria-hidden />
            <h1 className="font-display text-2xl font-bold">Administração Master</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Área privada: feedbacks, assinaturas e estabelecimentos criados.
          </p>
        </div>
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
          Acesso exclusivo do Master
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to="/master/pagamentos">Pagamentos PIX</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/master/planos">Testar planos</Link>
        </Button>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Feedbacks pendentes" value={pending} />
        <Stat label="Estabelecimentos" value={businesses.length} />
        <Stat label="Assinaturas canceladas" value={canceled} />
      </div>
      <div className="mt-7 flex gap-2 border-b border-border">
        <button
          type="button"
          onClick={() => setTab("feedback")}
          className={`border-b-2 px-3 py-2 text-sm font-medium ${tab === "feedback" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
        >
          <MessageSquare className="mr-2 inline size-4" aria-hidden />
          Feedbacks ({feedback.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("businesses")}
          className={`border-b-2 px-3 py-2 text-sm font-medium ${tab === "businesses" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
        >
          <Building2 className="mr-2 inline size-4" aria-hidden />
          Estabelecimentos ({businesses.length})
        </button>
      </div>
      {data.isPending ? (
        <p className="mt-8 text-sm text-muted-foreground">Carregando dados privados…</p>
      ) : null}
      {tab === "feedback" ? (
        <ul className="mt-5 space-y-3">
          {feedback.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum feedback recebido.</p>
          ) : (
            feedback.map((item) => {
              const isOpen = expanded === item.id;
              return (
                <li key={item.id} className="rounded-xl border border-border bg-card p-4">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 text-left"
                    onClick={() => setExpanded(isOpen ? null : item.id)}
                    aria-expanded={isOpen}
                  >
                    <span>
                      <span className="font-semibold">
                        {item.category === "sugestao"
                          ? "Sugestão"
                          : item.category === "problema"
                            ? "Problema"
                            : "Dúvida"}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {new Date(item.created_at).toLocaleString("pt-BR")}
                      </span>
                      <span
                        className={`ml-2 rounded-full px-2 py-1 text-xs ${item.status === "PENDING" ? "bg-amber-100 text-amber-900" : "bg-secondary text-muted-foreground"}`}
                      >
                        {statusLabels[item.status] ?? item.status}
                      </span>
                    </span>
                    <ChevronDown
                      className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      aria-hidden
                    />
                  </button>
                  {isOpen ? (
                    <div className="mt-4 border-t border-border pt-4">
                      <p className="whitespace-pre-wrap text-sm">{item.message}</p>
                      <Textarea
                        className="mt-4 border-primary/40"
                        value={responses[item.id] ?? item.master_response ?? ""}
                        onChange={(event) =>
                          setResponses((current) => ({ ...current, [item.id]: event.target.value }))
                        }
                        placeholder="Resposta oficial para o cliente (opcional)"
                        maxLength={2000}
                      />
                      {item.responded_at ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Respondido em {new Date(item.responded_at).toLocaleString("pt-BR")}
                        </p>
                      ) : null}
                      <Textarea
                        className="mt-4"
                        value={notes[item.id] ?? item.admin_note ?? ""}
                        onChange={(event) =>
                          setNotes((current) => ({ ...current, [item.id]: event.target.value }))
                        }
                        placeholder="Nota interna (opcional)"
                        maxLength={2000}
                      />
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => act.mutate({ feedbackId: item.id, status: "REVIEWED" })}
                          disabled={act.isPending}
                        >
                          Marcar revisado
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => act.mutate({ feedbackId: item.id, status: "ARCHIVED" })}
                          disabled={act.isPending}
                        >
                          Arquivar
                        </Button>
                        {item.status !== "PENDING" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => act.mutate({ feedbackId: item.id, status: "PENDING" })}
                            disabled={act.isPending}
                          >
                            Reabrir
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      ) : (
        <div className="mt-5 space-y-3">
          {businesses.map((business) => {
            const subscription = business.subscriptions;
            const plan = subscription?.plans;
            return (
              <article key={business.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">{business.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      /{business.slug} · criado em{" "}
                      {new Date(business.created_at).toLocaleDateString("pt-BR")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Responsável: {business.owner?.name ?? "—"}
                      {business.owner?.email
                        ? ` · ${business.owner.email}`
                        : business.email
                          ? ` · ${business.email}`
                          : ""}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs ${subscription?.status === "CANCELED" ? "bg-red-100 text-red-800" : "bg-secondary text-muted-foreground"}`}
                  >
                    {subscription
                      ? (subscriptionLabels[subscription.status] ?? subscription.status)
                      : "Sem assinatura"}
                  </span>
                </div>
                {subscription ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Plano: {plan?.name ?? "—"} · Provedor: {subscription.provider ?? "—"} ·{" "}
                    {subscription.cancel_at_period_end
                      ? "cancelamento ao fim do período"
                      : subscription.canceled_at
                        ? `cancelada em ${new Date(subscription.canceled_at).toLocaleDateString("pt-BR")}`
                        : "sem cancelamento agendado"}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
