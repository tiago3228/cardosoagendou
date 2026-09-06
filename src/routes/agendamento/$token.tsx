import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getAppointmentByManageToken,
  confirmAppointmentPresence,
  cancelAppointmentByManageToken,
} from "@/lib/appointment-manage.functions";

export const Route = createFileRoute("/agendamento/$token")({
  loader: async ({ params }) => getAppointmentByManageToken({ data: { token: params.token } }),
  component: ManageAppointmentPage,
});

function ManageAppointmentPage() {
  const { token } = Route.useParams();
  const appointment = Route.useLoaderData();
  const [presence, setPresence] = useState(appointment?.presence_status ?? null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

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
        error instanceof Error
          ? error.message.replace(/^[A-Z_]+:\s*/, "")
          : "Não foi possível atualizar.",
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
        error instanceof Error
          ? error.message.replace(/^[A-Z_]+:\s*/, "")
          : "Não foi possível cancelar.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0B0A08] px-5 py-10 text-[#F2EDE4]">
      <section className="mx-auto max-w-md rounded-2xl border border-[#35302A] bg-[#14120F] p-6 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#B4884F]">
          Agendamento
        </p>
        <h1 className="mt-2 font-display text-2xl font-bold">{appointment.business_name}</h1>
        <p className="mt-5 text-sm text-[#9C948A]">Olá, {appointment.client_name}.</p>
        <div className="mt-4 rounded-xl border border-[#35302A] bg-[#1E1B17] p-4">
          <div className="flex items-center gap-2 text-[#D1A66C]">
            <Clock className="size-4" />
            {new Date(appointment.starts_at).toLocaleString("pt-BR", {
              dateStyle: "full",
              timeStyle: "short",
            })}
          </div>
          <p className="mt-3 text-sm text-[#F2EDE4]">
            Status: <strong>{appointment.status}</strong>
          </p>
        </div>
        <h2 className="mt-6 font-display text-lg font-bold">Você vai comparecer?</h2>
        <div className="mt-3 grid gap-2">
          <Button
            disabled={busy || appointment.status !== "CONFIRMED"}
            onClick={() => void updatePresence("CONFIRMED")}
            className="bg-[#B4884F] text-[#14120F] hover:bg-[#D1A66C]"
          >
            <CheckCircle2 className="mr-2 size-4" />
            Confirmar presença
          </Button>
          <Button
            disabled={busy || appointment.status !== "CONFIRMED"}
            variant="outline"
            onClick={() => void updatePresence("DECLINED")}
            className="!border-[#B4884F] !bg-[#F2EDE4] !text-[#1E1B17] hover:!bg-[#E7D7C2] hover:!text-[#1E1B17]"
          >
            <XCircle className="mr-2 size-4" />
            Não poderei comparecer
          </Button>
        </div>
        {presence ? (
          <p className="mt-4 text-sm text-[#D1A66C]">
            Presença: {presence === "CONFIRMED" ? "confirmada" : "não confirmada"}.
          </p>
        ) : null}
        {message ? <p className="mt-4 text-sm text-[#D1A66C]">{message}</p> : null}
        <div className="mt-5 grid gap-2">
          <Button
            asChild
            variant="outline"
            disabled={busy || !appointment.allow_reschedule}
            className="!border-[#B4884F] !bg-[#F2EDE4] !text-[#1E1B17] hover:!bg-[#E7D7C2] hover:!text-[#1E1B17]"
          >
            <a href={`/${appointment.business_slug}`}>Reagendar</a>
          </Button>
          <Button
            variant="ghost"
            disabled={busy || !appointment.allow_cancel || appointment.status !== "CONFIRMED"}
            onClick={() => void cancelAppointment()}
          >
            Cancelar agendamento
          </Button>
        </div>
        <p className="mt-6 text-xs leading-5 text-[#9C948A]">
          As ações respeitam a antecedência configurada pelo estabelecimento.
        </p>
      </section>
    </main>
  );
}
