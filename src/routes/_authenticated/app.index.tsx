import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Check, Clock, Copy, X } from "lucide-react";
import { getAgenda } from "@/lib/panel.functions";
import { setAppointmentStatus } from "@/lib/appointments.functions";
import { panelQuery } from "./app";
import { formatBRL, formatDuration, formatWhatsapp } from "@/lib/format";
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

function dayBounds(date: string) {
  const from = new Date(`${date}T00:00:00`);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

function AgendaPage() {
  const { data: panel } = useSuspenseQuery(panelQuery);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const fetchAgenda = useServerFn(getAgenda);
  const changeStatus = useServerFn(setAppointmentStatus);
  const queryClient = useQueryClient();

  const agenda = useQuery({
    queryKey: ["agenda", date],
    queryFn: () => fetchAgenda({ data: dayBounds(date) }),
  });

  const mutation = useMutation({
    mutationFn: (input: { appointmentId: string; status: string }) =>
      changeStatus({ data: input as never }),
    onSuccess: () => {
      toast.success("Agendamento atualizado");
      queryClient.invalidateQueries({ queryKey: ["agenda"] });
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
  const revenue = items
    .filter((a) => a.status === "COMPLETED")
    .reduce((sum, a) => sum + a.total_price_cents, 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Agenda</h1>
          <p className="text-sm text-muted-foreground">
            {items.length} agendamento(s) · {formatBRL(revenue)} concluído
          </p>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        />
      </div>

      {bookingUrl ? (
        <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/40 p-4">
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
        currentPlanCode={
          (panel.subscription?.plans as { code?: string } | null)?.code ?? null
        }
      />

      <div className="mt-6 space-y-3">
        {agenda.isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p> : null}
        {!agenda.isLoading && items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nenhum agendamento nesse dia.
          </p>
        ) : null}
        {items.map((appointment) => {
          const professional = appointment.professionals as { name?: string } | null;
          const services = (appointment.appointment_services ?? []) as { service_name: string }[];
          return (
            <article key={appointment.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-card-foreground">
                    {new Date(appointment.starts_at).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · {appointment.client_name}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {services.map((s) => s.service_name).join(", ")}
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="size-3.5" aria-hidden />
                    {formatDuration(appointment.duration_minutes)} ·{" "}
                    {formatBRL(appointment.total_price_cents)} · {professional?.name}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatWhatsapp(appointment.client_whatsapp)}
                  </p>
                </div>
                <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                  {STATUS_LABEL[appointment.status]}
                </span>
              </div>

              {["PENDING", "CONFIRMED", "IN_PROGRESS"].includes(appointment.status) ? (
                <div className="mt-3 flex flex-wrap gap-2">
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
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
