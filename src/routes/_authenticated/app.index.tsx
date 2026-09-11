import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  LayoutList,
  MessageCircle,
  TrendingUp,
  UserRound,
  X,
} from "lucide-react";
import { getAgenda } from "@/lib/panel.functions";
import { getAppointmentRevenue } from "@/lib/finance.functions";
import { setAppointmentStatus } from "@/lib/appointments.functions";
import { userFacingError } from "@/lib/user-facing-error";
import { panelQuery } from "./app";
import {
  formatBRL,
  formatDuration,
  formatWhatsapp,
  normalizeBrWhatsapp,
  whatsappLink,
} from "@/lib/format";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({
    meta: [
      { title: "Agenda profissional — Agendou" },
      { name: "description", content: "Agenda diária e semanal do seu negócio." },
      { property: "og:title", content: "Agenda profissional — Agendou" },
      { property: "og:description", content: "Agenda diária e semanal do seu negócio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgendaPage,
});

type ViewMode = "day" | "week";

type AppointmentItem = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  client_name: string;
  client_whatsapp: string;
  total_price_cents: number;
  duration_minutes: number;
  notes: string | null;
  blocks_agenda: boolean;
  professional_id: string;
  professionals: unknown;
  appointment_services: unknown;
};

const STATUS = {
  PENDING: {
    label: "Agendado",
    dot: "bg-status-scheduled",
    stripe: "border-status-scheduled",
    chip: "bg-status-scheduled/15 text-status-scheduled",
  },
  CONFIRMED: {
    label: "Confirmado",
    dot: "bg-status-confirmed",
    stripe: "border-status-confirmed",
    chip: "bg-status-confirmed/15 text-status-confirmed",
  },
  IN_PROGRESS: {
    label: "Aguardando",
    dot: "bg-status-waiting",
    stripe: "border-status-waiting",
    chip: "bg-status-waiting/15 text-status-waiting",
  },
  COMPLETED: {
    label: "Atendido",
    dot: "bg-status-attended",
    stripe: "border-status-attended",
    chip: "bg-status-attended/15 text-status-attended",
  },
  CANCELED: {
    label: "Cancelado",
    dot: "bg-status-canceled",
    stripe: "border-status-canceled",
    chip: "bg-status-canceled/15 text-status-canceled",
  },
  NO_SHOW: {
    label: "Faltou",
    dot: "bg-status-missed",
    stripe: "border-status-missed",
    chip: "bg-status-missed/15 text-status-missed",
  },
  RESCHEDULED: {
    label: "Reagendado",
    dot: "bg-status-rescheduled",
    stripe: "border-status-rescheduled",
    chip: "bg-status-rescheduled/15 text-status-rescheduled",
  },
} as const;

const FILTERS = [
  { key: "ALL", label: "Todos" },
  { key: "ACTIVE", label: "Ativos" },
  { key: "COMPLETED", label: "Atendidos" },
  { key: "CANCELED", label: "Cancelados" },
] as const;

function dateAtNoon(date: string) {
  return new Date(`${date}T12:00:00`);
}

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function shiftDay(date: string, days: number) {
  const next = dateAtNoon(date);
  next.setDate(next.getDate() + days);
  return toDateInput(next);
}

function startOfWeek(date: string) {
  const next = dateAtNoon(date);
  const weekday = next.getDay();
  next.setDate(next.getDate() - (weekday === 0 ? 6 : weekday - 1));
  return toDateInput(next);
}

function rangeBounds(date: string, mode: ViewMode) {
  const start = mode === "week" ? dateAtNoon(startOfWeek(date)) : dateAtNoon(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + (mode === "week" ? 7 : 1));
  return { from: start.toISOString(), to: end.toISOString() };
}

function statusMeta(status: string) {
  return STATUS[status as keyof typeof STATUS] ?? STATUS.PENDING;
}

function serviceNames(appointment: AppointmentItem) {
  const services = (appointment.appointment_services ?? []) as { service_name: string }[];
  return services.map((service) => service.service_name).join(" + ");
}

function professionalName(appointment: AppointmentItem) {
  return (appointment.professionals as { name?: string } | null)?.name ?? "Profissional";
}

function AgendaPage() {
  const { data: panel } = useSuspenseQuery(panelQuery);
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [view, setView] = useState<ViewMode>("day");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("ALL");
  const fetchAgenda = useServerFn(getAgenda);
  const fetchRevenue = useServerFn(getAppointmentRevenue);
  const changeStatus = useServerFn(setAppointmentStatus);
  const queryClient = useQueryClient();
  const bounds = rangeBounds(date, view);

  const agenda = useQuery({
    queryKey: ["agenda", view, bounds.from, bounds.to],
    queryFn: () => fetchAgenda({ data: bounds }),
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
      toast.error("Não foi possível atualizar", { description: userFacingError(error) }),
  });

  const origin = panel.publicOrigin ?? (typeof window !== "undefined" ? window.location.origin : "");
  const bookingUrl = panel.business && origin ? `${origin}/${panel.business.slug}` : "";
  const items = (agenda.data ?? []) as AppointmentItem[];
  const visible = useMemo(() => {
    if (filter === "ACTIVE")
      return items.filter((item) => ["PENDING", "CONFIRMED", "IN_PROGRESS"].includes(item.status));
    if (filter === "COMPLETED") return items.filter((item) => item.status === "COMPLETED");
    if (filter === "CANCELED")
      return items.filter((item) => ["CANCELED", "NO_SHOW", "RESCHEDULED"].includes(item.status));
    return items;
  }, [items, filter]);

  const weekStart = startOfWeek(date);
  const weekDays = Array.from({ length: 7 }, (_, index) => shiftDay(weekStart, index));
  const weekEnd = weekDays.at(-1) ?? weekStart;
  const dayLabel = dateAtNoon(date).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
  const rangeLabel = view === "day"
    ? dayLabel
    : `${dateAtNoon(weekStart).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} — ${dateAtNoon(weekEnd).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}`;

  function move(direction: number) {
    setDate(shiftDay(date, direction * (view === "week" ? 7 : 1)));
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-soft">
        <div className="border-b border-border p-4 md:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-md border border-primary/35 bg-primary/10 text-primary">
                <CalendarDays className="size-5" aria-hidden />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Agenda</h1>
                <p className="mt-0.5 text-sm capitalize text-muted-foreground">{rangeLabel}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-md border border-border bg-background/45 px-3 py-2.5">
              {Object.entries(STATUS).map(([key, meta]) => (
                <span key={key} className="flex items-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
                  <span className={`size-2.5 rounded-full ${meta.dot}`} aria-hidden />
                  {meta.label}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-1 rounded-md border border-border bg-background/50 p-1">
              <Button size="icon" variant="ghost" aria-label="Período anterior" onClick={() => move(-1)}>
                <ChevronLeft aria-hidden />
              </Button>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                aria-label="Data da agenda"
                className="h-9 min-w-0 flex-1 rounded-md border-0 bg-transparent px-2 text-sm text-foreground outline-none sm:w-40"
              />
              <Button size="icon" variant="ghost" aria-label="Próximo período" onClick={() => move(1)}>
                <ChevronRight aria-hidden />
              </Button>
              {date !== today ? (
                <Button size="sm" variant="ghost" onClick={() => setDate(today)}>Hoje</Button>
              ) : null}
            </div>

            <div className="grid grid-cols-2 rounded-md border border-border bg-background/50 p-1">
              <Button size="sm" variant={view === "day" ? "default" : "ghost"} onClick={() => setView("day")}>
                <LayoutList aria-hidden /> Dia
              </Button>
              <Button size="sm" variant={view === "week" ? "default" : "ghost"} onClick={() => setView("week")}>
                <CalendarDays aria-hidden /> Semana
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-px bg-border sm:grid-cols-3">
          <Metric label="Recebido no dia" value={formatBRL(revenue.data?.day.completedCents ?? 0)} detail={`Previsto: ${formatBRL(revenue.data?.day.expectedCents ?? 0)}`} accent />
          <Metric label="Recebido na semana" value={formatBRL(revenue.data?.week.completedCents ?? 0)} detail={`Previsto: ${formatBRL(revenue.data?.week.expectedCents ?? 0)}`} />
          <Metric label={view === "week" ? "Atendimentos na semana" : "Atendimentos no dia"} value={String(view === "week" ? visible.length : revenue.data?.day.appointments ?? items.length)} detail={`${revenue.data?.week.appointments ?? 0} na semana`} />
        </div>
      </section>

      {bookingUrl ? (
        <section className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Sua página de reservas</p>
            <p className="truncate text-sm font-medium">{bookingUrl}</p>
          </div>
          <Button size="sm" variant="outline" onClick={async () => {
            await navigator.clipboard.writeText(bookingUrl);
            toast.success("Link copiado!");
          }}>
            <Copy aria-hidden /> Copiar
          </Button>
        </section>
      ) : null}

      <section className="rounded-lg border border-border bg-card p-3 md:p-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((item) => (
            <Button key={item.key} size="sm" variant={filter === item.key ? "default" : "ghost"} onClick={() => setFilter(item.key)}>
              {item.label}
            </Button>
          ))}
        </div>

        {agenda.isLoading ? <p className="p-8 text-center text-sm text-muted-foreground">Carregando agenda...</p> : null}
        {!agenda.isLoading && visible.length === 0 ? (
          <div className="m-1 mt-4 rounded-lg border border-dashed border-border p-10 text-center">
            <CalendarDays className="mx-auto size-6 text-muted-foreground" aria-hidden />
            <p className="mt-3 text-sm font-medium">Nenhum atendimento nesse período.</p>
          </div>
        ) : null}
        {!agenda.isLoading && visible.length > 0 && view === "day" ? (
          <DayView appointments={visible} mutation={mutation} />
        ) : null}
        {!agenda.isLoading && visible.length > 0 && view === "week" ? (
          <WeekView appointments={visible} days={weekDays} selectedDate={date} onSelectDate={(day) => { setDate(day); setView("day"); }} />
        ) : null}
      </section>
    </div>
  );
}

function Metric({ label, value, detail, accent = false }: { label: string; value: string; detail: string; accent?: boolean }) {
  return (
    <div className="bg-card px-5 py-4">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
        {accent ? <TrendingUp className="size-3.5" aria-hidden /> : null}{label}
      </p>
      <p className={`mt-1 font-display text-2xl font-bold ${accent ? "text-primary" : "text-foreground"}`}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

type StatusMutation = {
  mutate: (input: { appointmentId: string; status: string }) => void;
};

function DayView({ appointments, mutation }: { appointments: AppointmentItem[]; mutation: StatusMutation }) {
  return (
    <div className="mt-4 space-y-2">
      <div className="hidden grid-cols-[92px_minmax(220px,1.4fr)_minmax(150px,1fr)_100px_130px] gap-4 px-4 pb-2 text-xs font-semibold uppercase text-muted-foreground lg:grid">
        <span>Horário</span><span>Cliente / serviço</span><span>Profissional</span><span>Duração</span><span>Status</span>
      </div>
      {appointments.map((appointment) => (
        <AppointmentRow key={appointment.id} appointment={appointment} mutation={mutation} />
      ))}
    </div>
  );
}

function AppointmentRow({ appointment, mutation }: { appointment: AppointmentItem; mutation: StatusMutation }) {
  const meta = statusMeta(appointment.status);
  const starts = new Date(appointment.starts_at);
  const time = starts.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const e164 = normalizeBrWhatsapp(appointment.client_whatsapp ?? "");

  return (
    <article className={`relative overflow-hidden rounded-lg border border-border border-l-[6px] bg-background/45 p-4 transition-colors hover:bg-secondary/45 ${meta.stripe}`}>
      <div className="grid gap-4 lg:grid-cols-[92px_minmax(220px,1.4fr)_minmax(150px,1fr)_100px_130px] lg:items-center">
        <div>
          <p className="font-display text-xl font-bold text-foreground">{time}</p>
          <p className="mt-1 text-xs text-muted-foreground">{formatBRL(appointment.total_price_cents)}</p>
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold text-card-foreground">{appointment.client_name}</p>
          <p className="mt-1 truncate text-sm text-muted-foreground">{serviceNames(appointment)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{formatWhatsapp(appointment.client_whatsapp)}</p>
        </div>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <UserRound className="size-4" aria-hidden /> {professionalName(appointment)}
        </p>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="size-4" aria-hidden /> {formatDuration(appointment.duration_minutes)}
        </p>
        <span className={`w-fit rounded-full px-3 py-1.5 text-xs font-semibold ${meta.chip}`}>{meta.label}</span>
      </div>

      {appointment.blocks_agenda === false ? (
        <p className="mt-3 text-xs font-medium text-accent">Simultâneo · não ocupa a agenda</p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
        {e164 ? (
          <Button size="sm" variant="outline" asChild>
            <a href={whatsappLink(e164, `Olá, ${appointment.client_name}! Confirmando seu horário às ${time}.`)} target="_blank" rel="noreferrer">
              <MessageCircle aria-hidden /> WhatsApp
            </a>
          </Button>
        ) : null}
        {appointment.status === "PENDING" ? (
          <Button size="sm" onClick={() => mutation.mutate({ appointmentId: appointment.id, status: "CONFIRMED" })}>
            <Check aria-hidden /> Confirmar
          </Button>
        ) : null}
        {["PENDING", "CONFIRMED", "IN_PROGRESS"].includes(appointment.status) ? (
          <>
            <Button size="sm" variant="outline" onClick={() => mutation.mutate({ appointmentId: appointment.id, status: "COMPLETED" })}>Concluir</Button>
            <Button size="sm" variant="ghost" onClick={() => mutation.mutate({ appointmentId: appointment.id, status: "CANCELED" })}><X aria-hidden /> Cancelar</Button>
            <Button size="sm" variant="ghost" onClick={() => mutation.mutate({ appointmentId: appointment.id, status: "NO_SHOW" })}>Não compareceu</Button>
          </>
        ) : null}
      </div>
    </article>
  );
}

function WeekView({ appointments, days, selectedDate, onSelectDate }: { appointments: AppointmentItem[]; days: string[]; selectedDate: string; onSelectDate: (day: string) => void }) {
  return (
    <div className="mt-4 overflow-x-auto">
      <div className="grid min-w-[980px] grid-cols-7 gap-2">
        {days.map((day) => {
          const dayItems = appointments.filter((appointment) => appointment.starts_at.slice(0, 10) === day);
          const label = dateAtNoon(day).toLocaleDateString("pt-BR", { weekday: "short" });
          return (
            <section key={day} className={`min-h-80 rounded-lg border p-2 ${day === selectedDate ? "border-primary bg-primary/5" : "border-border bg-background/35"}`}>
              <Button variant="ghost" className="h-auto w-full justify-between px-2 py-2" onClick={() => onSelectDate(day)}>
                <span className="capitalize text-muted-foreground">{label.replace(".", "")}</span>
                <span className={`flex size-8 items-center justify-center rounded-full font-display text-base ${day === selectedDate ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
                  {dateAtNoon(day).getDate()}
                </span>
              </Button>
              <div className="mt-2 space-y-2">
                {dayItems.length === 0 ? <p className="px-2 py-5 text-center text-xs text-muted-foreground">Livre</p> : null}
                {dayItems.map((appointment) => {
                  const meta = statusMeta(appointment.status);
                  const time = new Date(appointment.starts_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                  return (
                    <Button key={appointment.id} variant="ghost" onClick={() => onSelectDate(day)} className={`h-auto w-full justify-start rounded-md border border-border border-l-4 bg-card p-2.5 text-left hover:bg-secondary/60 ${meta.stripe}`}>
                      <span className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display text-sm font-bold">{time}</span>
                        <span className={`size-2 rounded-full ${meta.dot}`} aria-hidden />
                      </div>
                      <p className="mt-1 truncate text-xs font-semibold">{appointment.client_name}</p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{serviceNames(appointment)}</p>
                      <span className={`mt-2 inline-block rounded-full px-2 py-1 text-[10px] font-semibold ${meta.chip}`}>{meta.label}</span>
                      </span>
                    </Button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
