import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
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

  const data = useQuery({ queryKey: ["subscription"], queryFn: () => fetchSubscription({ data: {} }) });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["subscription"] });
    queryClient.invalidateQueries({ queryKey: ["panel"] });
  };
  const fail = (error: Error) =>
    toast.error("Não foi possível concluir", {
      description: error.message.replace(/^[A-Z_]+:\s*/, ""),
    });

  const checkout = useMutation({
    mutationFn: (input: { planCode: string; method: "PIX" | "CREDIT_CARD" }) =>
      startCheckout({ data: { ...input, interval } as never }),
    onSuccess: (result) => {
      if (result.pixCode) {
        toast.success("PIX gerado", { description: result.pixCode });
      } else {
        toast.success("Checkout criado", { description: result.checkoutUrl });
      }
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
    mutationFn: () => cancel({ data: {} }),
    onSuccess: (result) => {
      toast.success("Assinatura cancelada", {
        description: `Acesso liberado até ${new Date(result.activeUntil).toLocaleDateString("pt-BR")}.`,
      });
      refresh();
    },
    onError: fail,
  });

  const reactivateMutation = useMutation({
    mutationFn: () => reactivate({ data: {} }),
    onSuccess: () => {
      toast.success("Assinatura reativada");
      refresh();
    },
    onError: fail,
  });

  const clearMutation = useMutation({
    mutationFn: () => clearPending({ data: {} }),
    onSuccess: () => {
      toast.success("Mudança de plano cancelada");
      refresh();
    },
    onError: fail,
  });

  const subscription = data.data?.subscription;
  const plans = data.data?.plans ?? [];
  const currentPlanId = subscription?.plan_id;

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
                  <Button className="w-full" onClick={() => change.mutate(plan.code)}>
                    Escolher {plan.name}
                  </Button>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => checkout.mutate({ planCode: plan.code, method: "PIX" })}
                  >
                    Pagar PIX
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => checkout.mutate({ planCode: plan.code, method: "CREDIT_CARD" })}
                  >
                    Cartão
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
