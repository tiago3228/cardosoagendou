import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  BadgeCheck,
  BarChart3,
  CalendarCheck,
  CalendarClock,
  Check,
  Clock,
  CreditCard,
  Layers,
  MessageCircle,
  Package,
  Palette,
  Percent,
  Repeat,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { listPlans } from "@/lib/public.functions";
import {
  annualFreeMonths,
  annualMonthlyEquivalentCents,
  planLimitLabel,
  type PlanRow,
} from "@/lib/plans";
import { formatBRL } from "@/lib/format";
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
          "Agenda online, página de reservas própria, controle de profissionais, clientes, produtos, comissões e financeiro. Teste grátis por 30 dias.",
      },
      { property: "og:title", content: "Agendou — agenda online para negócios de serviço" },
      {
        property: "og:description",
        content: "Sua página de agendamento pronta em minutos. Teste grátis por 30 dias.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: CalendarCheck,
    title: "Página de reservas própria",
    text: "Link exclusivo do seu negócio, com suas cores, logo e capa. Feito para celular.",
  },
  {
    icon: CalendarClock,
    title: "Agenda inteligente",
    text: "Horários por profissional, intervalo de almoço, antecedência mínima e limite de dias.",
  },
  {
    icon: Layers,
    title: "Combos e serviços paralelos",
    text: "Vários serviços na mesma reserva, combos com desconto e serviços que não ocupam a agenda.",
  },
  {
    icon: ShieldCheck,
    title: "Conflitos sob controle",
    text: "Regras de serviços que não podem ser feitos juntos e bloqueio de horário duplicado.",
  },
  {
    icon: MessageCircle,
    title: "WhatsApp em cada etapa",
    text: "Confirmação, lembrete automático e contato com o cliente em um toque.",
  },
  {
    icon: Repeat,
    title: "Cliente remarca sozinho",
    text: "Link de autoatendimento para confirmar presença, remarcar ou cancelar dentro do prazo.",
  },
  {
    icon: Users,
    title: "Equipe e permissões",
    text: "Convite por e-mail para cada profissional, que enxerga apenas a própria agenda.",
  },
  {
    icon: Percent,
    title: "Comissões por profissional",
    text: "Percentual individual calculado automaticamente sobre o que foi atendido.",
  },
  {
    icon: Package,
    title: "Produtos e estoque",
    text: "Venda produtos junto do atendimento, com baixa de estoque e alerta de mínimo.",
  },
  {
    icon: Wallet,
    title: "Financeiro do dia a dia",
    text: "Receitas, despesas, comissões e faturamento por dia, semana e mês.",
  },
  {
    icon: BarChart3,
    title: "Base de clientes",
    text: "Histórico de atendimentos, observações e contato rápido por WhatsApp.",
  },
  {
    icon: Smartphone,
    title: "Funciona como aplicativo",
    text: "Instale na tela inicial do celular e trabalhe direto do balcão.",
  },
] as const;

const SEGMENTS = [
  "Barbearia",
  "Salão de cabelo",
  "Salão de beleza",
  "Clínica de estética",
  "Studio de unhas",
  "Design de sobrancelhas",
  "Cílios e extensões",
  "Depilação",
  "Maquiagem",
  "Trança e penteados",
  "Massagem e terapias",
  "Studio de tatuagem",
  "Piercing",
  "Fisioterapia",
  "Psicoterapia",
  "Nutrição",
  "Odontologia",
  "Podologia",
  "Quiropraxia e RPG",
  "Acupuntura",
  "Personal trainer",
  "Pilates e yoga",
  "Estética automotiva",
  "Pet shop e banho e tosa",
  "Consultórios em geral",
  "Outro negócio por horário",
] as const;

const STEPS = [
  {
    title: "Crie sua conta",
    text: "Escolha o segmento e receba um catálogo de serviços pronto para editar.",
  },
  {
    title: "Ajuste equipe e horários",
    text: "Cadastre profissionais, serviços, preços e horários de atendimento.",
  },
  {
    title: "Compartilhe seu link",
    text: "Divulgue no Instagram e no WhatsApp e receba agendamentos 24h por dia.",
  },
] as const;

