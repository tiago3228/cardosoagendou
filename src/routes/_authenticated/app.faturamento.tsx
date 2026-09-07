import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowDownCircle, ArrowUpCircle, Plus, Wallet } from "lucide-react";
import { addFinanceEntry, getFinanceOverview } from "@/lib/finance.functions";
import { entitlementsQuery } from "./app";
import { formatBRL } from "@/lib/format";
import { userFacingError } from "@/lib/user-facing-error";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/app/faturamento")({
  component: FinancePage,
  head: () => ({
    meta: [
      { title: "Faturamento — Agendou" },
      {
        name: "description",
        content: "Controle entradas, despesas e o resultado diário e semanal do seu negócio.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const today = () => new Date().toISOString().slice(0, 10);

function FinancePage() {
  const { data: entitlements } = useSuspenseQuery(entitlementsQuery);
  const financeEnabled =
    ((entitlements?.features ?? {}) as Record<string, unknown>)["finance"] === true;

  if (!financeEnabled) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <BackButton />
        <h1 className="font-display text-2xl font-bold text-foreground">Faturamento</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Disponível no <strong>Plano Ilimitado (R$ 59,90)</strong>. Faça upgrade para controlar
          entradas, despesas, resultado diário e semanal do seu negócio.
        </p>
        <Button asChild className="mt-4">
          <Link to="/app/assinatura">Fazer upgrade</Link>
        </Button>
      </div>
    );
  }

  return <FinanceDashboard />;
}

function FinanceDashboard() {
  const fetchOverview = useServerFn(getFinanceOverview);
  const addEntry = useServerFn(addFinanceEntry);
  const queryClient = useQueryClient();
  const [date, setDate] = useState(today());
  const [form, setForm] = useState({
    kind: "EXPENSE" as "EXPENSE" | "INCOME",
    amount: "",
    description: "",
    category: "",
    date: today(),
  });

  const overview = useQuery({
    queryKey: ["finance", date],
    queryFn: () => fetchOverview({ data: { date } }),
  });

  const create = useMutation({
    mutationFn: async () => {
      const cents = Math.round(Number(form.amount.replace(/\./g, "").replace(",", ".")) * 100);
      if (!Number.isFinite(cents) || cents <= 0) throw new Error("Informe um valor válido");
      return addEntry({
        data: {
          kind: form.kind,
          amount: cents,
          description: form.description.trim(),
          category: form.category.trim() || undefined,
          date: form.date,
        },
      });
    },
    onSuccess: () => {
      setForm({ ...form, amount: "", description: "", category: "" });
      toast.success("Lançamento registrado");
      queryClient.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível registrar", {
        description: userFacingError(error),
      }),
  });

  const day = overview.data?.day;
  const week = overview.data?.week;

  return (
    <div>
      <BackButton />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Faturamento</h1>
          <p className="text-sm text-muted-foreground">
            Entradas, despesas e resultado do dia e da semana.
          </p>
        </div>
        <Input
          type="date"
          className="h-10 w-auto"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          label="Entradas do dia"
          value={formatBRL((day?.appointmentRevenueCents ?? 0) + (day?.otherIncomeCents ?? 0))}
          hint={`${formatBRL(day?.appointmentRevenueCents ?? 0)} de atendimentos`}
          tone="positive"
        />
        <Card
          label="Despesas do dia"
          value={formatBRL(day?.expensesCents ?? 0)}
          hint="Lançamentos manuais"
          tone="negative"
        />
        <Card
          label="Saldo do dia"
          value={formatBRL(day?.balanceCents ?? 0)}
          hint={`${day?.appointmentsCount ?? 0} agendamento(s)`}
          tone="neutral"
        />
        <Card
          label="Saldo da semana"
          value={formatBRL(week?.balanceCents ?? 0)}
          hint={`${formatBRL(week?.appointmentRevenueCents ?? 0)} concluídos`}
          tone="neutral"
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-secondary/30 p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Previsto no dia (agendamentos ativos)
          </p>
          <p className="mt-1 font-display text-xl font-bold text-foreground">
            {formatBRL(day?.expectedRevenueCents ?? 0)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-secondary/30 p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Previsto na semana
          </p>
          <p className="mt-1 font-display text-xl font-bold text-foreground">
            {formatBRL(week?.expectedRevenueCents ?? 0)}
          </p>
        </div>
      </div>

      <form
        className="mt-6 grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <p className="font-display text-lg font-bold sm:col-span-2">Novo lançamento</p>
        <div className="flex gap-2 sm:col-span-2">
          <Button
            type="button"
            size="sm"
            variant={form.kind === "EXPENSE" ? "default" : "outline"}
            onClick={() => setForm({ ...form, kind: "EXPENSE" })}
          >
            <ArrowDownCircle className="size-4" aria-hidden /> Despesa
          </Button>
          <Button
            type="button"
            size="sm"
            variant={form.kind === "INCOME" ? "default" : "outline"}
            onClick={() => setForm({ ...form, kind: "INCOME" })}
          >
            <ArrowUpCircle className="size-4" aria-hidden /> Outra entrada
          </Button>
        </div>
        <div className="space-y-1.5">
          <Label>Valor (R$)</Label>
          <Input
            inputMode="decimal"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Data</Label>
          <Input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Descrição</Label>
          <Input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Categoria</Label>
          <Input
            list="finance-categorias"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />
          <datalist id="finance-categorias">
            {["Aluguel", "Produtos", "Energia", "Água", "Marketing", "Equipamento", "Outros"].map(
              (c) => (
                <option key={c} value={c} />
              ),
            )}
          </datalist>
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={create.isPending}>
            <Plus className="size-4" aria-hidden /> Registrar
          </Button>
        </div>
      </form>

      <h2 className="mt-8 font-display text-lg font-bold text-foreground">Lançamentos da semana</h2>
      <ul className="mt-3 space-y-2">
        {(overview.data?.entries ?? []).map((entry) => (
          <li
            key={entry.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-card-foreground">{entry.description}</p>
              <p className="text-sm text-muted-foreground">
                {new Date(entry.occurredAt).toLocaleDateString("pt-BR")}
                {entry.category ? ` · ${entry.category}` : ""}
              </p>
            </div>
            <span
              className={`shrink-0 font-semibold ${entry.kind === "EXPENSE" ? "text-destructive" : "text-foreground"}`}
            >
              {entry.kind === "EXPENSE" ? "-" : "+"}
              {formatBRL(entry.amountCents)}
            </span>
          </li>
        ))}
        {(overview.data?.entries ?? []).length === 0 ? (
          <li className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nenhum lançamento manual nesta semana.
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function Card({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "positive" | "negative" | "neutral";
}) {
  const accent =
    tone === "positive"
      ? "text-primary"
      : tone === "negative"
        ? "text-destructive"
        : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        <Wallet className="size-3.5" aria-hidden /> {label}
      </p>
      <p className={`mt-1 font-display text-2xl font-bold ${accent}`}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
