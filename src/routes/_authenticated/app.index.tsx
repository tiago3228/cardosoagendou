import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  MessageCircle,
  TrendingUp,
  X,
} from "lucide-react";
import { getAgenda } from "@/lib/panel.functions";
import { getAppointmentRevenue } from "@/lib/finance.functions";
import { setAppointmentStatus } from "@/lib/appointments.functions";
import { panelQuery } from "./app";
import {
  formatBRL,
  formatDuration,
  formatWhatsapp,
  normalizeBrWhatsapp,
  whatsappLink,
} from "@/lib/format";
import { Button } from "@/components/ui/button";
import { PlanBenefitsBanner } from "@/components/PlanBenefitsBanner";

export const Route = createFileRoute("/_authenticated/app/")({
  component: AgendaPage,
});

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Aguardando",
  CONFIRMED: "Confirmado",
  IN_PROGRESS: "Em atendimento",
  COMPLETED: "Concluído",
  CANCELED: "Cancelado",
  NO_SHOW: "Não compareceu",
};

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  CONFIRMED: "bg-primary/15 text-primary",
  IN_PROGRESS: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  COMPLETED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  CANCELED: "bg-destructive/15 text-destructive",
  NO_SHOW: "bg-muted text-muted-foreground",
};

const FILTERS = [
  { key: "ALL", label: "Todos" },
  { key: "ACTIVE", label: "Ativos" },
  { key: "COMPLETED", label: "Concluídos" },
  { key: "CANCELED", label: "Cancelados" },
] as const;

