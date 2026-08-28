import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { listBusinessesForMaster, setMasterTestPlan } from "@/lib/master.functions";
import { formatBRL } from "@/lib/format";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/master/planos")({
  head: () => ({
    meta: [
      { title: "Modo de teste de planos — Master · Agendou Pro" },
      {
        name: "description",
        content: "Alterne o plano de qualquer negócio para testar limites e recursos da assinatura.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MasterPlansPage,
});

const INTERVALS = [
  { value: "MONTHLY", label: "Mensal" },
  { value: "ANNUAL", label: "Anual" },
] as const;

const FEATURE_LABEL: Record<string, string> = {
  appointments: "Agenda",
  clients: "Clientes",
  services: "Serviços",
  inventory: "Produtos e estoque",
  reports: "Relatórios financeiros",
  commissions: "Comissões",
};

function MasterPlansPage() {
  const queryClient = useQueryClient();
  const fetchOverview = useServerFn(listBusinessesForMaster);
  const applyPlan = useServerFn(setMasterTestPlan);
  const [interval, setInterval] = useState<"MONTHLY" | "ANNUAL">("MONTHLY");

  const overview = useQuery({ queryKey: ["master-plans"], queryFn: () => fetchOverview() });

  const switchPlan = useMutation({
    mutationFn: (vars: { businessId: string; planCode: "BASIC" | "MEDIUM" | "UNLIMITED" }) =>
      applyPlan({ data: { ...vars, interval } }),
    onSuccess: (result) => {
      toast.success(`Plano alterado para ${result.plan_name}`);
      queryClient.invalidateQueries({ queryKey: ["master-plans"] });
      queryClient.invalidateQueries({ queryKey: ["entitlements"] });
      queryClient.invalidateQueries({ queryKey: ["panel"] });
    },
    onError: (error: Error) => toast.error(error.message.replace(/^[A-Z_]+:\s*/, "")),
  });

  if (overview.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando negócios...</p>;
  }

  if (overview.error) {
    return (
      <div>
        <h1 className="font-display text-2xl font-bold">Acesso restrito</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta área é exclusiva da conta master.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/app">Voltar ao painel</Link>
        </Button>
      </div>
    );
  }

  const plans = overview.data?.plans ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold">Modo de teste de planos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Coloque qualquer negócio em um plano para validar limites e recursos. As restrições são
          aplicadas no banco de dados — não apenas na tela.
        </p>
      </header>

      <section className="rounded-lg border border-border p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Recursos por plano</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {plans.map((plan) => {
            const features = (plan.features ?? {}) as Record<string, unknown>;
            return (
              <div key={plan.code} className="rounded-md border border-border p-3">
                <p className="text-sm font-semibold">{plan.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBRL(plan.monthly_price_cents)}/mês ·{" "}
                  {plan.professional_limit === null
                    ? "profissionais ilimitados"
                    : `${plan.professional_limit} profissional(is)`}
                </p>
                <ul className="mt-2 space-y-0.5 text-xs">
                  {Object.entries(FEATURE_LABEL).map(([key, label]) => (
                    <li
                      key={key}
                      className={features[key] === true ? "text-foreground" : "text-muted-foreground line-through"}
                    >
                      {label}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Periodicidade do teste:</span>
        {INTERVALS.map((option) => (
          <Button
            key={option.value}
            size="sm"
            variant={interval === option.value ? "default" : "outline"}
            onClick={() => setInterval(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <section className="space-y-3">
        {(overview.data?.businesses ?? []).map((business) => (
          <article key={business.id} className="rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{business.name}</p>
                <p className="text-xs text-muted-foreground">
                  /{business.slug} · Plano atual: {business.planName ?? "—"} ·{" "}
                  {business.status ?? "sem assinatura"}
                  {business.provider === "master_test" ? " · modo teste" : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {plans.map((plan) => (
                  <Button
                    key={plan.code}
                    size="sm"
                    variant={business.planCode === plan.code ? "default" : "outline"}
                    disabled={switchPlan.isPending}
                    onClick={() =>
                      switchPlan.mutate({
                        businessId: business.id,
                        planCode: plan.code as "BASIC" | "MEDIUM" | "UNLIMITED",
                      })
                    }
                  >
                    {plan.name}
                  </Button>
                ))}
              </div>
            </div>
          </article>
        ))}
        {(overview.data?.businesses ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum negócio cadastrado ainda.</p>
        ) : null}
      </section>
    </div>
  );
}
