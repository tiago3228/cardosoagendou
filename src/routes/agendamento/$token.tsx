import { createFileRoute } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  getAppointmentByManageToken,
  confirmAppointmentPresence,
  cancelAppointmentByManageToken,
} from "@/lib/appointment-manage.functions";
import { userFacingError } from "@/lib/user-facing-error";

function statusLabel(status: string | null) {
  if (status === "CONFIRMED") return "Confirmado";
  if (status === "CANCELED") return "Cancelado";
  if (status === "COMPLETED") return "Concluído";
  if (status === "IN_PROGRESS") return "Em atendimento";
  return status ?? "—";
}

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
  const [showDeclineReason, setShowDeclineReason] = useState(false);
  const [declineChoice, setDeclineChoice] = useState<"choices" | "custom">("choices");
  const [declineReason, setDeclineReason] = useState("");

  useEffect(() => {
    if (!appointment?.id) return;
    const refreshAppointment = async () => {
      const fresh = await getAppointmentByManageToken({ data: { token } });
      if (!fresh) return;
      setCurrentStatus(fresh.status);
      setPresence(fresh.presence_status);
      setAllowCancel(fresh.allow_cancel);
      setAllowReschedule(fresh.allow_reschedule);
    };
    const channel = supabase
      .channel(`appointment-status-${appointment.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "appointments",
          filter: `id=eq.${appointment.id}`,
        },
        (payload) => {
          const next = payload.new as { status?: string; presence_status?: string | null };
          if (next.status) setCurrentStatus(next.status);
          if (next.presence_status !== undefined) setPresence(next.presence_status);
          void refreshAppointment();
        },
      )
      .subscribe();
    void refreshAppointment();
    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshAppointment();
    }, 2000);
    return () => {
      window.clearInterval(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [appointment?.id, token]);

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

  async function updatePresence(value: "CONFIRMED" | "DECLINED", reason?: string) {
    if (value === "DECLINED" && !reason?.trim()) {
      setMessage("Informe o motivo para confirmar o cancelamento.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await confirmAppointmentPresence({
        data: { token, presence: value, reason: reason?.trim() },
      });
      setPresence(value);
      if (value === "DECLINED") {
        setCurrentStatus("CANCELED");
        setAllowCancel(false);
        setAllowReschedule(false);
      }
      setMessage(
        value === "CONFIRMED"
          ? "Presença confirmada."
          : "Agendamento cancelado. O estabelecimento foi avisado de que você não poderá comparecer.",
      );
    } catch (error) {
      setMessage(userFacingError(error, "Não foi possível atualizar."));
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
      setMessage(userFacingError(error, "Não foi possível cancelar."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      className="manage-theme min-h-screen px-5 py-10 text-[var(--public-text)]"
      style={
        {
          "--public-primary": appointment.primary_color ?? "#B4884F",
          "--public-secondary": appointment.secondary_color ?? "#0B0A08",
          "--public-accent": appointment.primary_color ?? "#D1A66C",
          "--public-text": "#F2EDE4",
          "--public-muted": "#9C948A",
          "--public-surface": "#1E1B17",
          "--public-card": "#262220",
          "--public-border": "#35302A",
          backgroundColor: appointment.secondary_color ?? "#0B0A08",
        } as CSSProperties
      }
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
            Status: <strong>{statusLabel(currentStatus)}</strong>
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
            onClick={() => {
              setShowDeclineReason(true);
              setDeclineChoice("choices");
              setMessage("");
            }}
            className="!border-[var(--public-primary)] !bg-[var(--public-text)] !text-[var(--public-surface)] hover:!bg-[var(--public-accent)] hover:!text-[var(--public-surface)]"
          >
            <XCircle className="mr-2 size-4" />
            Não poderei comparecer
          </Button>
        </div>
        {showDeclineReason && currentStatus === "CONFIRMED" ? (
          <div className="mt-4 rounded-xl border border-[var(--public-border)] bg-[var(--public-surface)] p-4">
            {declineChoice === "choices" ? (
              <>
                <p className="text-sm font-semibold text-[var(--public-text)]">Qual motivo?</p>
                <p className="mt-1 text-xs text-[var(--public-muted)]">
                  Você pode cancelar sem informar detalhes ou explicar o motivo ao estabelecimento.
                </p>
                <div className="mt-3 grid gap-2">
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => void updatePresence("DECLINED", "Motivos pessoais")}
                    className="bg-[var(--public-primary)] text-[var(--public-secondary)] hover:bg-[var(--public-accent)]"
                  >
                    Motivos pessoais
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setDeclineChoice("custom")}
                    className="!border-[var(--public-primary)] !bg-transparent !text-[var(--public-text)] hover:!bg-[var(--public-primary)] hover:!text-[var(--public-secondary)]"
                  >
                    Informar motivo
                  </Button>
                </div>
              </>
            ) : (
              <>
                <label
                  htmlFor="decline-reason"
                  className="text-sm font-semibold text-[var(--public-text)]"
                >
                  Qual motivo?
                </label>
                <Textarea
                  id="decline-reason"
                  value={declineReason}
                  onChange={(event) => setDeclineReason(event.target.value)}
                  maxLength={500}
                  placeholder="Digite o motivo do cancelamento"
                  className="mt-2 min-h-24 border-[var(--public-border)] bg-[var(--public-card)] text-[var(--public-text)] placeholder:text-[var(--public-muted)]"
                />
              </>
            )}
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  if (declineChoice === "custom") setDeclineChoice("choices");
                  else setShowDeclineReason(false);
                  setDeclineReason("");
                  setMessage("");
                }}
                className="flex-1 !border-[var(--public-border)] !bg-transparent !text-[var(--public-text)]"
              >
                Voltar
              </Button>
              {declineChoice === "custom" ? (
                <Button
                  type="button"
                  disabled={busy || !declineReason.trim()}
                  onClick={() => void updatePresence("DECLINED", declineReason)}
                  className="flex-1 bg-[var(--public-primary)] text-[var(--public-secondary)] hover:bg-[var(--public-accent)]"
                >
                  Confirmar cancelamento
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
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
            className="text-[var(--public-text)] hover:bg-[var(--public-primary)]/15 hover:text-[var(--public-accent)]"
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