const PLAN_BENEFITS: Record<string, string[]> = {
  BASIC: [
    "1 profissional",
    "Página de reservas e agenda completa",
    "Clientes, serviços e combos",
    "Avisos por WhatsApp",
  ],
  MEDIUM: [
    "Até 5 profissionais",
    "Gestão completa da equipe",
    "Horários e serviços por profissional",
    "Relatórios do negócio",
  ],
  UNLIMITED: [
    "Profissionais ilimitados",
    "Produtos, estoque e vendas",
    "Financeiro e comissões",
    "Todos os recursos liberados",
  ],
};

function Landing() {
  const { data: plans } = useSuspenseQuery(plansQuery);
  const [annual, setAnnual] = useState(false);
  const list = plans as PlanRow[];
  const highlight = list[1]?.id ?? list[0]?.id;

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <span className="font-display text-xl font-bold text-foreground">Agendou</span>
          <nav className="flex items-center gap-1 sm:gap-2">
            <a
              href="#recursos"
              className="hidden rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              Recursos
            </a>
            <a
              href="#planos"
              className="hidden rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              Planos
            </a>
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth">Entrar</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/cadastro">Criar conta</Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 -top-40 size-[34rem] rounded-full bg-primary/10 blur-3xl"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-14 md:grid-cols-[1.1fr_0.9fr] md:pt-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
              <Sparkles className="size-3.5" aria-hidden /> Plataforma de agendamento
            </span>
            <h1 className="mt-5 max-w-2xl font-display text-4xl font-bold leading-[1.08] text-foreground md:text-6xl">
              Sua agenda cheia, sem trocar mensagem para marcar horário.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              Agenda, equipe, clientes, produtos e financeiro em um só lugar. Seus clientes escolhem
              serviço, profissional e horário em poucos toques — a qualquer hora do dia.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link to="/cadastro">Começar teste grátis de 30 dias</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/auth">Já tenho conta</Link>
              </Button>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              {["Sem cartão para testar", "Cancele quando quiser", "Suporte por WhatsApp"].map(
                (item) => (
                  <li key={item} className="flex items-center gap-1.5">
                    <BadgeCheck className="size-4 text-primary" aria-hidden />
                    {item}
                  </li>
                ),
              )}
            </ul>
          </div>

          {/* Mock da página de reservas */}
          <div className="relative mx-auto w-full max-w-sm">
            <div className="rounded-[2rem] border border-border bg-card p-4 shadow-xl">
              <div className="rounded-2xl bg-secondary/50 p-4">
                <p className="text-xs uppercase tracking-widest text-muted-foreground">
                  agendou.app/seu-negocio
                </p>
                <p className="mt-2 font-display text-lg font-bold text-card-foreground">
                  Studio Central
                </p>
                <div className="mt-4 space-y-2">
                  {[
                    { name: "Corte masculino", meta: "30 min · R$ 45,00" },
                    { name: "Barba completa", meta: "30 min · R$ 35,00" },
                    { name: "Corte + barba", meta: "60 min · R$ 70,00" },
                  ].map((s, i) => (
                    <div
                      key={s.name}
                      className={`flex items-center justify-between rounded-xl border p-3 ${i === 2 ? "border-primary bg-primary/10" : "border-border bg-card"}`}
                    >
                      <div>
                        <p className="text-sm font-medium text-card-foreground">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.meta}</p>
                      </div>
                      {i === 2 ? <Check className="size-4 text-primary" aria-hidden /> : null}
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-4 gap-2">
                  {["09:00", "09:30", "10:00", "10:30", "11:00", "13:00", "13:30", "14:00"].map(
                    (h, i) => (
                      <span
                        key={h}
                        className={`rounded-lg px-1 py-1.5 text-center text-[11px] font-medium ${i === 3 ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
                      >
                        {h}
                      </span>
                    ),
                  )}
                </div>
                <div className="mt-4 rounded-xl bg-primary px-4 py-2.5 text-center text-sm font-semibold text-primary-foreground">
                  Confirmar agendamento
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Recursos */}
      <section id="recursos" className="mx-auto max-w-6xl px-5 py-20">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">Recursos</p>
        <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold text-foreground md:text-4xl">
          Tudo que o seu negócio precisa para atender por horário
        </h2>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <li
              key={f.title}
              className="group rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
            >
              <span className="inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <f.icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-4 font-semibold text-card-foreground">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Como funciona */}
      <section className="border-y border-border bg-secondary/40 py-16">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="font-display text-3xl font-bold text-foreground">Comece em três passos</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="rounded-xl border border-border bg-card p-5">
                <span className="inline-flex size-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <h3 className="mt-3 font-semibold text-card-foreground">{step.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Segmentos */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="max-w-2xl font-display text-3xl font-bold text-foreground md:text-4xl">
          Feito para todo tipo de atendimento por horário
        </h2>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Cada segmento vem com serviços, categorias e nomes prontos — e você ajusta como quiser.
        </p>
        <div className="mt-8 flex flex-wrap gap-2">
          {SEGMENTS.map((segment) => (
            <span
              key={segment}
              className="rounded-full border border-border bg-card px-4 py-2 text-sm text-card-foreground transition-colors hover:border-primary/50 hover:text-primary"
            >
              {segment}
            </span>
          ))}
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="border-t border-border bg-secondary/30 py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-primary">Planos</p>
              <h2 className="mt-3 font-display text-3xl font-bold text-foreground md:text-4xl">
                Preço simples, sem surpresa
              </h2>
              <p className="mt-2 max-w-xl text-muted-foreground">
                Todos os planos incluem página de reservas, agenda, clientes e avisos por WhatsApp.
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

          {list.length === 0 ? (
            <p className="mt-10 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
              Não foi possível carregar os planos agora. Atualize a página em instantes.
            </p>
          ) : (
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {list.map((plan) => {
                const featured = plan.id === highlight;
                return (
                  <div
                    key={plan.id}
                    className={`relative flex flex-col rounded-2xl border bg-card p-6 shadow-sm ${featured ? "border-primary shadow-lg md:-mt-3 md:mb-3" : "border-border"}`}
                  >
                    {featured ? (
                      <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                        Mais escolhido
                      </span>
                    ) : null}
                    <h3 className="font-display text-xl font-bold text-card-foreground">
                      {plan.name}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
                    <p className="mt-5 text-3xl font-bold text-foreground">
                      {formatBRL(
                        annual ? annualMonthlyEquivalentCents(plan) : plan.monthly_price_cents,
                      )}
                      <span className="text-base font-normal text-muted-foreground">/mês</span>
                    </p>
                    {annual ? (
                      <p className="mt-1 text-sm text-primary">
                        {formatBRL(plan.annual_price_cents)} por ano — {annualFreeMonths(plan)}{" "}
                        meses grátis
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-muted-foreground">cobrado mensalmente</p>
                    )}
                    <p className="mt-4 text-sm font-semibold text-card-foreground">
                      {planLimitLabel(plan)}
                    </p>
                    <ul className="mt-3 space-y-2">
                      {(PLAN_BENEFITS[plan.code] ?? []).map((benefit) => (
                        <li
                          key={benefit}
                          className="flex items-start gap-2 text-sm text-muted-foreground"
                        >
                          <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                          {benefit}
                        </li>
                      ))}
                    </ul>
                    <Button asChild className="mt-6" variant={featured ? "default" : "outline"}>
                      <Link to="/cadastro" search={{ plano: plan.code }}>
                        Testar {plan.trial_days} dias grátis
                      </Link>
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CreditCard className="size-4 text-primary" aria-hidden /> PIX ou cartão
            </span>
            <span className="flex items-center gap-1.5">
              <Palette className="size-4 text-primary" aria-hidden /> Página com as suas cores
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="size-4 text-primary" aria-hidden /> 30 dias grátis em qualquer plano
            </span>
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="mx-auto max-w-6xl px-5 py-20 text-center">
        <h2 className="font-display text-3xl font-bold text-foreground md:text-4xl">
          Pronto para abrir sua agenda online?
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Crie sua conta, escolha o segmento e comece a receber agendamentos hoje mesmo.
        </p>
        <Button asChild size="lg" className="mt-8">
          <Link to="/cadastro">Criar minha conta grátis</Link>
        </Button>
      </section>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 text-sm text-muted-foreground">
          <span>
            © {new Date().getFullYear()} Agendou. Agendamento online para negócios de serviço.
          </span>
          <span>Por: Tiago Cardoso</span>
        </div>
      </footer>
    </main>
  );
}
