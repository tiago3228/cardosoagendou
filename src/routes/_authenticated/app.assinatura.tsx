import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { getMyEntitlements, getOpenCharge } from "@/lib/billing.functions";
import {
  cancelSubscription,
  clearPendingPlanChange,
  createSubscriptionCheckout,
  getMySubscription,
  reactivateSubscription,
  schedulePlanChange,
} from "@/lib/subscription.functions";
import {
  annualFreeMonths,
  annualMonthlyEquivalentCents,
  annualSavingsCents,
  planLimitLabel,
  planPriceCents,
  type BillingInterval,
} from "@/lib/plans";
import { formatBRL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { PixCheckout } from "@/components/billing/PixCheckout";

export const Route = createFileRoute("/_authenticated/app/assinatura")({
  component: SubscriptionPage,
});

const STATUS_LABEL: Record<string, string> = {
  TRIALING: "Período de teste",
  ACTIVE: "Ativa",
  PAST_DUE: "Pagamento pendente",
  SUSPENDED: "Suspensa",
  CANCELED: "Cancelada",
};

function SubscriptionPage() {
  const fetchSubscription = useServerFn(getMySubscription);
  const startCheckout = useServerFn(createSubscriptionCheckout);
  const changePlan = useServerFn(schedulePlanChange);
  const cancel = useServerFn(cancelSubscription);
  const reactivate = useServerFn(reactivateSubscription);
  const clearPending = useServerFn(clearPendingPlanChange);
  const queryClient = useQueryClient();
  const [interval, setInterval] = useState<BillingInterval>("MONTHLY");

  const fetchEntitlements = useServerFn(getMyEntitlements);
  const fetchCharge = useServerFn(getOpenCharge);

  const data = useQuery({ queryKey: ["subscription"], queryFn: () => fetchSubscription() });
  const entitlements = useQuery({ queryKey: ["entitlements"], queryFn: () => fetchEntitlements() });
  const charge = useQuery({ queryKey: ["open-charge"], queryFn: () => fetchCharge() });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["subscription"] });
    queryClient.invalidateQueries({ queryKey: ["panel"] });
    queryClient.invalidateQueries({ queryKey: ["entitlements"] });
    queryClient.invalidateQueries({ queryKey: ["open-charge"] });
  };
  const fail = (error: Error) =>
    toast.error("Não foi possível concluir", {
      description: error.message.replace(/^[A-Z_]+:\s*/, ""),
    });

  const checkout = useMutation({
    mutationFn: (input: { planCode: string; method: "PIX" | "CREDIT_CARD" }) =>
      startCheckout({ data: { ...input, interval } as never }),
    onSuccess: (result) => {
      toast.success(
        result.method === "PIX" ? "PIX gerado" : "Assinatura criada",
        {
          description:
            result.method === "PIX"
              ? "Use o código PIX abaixo para confirmar o pagamento."
              : "Finalize o pagamento no link da fatura abaixo.",
        },
      );
      refresh();
    },
    onError: fail,
  });

  const change = useMutation({
    mutationFn: (planCode: string) => changePlan({ data: { planCode, interval } as never }),
    onSuccess: (result) => {
      if (!result.applied) toast.info("Esse já é o seu plano atual");
      else
        toast.success(`Mudança para ${result.planName} agendada`, {
          description: `Entra em vigor em ${new Date(result.effectiveAt!).toLocaleDateString("pt-BR")}.`,
        });
      refresh();
    },
    onError: fail,
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancel(),
    onSuccess: (result) => {
      toast.success("Assinatura cancelada", {
        description: `Acesso liberado até ${new Date(result.activeUntil).toLocaleDateString("pt-BR")}.`,
      });
      refresh();
    },
    onError: fail,
  });

  const reactivateMutation = useMutation({
    mutationFn: () => reactivate(),
    onSuccess: () => {
      toast.success("Assinatura reativada");
      refresh();
    },
    onError: fail,
  });

  const clearMutation = useMutation({
    mutationFn: () => clearPending(),
    onSuccess: () => {
      toast.success("Mudança de plano cancelada");
      refresh();
    },
    onError: fail,
  });

  const subscription = data.data?.subscription;
  const plans = data.data?.plans ?? [];
  const currentPlanId = subscription?.plan_id;
  const ent = entitlements.data;
  const openCharge = charge.data;

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-foreground">Assinatura</h1>

      {subscription ? (
        <div className="mt-5 rounded-xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
          <p className="text-lg font-semibold text-card-foreground">
            {STATUS_LABEL[subscription.status] ?? subscription.status}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Cobrança {subscription.billing_interval === "ANNUAL" ? "anual" : "mensal"} · renova em{" "}
            {new Date(subscription.current_period_end).toLocaleDateString("pt-BR")}
          </p>
          {subscription.trial_ends_at && subscription.status === "TRIALING" ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Teste grátis até {new Date(subscription.trial_ends_at).toLocaleDateString("pt-BR")}
            </p>
          ) : null}
          <p className="mt-1 text-sm text-muted-foreground">
            {data.data?.activeProfessionals} profissional(is) ativo(s)
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {subscription.cancel_at_period_end ? (
              <Button size="sm" onClick={() => reactivateMutation.mutate()}>
                Reativar assinatura
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => cancelMutation.mutate()}>
                Cancelar no fim do período
              </Button>
            )}
            {subscription.pending_plan_id ? (
              <Button size="sm" variant="ghost" onClick={() => clearMutation.mutate()}>
                Cancelar mudança agendada
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {ent && ent.booking_state !== "OPEN" ? (
        <div
          className={`mt-5 rounded-xl border p-4 text-sm ${
            ent.booking_state === "BLOCKED"
              ? "border-destructive/40 bg-destructive/10 text-foreground"
              : "border-primary/40 bg-primary/10 text-foreground"
          }`}
          role="alert"
        >
          <p className="font-semibold">
            {ent.booking_state === "BLOCKED"
              ? "Sua agenda pública está bloqueada"
              : "Pagamento pendente — período de tolerância"}
          </p>
          <p className="mt-1 text-muted-foreground">
            {ent.booking_state === "BLOCKED"
              ? "Regularize o pagamento para voltar a receber novos agendamentos. Seus dados continuam salvos."
              : `Sua agenda continua ativa por mais alguns dias (${ent.grace_period_days ?? 7} de tolerância). Pague a fatura para evitar o bloqueio.`}
          </p>
        </div>
      ) : null}

      {openCharge ? (
        <div className="mt-5 rounded-xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Fatura em aberto</p>
          <p className="mt-1 text-lg font-semibold text-card-foreground">
            {formatBRL(openCharge.amountCents ?? 0)}
            {openCharge.dueDate ? (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                vence em {new Date(`${openCharge.dueDate}T12:00:00Z`).toLocaleDateString("pt-BR")}
              </span>
            ) : null}
          </p>
          {openCharge.pixPayload ? (
            <div className="mt-3">
              <p className="text-sm text-muted-foreground">Código PIX (copia e cola)</p>
              <code className="mt-1 block max-h-24 overflow-auto break-all rounded-lg bg-muted p-3 text-xs text-foreground">
                {openCharge.pixPayload}
              </code>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => {
                  void navigator.clipboard.writeText(openCharge.pixPayload!);
                  toast.success("Código PIX copiado");
                }}
              >
                Copiar código PIX
              </Button>
            </div>
          ) : null}
          {openCharge.invoiceUrl ? (
            <a
              className="mt-3 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
              href={openCharge.invoiceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Abrir fatura
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="mt-8 flex items-center gap-2">
        {(["MONTHLY", "ANNUAL"] as BillingInterval[]).map((option) => (
          <button
            key={option}
            onClick={() => setInterval(option)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${interval === option ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"}`}
          >
            {option === "MONTHLY" ? "Mensal" : "Anual"}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          return (
            <article
              key={plan.id}
              className={`rounded-2xl border p-5 ${isCurrent ? "border-primary bg-primary/5" : "border-border bg-card"}`}
            >
              <h2 className="font-display text-lg font-bold text-card-foreground">{plan.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{planLimitLabel(plan)}</p>
              <p className="mt-4 text-2xl font-bold text-foreground">
                {formatBRL(
                  interval === "ANNUAL" ? annualMonthlyEquivalentCents(plan) : planPriceCents(plan, interval),
                )}
                <span className="text-sm font-normal text-muted-foreground">/mês</span>
              </p>
              {interval === "ANNUAL" ? (
                <p className="mt-1 text-sm text-primary">
                  {formatBRL(plan.annual_price_cents)} por ano · {annualFreeMonths(plan)} mês(es) grátis ·
                  economize {formatBRL(annualSavingsCents(plan))}
                </p>
              ) : null}
              {plan.description ? (
                <p className="mt-3 text-sm text-muted-foreground">{plan.description}</p>
              ) : null}

              <div className="mt-5 space-y-2">
                {isCurrent && subscription?.billing_interval === interval ? (
                  <p className="flex items-center gap-2 text-sm font-medium text-primary">
                    <Check className="size-4" aria-hidden /> Plano atual
                  </p>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full"
                    size="sm"
                    onClick={() => change.mutate(plan.code)}
                  >
                    Agendar troca para {plan.name}
                  </Button>
                )}
                <Button
                  className="w-full"
                  onClick={() => {
                    setSelected({ code: plan.code, name: plan.name });
                    setPixOpen(false);
                  }}
                >
                  Assinar {plan.name}
                </Button>
              </div>
            </article>
          );
        })}
      </div>

      {selected ? (
        <div className="mt-6 rounded-2xl border border-border bg-card p-5">
          <h2 className="font-display text-lg font-bold text-card-foreground">
            Escolha a forma de pagamento
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Plano {selected.name} · {interval === "ANNUAL" ? "anual" : "mensal"}
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-border p-4">
              <p className="font-semibold text-card-foreground">Mercado Pago</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Assinatura automática · pagamento recorrente
              </p>
              <Button
                className="mt-4 w-full"
                disabled={checkout.isPending}
                onClick={() => checkout.mutate({ planCode: selected.code, method: "CREDIT_CARD" })}
              >
                Assinar com Mercado Pago
              </Button>
            </div>

            <div className="rounded-xl border border-border p-4">
              <p className="font-semibold text-card-foreground">PIX direto</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Pagamento manual · faça o PIX e aguarde a confirmação da nossa equipe.
              </p>
              <Button
                variant="outline"
                className="mt-4 w-full"
                onClick={() => setPixOpen(true)}
              >
                Assinar via PIX
              </Button>
            </div>
          </div>

          {pixOpen ? (
            <div className="mt-5 border-t border-border pt-5">
              <PixCheckout planCode={selected.code} interval={interval} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