function dayBounds(date: string) {
  const from = new Date(`${date}T00:00:00`);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

function shiftDay(date: string, days: number) {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

function AgendaPage() {
  const { data: panel } = useSuspenseQuery(panelQuery);
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("ALL");
  const fetchAgenda = useServerFn(getAgenda);
  const fetchRevenue = useServerFn(getAppointmentRevenue);
  const changeStatus = useServerFn(setAppointmentStatus);
  const queryClient = useQueryClient();

  const agenda = useQuery({
    queryKey: ["agenda", date],
    queryFn: () => fetchAgenda({ data: dayBounds(date) }),
  });

  const revenue = useQuery({
    queryKey: ["agenda-revenue", date],
    queryFn: () => fetchRevenue({ data: { date } }),
  });

  const mutation = useMutation({
    mutationFn: (input: { appointmentId: string; status: string }) =>
      changeStatus({ data: input as never }),
    onSuccess: () => {
      toast.success("Agendamento atualizado");
      queryClient.invalidateQueries({ queryKey: ["agenda"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-revenue"] });
      queryClient.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível atualizar", {
        description: error.message.replace(/^[A-Z_]+:\s*/, ""),
      }),
  });

  // Official public domain first, so the shared link never points at a preview host.
  const origin =
    panel.publicOrigin ?? (typeof window !== "undefined" ? window.location.origin : "");
  const bookingUrl = panel.business && origin ? `${origin}/${panel.business.slug}` : "";

  const items = agenda.data ?? [];
  const visible = useMemo(() => {
    if (filter === "ACTIVE")
      return items.filter((a) => ["PENDING", "CONFIRMED", "IN_PROGRESS"].includes(a.status));
    if (filter === "COMPLETED") return items.filter((a) => a.status === "COMPLETED");
    if (filter === "CANCELED")
      return items.filter((a) => ["CANCELED", "NO_SHOW"].includes(a.status));
    return items;
  }, [items, filter]);

  const dayLabel = new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Agenda</h1>
          <p className="text-sm capitalize text-muted-foreground">{dayLabel}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="icon"
            variant="outline"
            aria-label="Dia anterior"
            onClick={() => setDate(shiftDay(date, -1))}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          />
          <Button
            size="icon"
            variant="outline"
            aria-label="Próximo dia"
            onClick={() => setDate(shiftDay(date, 1))}
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
          {date !== today ? (
            <Button size="sm" variant="ghost" onClick={() => setDate(today)}>
              Hoje
            </Button>
          ) : null}
        </div>
      </div>

      {/* "Quanto estou recebendo hoje?" — day and week at a glance. */}
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
            <TrendingUp className="size-3.5" aria-hidden /> Recebido no dia
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-primary">
            {formatBRL(revenue.data?.day.completedCents ?? 0)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Previsto: {formatBRL(revenue.data?.day.expectedCents ?? 0)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Semana</p>
          <p className="mt-1 font-display text-2xl font-bold text-foreground">
            {formatBRL(revenue.data?.week.completedCents ?? 0)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Previsto: {formatBRL(revenue.data?.week.expectedCents ?? 0)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Agendamentos</p>
          <p className="mt-1 font-display text-2xl font-bold text-foreground">
            {revenue.data?.day.appointments ?? items.length}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {revenue.data?.week.appointments ?? 0} na semana
          </p>
        </div>
      </div>

      {bookingUrl ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/40 p-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Sua página de reservas
            </p>
            <p className="truncate text-sm font-medium">{bookingUrl}</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(bookingUrl);
              toast.success("Link copiado!");
            }}
          >
            <Copy className="size-4" aria-hidden /> Copiar
          </Button>
        </div>
      ) : null}

      <PlanBenefitsBanner
        currentPlanCode={(panel.subscription?.plans as { code?: string } | null)?.code ?? null}
      />

      <div className="mt-6 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === f.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-secondary"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {agenda.isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p> : null}
        {!agenda.isLoading && visible.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nenhum agendamento nesse filtro.
          </p>
        ) : null}
        {visible.map((appointment) => {
          const professional = appointment.professionals as { name?: string } | null;
          const services = (appointment.appointment_services ?? []) as { service_name: string }[];
          const e164 = normalizeBrWhatsapp(appointment.client_whatsapp ?? "");
          const time = new Date(appointment.starts_at).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          });
          return (
            <article
              key={appointment.id}
              className="flex gap-4 rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-sm"
            >
              <div className="flex w-14 shrink-0 flex-col items-center border-r border-border pr-3">
                <span className="font-display text-lg font-bold leading-none text-foreground">
                  {time}
                </span>
                <span className="mt-1 text-[11px] text-muted-foreground">
                  {formatDuration(appointment.duration_minutes)}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-card-foreground">
                      {appointment.client_name}
                    </p>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {services.map((s) => s.service_name).join(" + ")}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      STATUS_STYLE[appointment.status] ?? "bg-secondary"
                    }`}
                  >
                    {STATUS_LABEL[appointment.status]}
                  </span>
                </div>

                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {formatBRL(appointment.total_price_cents)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="size-3.5" aria-hidden /> {professional?.name}
                  </span>
                  <span>{formatWhatsapp(appointment.client_whatsapp)}</span>
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {e164 ? (
                    <Button size="sm" variant="outline" asChild>
                      <a
                        href={whatsappLink(
                          e164,
                          `Olá, ${appointment.client_name}! Confirmando seu horário às ${time}.`,
                        )}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <MessageCircle className="size-4" aria-hidden /> WhatsApp
                      </a>
                    </Button>
                  ) : null}
                  {["PENDING", "CONFIRMED", "IN_PROGRESS"].includes(appointment.status) ? (
                    <>
                      {appointment.status === "PENDING" ? (
                        <Button
                          size="sm"
                          onClick={() =>
                            mutation.mutate({ appointmentId: appointment.id, status: "CONFIRMED" })
                          }
                        >
                          <Check className="size-4" aria-hidden /> Confirmar
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          mutation.mutate({ appointmentId: appointment.id, status: "COMPLETED" })
                        }
                      >
                        Concluir
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          mutation.mutate({ appointmentId: appointment.id, status: "CANCELED" })
                        }
                      >
                        <X className="size-4" aria-hidden /> Cancelar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          mutation.mutate({ appointmentId: appointment.id, status: "NO_SHOW" })
                        }
                      >
                        Não compareceu
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
