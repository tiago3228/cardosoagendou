import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  getAppointmentByManageToken,
  confirmAppointmentPresence,
  cancelAppointmentByManageToken,
} from "@/lib/appointment-manage.functions";
import { userFacingError } from "@/lib/user-facing-error";

export const Route = createFileRoute("/agendamento/$token")({
  loader: async ({ params }) => getAppointmentByManageToken({ data: { token: params.token } }),
  head: () => ({
    meta: [
      { title: "Gerenciar agendamento — Agendou" },
      {
        name: "description",
        content: "Confirme, reagende ou cancele seu atendimento.",
      },
      { property: "og:title", content: "Gerenciar agendamento — Agendou" },
      {
        property: "og:description",
        content: "Confirme, reagende ou cancele seu atendimento.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManageAppointmentPage,
});

function ManageAppointmentPage() {
  const { token } = Route.useParams();
  const appointment = Route.useLoaderData();
  const [currentStatus, setCurrentStatus] = useState(appointment?.status ?? null);
  const [allowCancel, setAllowCancel] = useState(appointment?.allow_cancel ?? false);
  const [allowReschedule, setAllowReschedule] = useState(appointment?.allow_reschedule ?? false);
  const [presence, setPresence] = useState(appointment?.presence_status ?? null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!appointment?.id) return;
    const channel = supabase
      .channel(`appointment-status-${appointment.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "appointments", filter: `id=eq.${appointment.id}` },
        (payload) => {
          const next = payload.new as { status?: string; presence_status?: string | null };
          if (next.status) setCurrentStatus(next.status);
          if (next.presence_status !== undefined) setPresence(next.presence_status);
          void getAppointmentByManageToken({ data: { token } }).then((fresh) => {
            if (!fresh) return;
            setAllowCancel(fresh.allow_cancel);
            setAllowReschedule(fresh.allow_reschedule);
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [appointment?.id]);

  if (!appointment) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0B0A08] px-5 text-center text-[#F2EDE4]">
        <div>
          <XCircle className="mx-auto size-12 text-red-300" />
          <h1 className="mt-4 font-display text-2xl font-bold">Link inválido ou expirado</h1>
          <p className="mt-2 text-sm text-[#9C948A]">Solicite um novo link ao estabelecimento.</p>
        </div>
      </main>
    );
  }

  async function updatePresence(value: "CONFIRMED" | "DECLINED") {
    setBusy(true);
    setMessage("");
    try {
      await confirmAppointmentPresence({ data: { token, presence: value } });
      setPresence(value);
      setMessage(
        value === "CONFIRMED" ? "Presença confirmada." : "Presença marcada como não confirmada.",
      );
    } catch (error) {
      setMessage(
        userFacingError(error, "Não foi possível atualizar."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function cancelAppointment() {
    if (!window.confirm("Deseja realmente cancelar este agendamento?")) return;
    setBusy(true);
    try {
      await cancelAppointmentByManageToken({ data: { token } });
      setMessage("Agendamento cancelado.");
    } catch (error) {
      setMessage(
        userFacingError(error, "Não foi possível cancelar."),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      className="manage-theme min-h-screen px-5 py-10 text-[var(--public-text)]"
      style={{
        "--public-primary": appointment.primary_color ?? "#B4884F",
        "--public-secondary": appointment.secondary_color ?? "#0B0A08",
        "--public-accent": appointment.primary_color ?? "#D1A66C",
        "--public-text": "#F2EDE4",
        "--public-muted": "#9C948A",
        "--public-surface": "#1E1B17",
        "--public-card": "#262220",
        "--public-border": "#35302A",
        backgroundColor: appointment.secondary_color ?? "#0B0A08",
      } as React.CSSProperties}
    >
      <section className="mx-auto max-w-md rounded-2xl border border-[var(--public-border)] bg-[var(--public-card)] p-6 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--public-primary)]">
          Agendamento
        </p>
        <h1 className="mt-2 font-display text-2xl font-bold">{appointment.business_name}</h1>
        <p className="mt-5 text-sm text-[var(--public-muted)]">Olá, {appointment.client_name}.</p>
        <div className="mt-4 rounded-xl border border-[var(--public-border)] bg-[var(--public-surface)] p-4">
          <div className="flex items-center gap-2 text-[var(--public-accent)]">
            <Clock className="size-4" />
            {new Date(appointment.starts_at).toLocaleString("pt-BR", {
              dateStyle: "full",
              timeStyle: "short",
            })}
          </div>
          <p className="mt-3 text-sm text-[var(--public-text)]">
            Status: <strong>{currentStatus}</strong>
          </p>
        </div>
        <h2 className="mt-6 font-display text-lg font-bold">Você vai comparecer?</h2>
        <div className="mt-3 grid gap-2">
          <Button
            disabled={busy || currentStatus !== "CONFIRMED"}
            onClick={() => void updatePresence("CONFIRMED")}
            className="bg-[var(--public-primary)] text-[var(--public-secondary)] hover:bg-[var(--public-accent)]"
          >
            <CheckCircle2 className="mr-2 size-4" />
            Confirmar presença
          </Button>
          <Button
            disabled={busy || currentStatus !== "CONFIRMED"}
            variant="outline"
            onClick={() => void updatePresence("DECLINED")}
            className="!border-[var(--public-primary)] !bg-[var(--public-text)] !text-[var(--public-surface)] hover:!bg-[var(--public-accent)] hover:!text-[var(--public-surface)]"
          >
            <XCircle className="mr-2 size-4" />
            Não poderei comparecer
          </Button>
        </div>
        {presence ? (
          <p className="mt-4 text-sm text-[var(--public-accent)]">
            Presença: {presence === "CONFIRMED" ? "confirmada" : "não confirmada"}.
          </p>
        ) : null}
        {message ? <p className="mt-4 text-sm text-[var(--public-accent)]">{message}</p> : null}
        <div className="mt-5 grid gap-2">
          <Button
            asChild
            variant="outline"
            disabled={busy || !allowReschedule}
            className="!border-[var(--public-primary)] !bg-[var(--public-text)] !text-[var(--public-surface)] hover:!bg-[var(--public-accent)] hover:!text-[var(--public-surface)]"
          >
            <a href={`/${appointment.business_slug}?reschedule=${encodeURIComponent(token)}`}>
              Reagendar
            </a>
          </Button>
          <Button
            variant="ghost"
            disabled={busy || !allowCancel || currentStatus !== "CONFIRMED"}
            onClick={() => void cancelAppointment()}
          >
            Cancelar agendamento
          </Button>
        </div>
        <p className="mt-6 text-xs leading-5 text-[var(--public-muted)]">
          As ações respeitam a antecedência configurada pelo estabelecimento.
        </p>
      </section>
    </main>
  );
}
