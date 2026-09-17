import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronDown, Mail, MessageCircle, Save, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { panelQuery } from "./app";
import { formatBRL, formatWhatsapp, normalizeBrWhatsapp, whatsappLink } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/BackButton";

export const Route = createFileRoute("/_authenticated/app/clientes")({ component: ClientsPage });

type Client = {
  id: string;
  name: string;
  whatsapp: string;
  email: string | null;
  birth_date: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
};
type Appointment = {
  id: string;
  starts_at: string;
  status: string;
  total_price_cents: number;
  notes: string | null;
  professionals: { name?: string } | null;
  appointment_services: { service_name: string; price_cents: number }[];
};
function dateLabel(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString("pt-BR") : "—";
}
function ClientsPage() {
  const { data: panel } = useSuspenseQuery(panelQuery);
  const businessId = panel.business!.id;
  const businessName = panel.business!.name;
  const recoveryDays = panel.business!.client_recovery_days ?? 60;
  const queryClient = useQueryClient();
  const [term, setTerm] = useState("");
  const [viewFilter, setViewFilter] = useState<"all" | "recovery">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const clients = useQuery({
    queryKey: ["clients", businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, whatsapp, email, birth_date, address, notes, created_at")
        .eq("business_id", businessId)
        .order("name");
      if (error) throw new Error(error.message);
      return data as Client[];
    },
  });
  const recoveryAppointments = useQuery({
    queryKey: ["client-recovery-appointments", businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("client_id, starts_at, status")
        .eq("business_id", businessId);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const saveClient = useMutation({
    mutationFn: async (input: {
      id: string;
      birth_date: string | null;
      address: string | null;
      notes: string | null;
    }) => {
      const { error } = await supabase
        .from("clients")
        .update(input)
        .eq("id", input.id)
        .eq("business_id", businessId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["clients", businessId] }),
  });
  const recoveryIds = useMemo(() => {
    const now = Date.now();
    const states = new Map<string, { last: number; next: boolean }>();
    for (const appointment of recoveryAppointments.data ?? []) {
      if (!appointment.client_id) continue;
      const state = states.get(appointment.client_id) ?? { last: 0, next: false };
      const time = new Date(appointment.starts_at).getTime();
      if (appointment.status === "COMPLETED") state.last = Math.max(state.last, time);
      if (!["COMPLETED", "CANCELED", "NO_SHOW"].includes(appointment.status) && time >= now)
        state.next = true;
      states.set(appointment.client_id, state);
    }
    return new Set(
      [...states]
        .filter(
          ([, state]) =>
            state.last > 0 && !state.next && now - state.last >= recoveryDays * 86400000,
        )
        .map(([id]) => id),
    );
  }, [recoveryAppointments.data, recoveryDays]);
  const filtered = (clients.data ?? []).filter(
    (client) =>
      (viewFilter === "all" || recoveryIds.has(client.id)) &&
      `${client.name} ${client.whatsapp} ${client.email ?? ""}`
        .toLowerCase()
        .includes(term.toLowerCase()),
  );
  return (
    <div>
      <BackButton />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            CRM · {clients.data?.length ?? 0} cadastrados
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{filtered.length}</span> encontrados
        </div>
      </div>
      <Input
        className="mt-5"
        placeholder="Buscar por nome, WhatsApp ou e-mail"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={viewFilter === "all" ? "default" : "outline"}
          onClick={() => setViewFilter("all")}
        >
          Todos os clientes
        </Button>
        <Button
          size="sm"
          variant={viewFilter === "recovery" ? "default" : "outline"}
          onClick={() => setViewFilter("recovery")}
        >
          Clientes em recuperação ({recoveryIds.size})
        </Button>
      </div>
      <ul className="mt-5 space-y-3">
        {filtered.map((client) => (
          <ClientCard
            key={client.id}
            client={client}
            businessName={businessName}
            recoveryDays={recoveryDays}
            isRecovery={recoveryIds.has(client.id)}
            expanded={expandedId === client.id}
            onToggle={() => setExpandedId(expandedId === client.id ? null : client.id)}
            onSave={(input) => saveClient.mutate(input)}
            saving={saveClient.isPending}
          />
        ))}
        {filtered.length === 0 ? (
          <li className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nenhum cliente encontrado. Clientes são criados automaticamente nos agendamentos.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
function ClientCard({
  client,
  businessName,
  recoveryDays,
  isRecovery,
  expanded,
  onToggle,
  onSave,
  saving,
}: {
  client: Client;
  businessName: string;
  recoveryDays: number;
  isRecovery: boolean;
  expanded: boolean;
  onToggle: () => void;
  onSave: (input: {
    id: string;
    birth_date: string | null;
    address: string | null;
    notes: string | null;
  }) => void;
  saving: boolean;
}) {
  const [birthDate, setBirthDate] = useState(client.birth_date ?? "");
  const [address, setAddress] = useState(client.address ?? "");
  const [notes, setNotes] = useState(client.notes ?? "");
  const appointments = useQuery({
    queryKey: ["client-appointments", client.id],
    enabled: expanded,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(
          "id, starts_at, status, total_price_cents, notes, professionals:professional_id(name), appointment_services(service_name, price_cents)",
        )
        .eq("client_id", client.id)
        .order("starts_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Appointment[];
    },
  });
  const history = appointments.data ?? [];
  const completed = history.filter((item) => item.status === "COMPLETED");
  const next = history.find(
    (item) =>
      !["COMPLETED", "CANCELED", "NO_SHOW"].includes(item.status) &&
      new Date(item.starts_at) >= new Date(),
  );
  const totalMoved = history.reduce((sum, item) => sum + item.total_price_cents, 0);
  const lastCompletedAt = completed[0]?.starts_at ? new Date(completed[0].starts_at).getTime() : 0;
  const isInRecovery =
    lastCompletedAt > 0 && Date.now() - lastCompletedAt >= recoveryDays * 86400000 && !next;
  const e164 = normalizeBrWhatsapp(client.whatsapp);
  const link = e164 ? whatsappLink(e164, `Olá, ${client.name}! Aqui é da ${businessName}.`) : null;
  return (
    <li
      className={`rounded-xl border bg-card p-4 transition-colors ${expanded ? "border-primary/50" : "border-border"}`}
    >
      <div
        role="button"
        tabIndex={0}
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") onToggle();
        }}
        aria-expanded={expanded}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UserRound className="size-5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-card-foreground">{client.name}</span>
            <span className="block text-sm text-muted-foreground">
              {formatWhatsapp(client.whatsapp)}
              {client.email ? ` · ${client.email}` : ""}
            </span>
            {isInRecovery ? (
              <span className="mt-1 inline-block rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700">
                Cliente em recuperação · {recoveryDays}+ dias
              </span>
            ) : null}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {isRecovery && e164 ? (
            <Button
              size="sm"
              variant="outline"
              asChild
              onClick={(event) => event.stopPropagation()}
            >
              <a
                href={whatsappLink(
                  e164,
                  `Olá, ${client.name}! Sentimos sua falta. Podemos ajudar você a agendar um novo atendimento?`,
                )}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle className="size-4" aria-hidden /> WhatsApp
              </a>
            </Button>
          ) : null}
          {isRecovery && client.email ? (
            <Button size="sm" variant="ghost" asChild onClick={(event) => event.stopPropagation()}>
              <a href={`mailto:${client.email}`}>
                <Mail className="size-4" aria-hidden />
              </a>
            </Button>
          ) : null}
          <ChevronDown
            className={`size-5 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
            aria-hidden
          />
        </span>
      </div>
      {expanded ? (
        <div className="mt-4 space-y-5 border-t border-border pt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Summary label="Primeiro atendimento" value={dateLabel(history.at(-1)?.starts_at)} />
            <Summary label="Último atendimento" value={dateLabel(completed[0]?.starts_at)} />
            <Summary label="Próximo agendamento" value={dateLabel(next?.starts_at)} />
            <Summary label="Total movimentado" value={formatBRL(totalMoved)} />
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
            <section className="rounded-lg border border-border p-4">
              <h2 className="font-semibold text-foreground">Dados do cliente</h2>
              <div className="mt-3 space-y-3">
                <label className="block text-sm">
                  <span className="text-muted-foreground">Data de nascimento</span>
                  <Input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-muted-foreground">Endereço</span>
                  <Input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Endereço do cliente"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-muted-foreground">Observações</span>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder="Preferências e informações importantes"
                  />
                </label>
                <Button
                  size="sm"
                  onClick={() =>
                    onSave({
                      id: client.id,
                      birth_date: birthDate || null,
                      address: address || null,
                      notes: notes || null,
                    })
                  }
                  disabled={saving}
                >
                  <Save className="size-4" aria-hidden /> Salvar ficha
                </Button>
              </div>
            </section>
            <section className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold text-foreground">Histórico de atendimentos</h2>
                <span className="text-sm text-muted-foreground">{history.length} registros</span>
              </div>
              <div className="mt-3 space-y-2">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-md border border-border bg-background/50 p-3 text-sm"
                  >
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="font-medium">
                        {dateLabel(item.starts_at)} ·{" "}
                        {item.appointment_services
                          .map((service) => service.service_name)
                          .join(" + ") || "Atendimento"}
                      </span>
                      <span className="text-muted-foreground">
                        {formatBRL(item.total_price_cents)}
                      </span>
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      {item.professionals?.name ?? "Profissional"} · {item.status}
                      {item.notes ? ` · ${item.notes}` : ""}
                    </p>
                  </div>
                ))}
                {history.length === 0 ? (
                  <p className="py-5 text-sm text-muted-foreground">
                    Nenhum atendimento registrado.
                  </p>
                ) : null}
              </div>
            </section>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>Cadastro: {dateLabel(client.created_at)}</span>
            {client.email ? (
              <a
                className="inline-flex items-center gap-1 text-primary hover:underline"
                href={`mailto:${client.email}`}
              >
                <Mail className="size-4" aria-hidden /> {client.email}
              </a>
            ) : null}
            {link ? (
              <Button size="sm" variant="outline" asChild>
                <a href={link} target="_blank" rel="noreferrer">
                  <MessageCircle className="size-4" aria-hidden /> WhatsApp
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}
function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold text-foreground">{value}</p>
    </div>
  );
}
