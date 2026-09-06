import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, Crown, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { listPlans } from "@/lib/public.functions";
import { formatBRL } from "@/lib/format";

const BENEFITS: Record<string, string[]> = {
  BASIC: ["1 profissional", "Agenda online e página de reservas", "Clientes e serviços"],
  MEDIUM: ["Até 5 profissionais", "Editar e excluir profissionais", "Relatórios do negócio"],
  UNLIMITED: [
    "Profissionais ilimitados",
    "Produtos e vendas na página de reservas",
    "Comissões por profissional",
  ],
};

/** Dashboard banner comparing the current plan with what the next ones unlock. */
export function PlanBenefitsBanner({ currentPlanCode }: { currentPlanCode: string | null }) {
  const plans = useQuery({ queryKey: ["public-plans"], queryFn: () => listPlans() });
  const list = plans.data ?? [];
  if (list.length === 0) return null;

  const currentIndex = list.findIndex((p) => p.code === currentPlanCode);

  return (
    <section className="mt-6 rounded-xl border border-border bg-secondary/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-foreground">
          <Crown className="size-4 text-primary" aria-hidden /> Benefícios da sua assinatura
        </h2>
        <Button asChild size="sm" variant="outline">
          <Link to="/app/assinatura">Ver planos</Link>
        </Button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {list.map((plan, index) => {
          const isCurrent = plan.code === currentPlanCode;
          const isUpgrade = currentIndex >= 0 && index > currentIndex;
          return (
            <div
              key={plan.id}
              className={`rounded-lg border p-3 ${isCurrent ? "border-primary bg-primary/5" : "border-border bg-card"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-card-foreground">{plan.name}</p>
                {isCurrent ? (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
                    Seu plano
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatBRL(plan.monthly_price_cents)}/mês
              </p>
              <ul className="mt-2 space-y-1">
                {(BENEFITS[plan.code] ?? []).map((benefit) => (
                  <li
                    key={benefit}
                    className="flex items-start gap-1.5 text-xs text-muted-foreground"
                  >
                    {isCurrent ? (
                      <Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                    ) : (
                      <Lock className="mt-0.5 size-3 shrink-0" aria-hidden />
                    )}
                    {benefit}
                  </li>
                ))}
              </ul>
              {isUpgrade ? (
                <Button asChild size="sm" className="mt-3 w-full">
                  <Link to="/app/assinatura">Fazer upgrade</Link>
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
