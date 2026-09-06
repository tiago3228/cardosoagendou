import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarCheck, Clock, MessageCircle, Package, Users, Wallet } from "lucide-react";
import { listPlans } from "@/lib/public.functions";
import {
  annualFreeMonths,
  annualMonthlyEquivalentCents,
  planLimitLabel,
  type PlanRow,
} from "@/lib/plans";
import { formatBRL } from "@/lib/format";
import { BUSINESS_TYPE_CONFIG, BUSINESS_TYPES } from "@/lib/business-types";
import { Button } from "@/components/ui/button";

const plansQuery = queryOptions({ queryKey: ["plans"], queryFn: () => listPlans() });

export const Route = createFileRoute("/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(plansQuery),
  head: () => ({
    meta: [
      { title: "Agendou — agenda online para barbearias, salões e clínicas" },
      {
        name: "description",
        content:
          "Agenda online, página de reservas própria, controle de profissionais, clientes, produtos e financeiro. Planos a partir de R$ 19,90 por mês.",
      },
      { property: "og:title", content: "Agendou — agenda online para negócios de serviço" },
      {
        property: "og:description",
        content:
          "Sua página de agendamento pronta em minutos. Teste grátis por 30 dias com todos os recursos.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { data: plans } = useSuspenseQuery(plansQuery);
  const [annual, setAnnual] = useState(false);

  return (
    <main className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6">
        <span className="font-display text-xl font-bold text-foreground">Agendou</span>
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/auth">Entrar</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/cadastro">Criar conta</Link>
          </Button>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-16 pt-8 md:pt-16">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">
          Agendamento online
        </p>
        <h1 className="mt-3 max-w-3xl font-display text-4xl font-bold leading-tight text-foreground md:text-6xl">
          Sua agenda cheia, sem trocar mensagem para marcar horário.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
          Uma plataforma para barbearias, salões, clínicas, estúdios de tatuagem, massoterapia e
          consultórios. Seus clientes escolhem serviço, profissional e horário em poucos toques.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button asChild size="lg">
            <Link to="/cadastro">Começar teste grátis de 30 dias</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/auth">Já tenho conta</Link>
          </Button>
        </div>

        <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: CalendarCheck,
              title: "Página de reservas própria",
              text: "Link exclusivo do seu negócio, otimizado para celular.",
            },
            {
              icon: Clock,
              title: "Duração inteligente",
              text: "Vários serviços na mesma reserva somam a duração automaticamente.",
            },
            {
              icon: Users,
              title: "Equipe organizada",
              text: "Horários por profissional, serviços por profissional e comissões.",
            },
            {
              icon: MessageCircle,
              title: "Confirmação por WhatsApp",
              text: "Cada reserva gera avisos para o cliente e para o negócio.",
            },
            {
              icon: Package,
              title: "Produtos e estoque",
              text: "Venda produtos e acompanhe o estoque mínimo.",
            },
            {
              icon: Wallet,
              title: "Financeiro simples",
              text: "Receitas, despesas e comissões em um só lugar.",
            },
          ].map((f) => (
            <li key={f.title} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <f.icon className="size-5 text-primary" aria-hidden />
              <h3 className="mt-3 font-semibold text-card-foreground">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-y border-border bg-secondary/40 py-14">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="font-display text-3xl font-bold text-foreground">
            Feito para todo tipo de atendimento por horário
          </h2>
          <div className="mt-6 flex flex-wrap gap-2">
            {BUSINESS_TYPES.map((type) => (
              <span
                key={type}
                className="rounded-full border border-border bg-card px-4 py-2 text-sm text-card-foreground"
              >
                {BUSINESS_TYPE_CONFIG[type].label}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section id="planos" className="mx-auto max-w-6xl px-5 py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-3xl font-bold text-foreground">Planos</h2>
            <p className="mt-2 text-muted-foreground">
              Todos os planos incluem página de reservas, agenda, clientes e financeiro.
            </p>
          </div>
          <div className="inline-flex rounded-full border border-border bg-card p-1">
            <button
              onClick={() => setAnnual(false)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${!annual ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              Mensal
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${annual ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              Anual
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {(plans as PlanRow[]).map((plan) => (
            <div
              key={plan.id}
              className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm"
            >
              <h3 className="font-display text-xl font-bold text-card-foreground">{plan.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
              <p className="mt-5 text-3xl font-bold text-foreground">
                {formatBRL(annual ? annualMonthlyEquivalentCents(plan) : plan.monthly_price_cents)}
                <span className="text-base font-normal text-muted-foreground">/mês</span>
              </p>
              {annual ? (
                <p className="mt-1 text-sm text-primary">
                  {formatBRL(plan.annual_price_cents)} por ano — {annualFreeMonths(plan)} meses
                  grátis
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">cobrado mensalmente</p>
              )}
              <p className="mt-4 text-sm font-medium text-card-foreground">
                {planLimitLabel(plan)}
              </p>
              <Button asChild className="mt-6">
                <Link to="/cadastro" search={{ plano: plan.code }}>
                  Testar {plan.trial_days} dias grátis
                </Link>
              </Button>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border py-8">
        <div className="mx-auto max-w-6xl px-5 text-sm text-muted-foreground">
          © {new Date().getFullYear()} Agendou. Agendamento online para negócios de serviço.
        </div>
      </footer>
    </main>
  );
}
