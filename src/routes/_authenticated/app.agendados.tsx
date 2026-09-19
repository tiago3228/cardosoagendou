import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { BellRing, CalendarClock, Clock, UserRound } from "lucide-react";
import { panelQuery, scheduledAppointmentsQuery, type ScheduledAppointmentAlert } from "./app";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app/agendados")({ component: ScheduledPage });

const statusLabel: Record<string, string> = {
  PENDING: "Agendado",
  CONFIRMED: "Confirmado",
  IN_PROGRESS: "Aguardando",
};
function serviceNames(appointment: ScheduledAppointmentAlert) {
  return (
    appointment.appointment_services?.map((service) => service.service_name).join(" + ") ||
    "Serviço não informado"
  );
}
function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  });
}
function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function ScheduledPage() {
  const { data: panel } = useSuspenseQuery(panelQuery);
  const scheduled = useQuery(scheduledAppointmentsQuery(panel.business!.id));
  const appointments = scheduled.data ?? [];
  return (
    <div>
      <BackButton />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BellRing className="size-6 text-primary" />
            <h1 className="font-display text-2xl font-bold">Clientes agendados</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhe os próximos clientes e os serviços escolhidos.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/app">Abrir agenda</Link>
        </Button>
      </div>
      <div
        className={`mt-5 rounded-xl border p-4 ${appointments.length ? "border-primary/30 bg-primary/5" : "border-emerald-500/30 bg-emerald-500/5"}`}
      >
        <p className="font-semibold">
          {appointments.length
            ? `${appointments.length} cliente(s) aguardando atendimento`
            : "Nenhum cliente agendado no momento"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {appointments.length
            ? "O contador do topo será atualizado conforme os status forem alterados na agenda."
            : "O botão do topo permanece verde enquanto a lista estiver vazia."}
        </p>
      </div>
      <div className="mt-5 space-y-3">
        {appointments.map((appointment) => (
          <article className="rounded-xl border border-border bg-card p-4" key={appointment.id}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <UserRound className="size-5" />
              </span>
              <div className="min-w-48 flex-1">
                <h2 className="font-semibold">{appointment.client_name}</h2>
                <p className="text-sm text-muted-foreground">{appointment.client_whatsapp}</p>
              </div>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                {statusLabel[appointment.status] ?? appointment.status}
              </span>
            </div>
            <div className="mt-4 grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
              <div className="flex items-center gap-2 text-sm">
                <CalendarClock className="size-4 text-primary" />
                <span className="capitalize">{formatDate(appointment.starts_at)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="size-4 text-primary" />
                {formatTime(appointment.starts_at)}
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Serviços escolhidos
                </p>
                <p className="mt-1 font-medium">{serviceNames(appointment)}</p>
              </div>
            </div>
          </article>
        ))}
        {!appointments.length && (
          <div className="rounded-xl border border-dashed border-border p-10 text-center">
            <BellRing className="mx-auto size-8 text-emerald-500" />
            <p className="mt-3 text-sm text-muted-foreground">
              Quando um cliente fizer um agendamento, ele aparecerá aqui automaticamente.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
