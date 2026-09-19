import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Archive,
  ArrowRight,
  Check,
  CheckCircle2,
  MessageCircle,
  Plus,
  Search,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { panelQuery, entitlementsQuery } from "./app";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/app/crm")({ component: CrmPage });

// As tabelas novas ainda não estão no arquivo gerado pelo Supabase; o adaptador fica isolado aqui.
const db = supabase as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (fn: string, args: Record<string, unknown>) => any;
};

type Tab = "dashboard" | "leads" | "pipeline" | "followups" | "retention";
type Stage = (typeof STAGES)[number]["key"];
type Lead = {
  id: string;
  name: string;
  whatsapp: string | null;
  email: string | null;
  source: string | null;
  stage: Stage;
  estimated_value_cents: number;
  client_id: string | null;
  notes: string | null;
};
type Client = {
  id: string;
  name: string;
  whatsapp: string;
  email: string | null;
  notes: string | null;
};
type FollowUp = {
  id: string;
  title: string;
  description: string | null;
  due_at: string;
  status: string;
  lead_id: string | null;
  client_id: string | null;
  leads?: { name: string } | null;
  clients?: { name: string } | null;
};
type RetentionClient = {
  id: string;
  name: string;
  whatsapp: string;
  email: string | null;
  last_attended: string | null;
  next_visit: string | null;
  total_spent_cents: number;
  visit_count: number;
  segment: "new" | "recurring" | "vip" | "inactive";
};
type Interaction = {
  id: string;
  subject: string | null;
  description: string | null;
  content: string | null;
  occurred_at: string | null;
  created_at: string;
};
const STAGES = [
  { key: "novo_lead", label: "Novo lead" },
  { key: "primeiro_contato", label: "Primeiro contato" },
  { key: "interessado", label: "Interessado" },
  { key: "orcamento_enviado", label: "Orçamento enviado" },
  { key: "aguardando_resposta", label: "Aguardando resposta" },
  { key: "agendou", label: "Agendou" },
  { key: "compareceu", label: "Compareceu" },
  { key: "converteu", label: "Converteu" },
  { key: "fidelizado", label: "Fidelizado" },
  { key: "perdido", label: "Perdido" },
] as const;
const stageName = (key: string) => STAGES.find((stage) => stage.key === key)?.label ?? key;
const money = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = (value: string | null) => (value ? new Date(value).toLocaleString("pt-BR") : "—");

function CrmPage() {
  const { data: panel } = useSuspenseQuery(panelQuery);
  const { data: entitlements } = useSuspenseQuery(entitlementsQuery);
  const enabled = (entitlements?.features as Record<string, unknown> | undefined)?.["crm"] === true;
  if (!enabled)
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <BackButton />
        <h1 className="font-display text-2xl font-bold">CRM</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          O módulo CRM está disponível no Plano Ilimitado.
        </p>
        <Button asChild className="mt-4">
          <Link to="/app/assinatura">Conhecer o Plano Ilimitado</Link>
        </Button>
      </div>
    );
  return <AdvancedCrm businessId={panel.business!.id} />;
}

function AdvancedCrm({ businessId }: { businessId: string }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [term, setTerm] = useState("");
  const clients = useQuery({
    queryKey: ["crm-clients", businessId],
    queryFn: async () => {
      const { data, error } = await db
        .from("clients")
        .select("id,name,whatsapp,email,notes")
        .eq("business_id", businessId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Client[];
    },
  });
  const leads = useQuery({
    queryKey: ["crm-leads", businessId],
    queryFn: async () => {
      const { data, error } = await db
        .from("crm_leads")
        .select("id,name,whatsapp,email,source,stage,estimated_value_cents,client_id,notes")
        .eq("business_id", businessId)
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });
  const followUps = useQuery({
    queryKey: ["crm-followups", businessId],
    queryFn: async () => {
      const { data, error } = await db
        .from("crm_follow_ups")
        .select("*, leads(name), clients(name)")
        .eq("business_id", businessId)
        .eq("status", "PENDING")
        .order("due_at")
        .limit(300);
      if (error) throw error;
      return (data ?? []) as FollowUp[];
    },
  });
  const interactions = useQuery({
    queryKey: ["crm-interactions", businessId],
    queryFn: async () => {
      const { data, error } = await db
        .from("crm_interactions")
        .select("id,lead_id,client_id,type,subject,description,result,occurred_at,created_at")
        .eq("business_id", businessId)
        .order("occurred_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
  const retention = useQuery({
    queryKey: ["crm-retention", businessId],
    queryFn: async () => {
      const { data, error } = await db.rpc("crm_retention_snapshot", { _business_id: businessId });
      if (error) throw error;
      return (data ?? []) as RetentionClient[];
    },
  });
  const [leadForm, setLeadForm] = useState({
    name: "",
    whatsapp: "",
    email: "",
    source: "",
    estimated_value_cents: "",
    notes: "",
  });
  const [followForm, setFollowForm] = useState({
    title: "",
    description: "",
    due_at: "",
    client_id: "",
    lead_id: "",
  });
  const [interaction, setInteraction] = useState({ text: "", leadId: "" });
  const invalidate = () => {
    for (const key of ["crm-leads", "crm-followups", "crm-interactions", "crm-retention"])
      void qc.invalidateQueries({ queryKey: [key, businessId] });
  };
  const addLead = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("crm_leads").insert({
        business_id: businessId,
        name: leadForm.name.trim(),
        whatsapp: leadForm.whatsapp || null,
        email: leadForm.email || null,
        source: leadForm.source || null,
        notes: leadForm.notes || null,
        estimated_value_cents: Math.round(
          Number(leadForm.estimated_value_cents.replace(",", ".") || 0) * 100,
        ),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setLeadForm({
        name: "",
        whatsapp: "",
        email: "",
        source: "",
        estimated_value_cents: "",
        notes: "",
      });
      invalidate();
      toast.success("Lead criado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const addFollowUp = useMutation({
    mutationFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await db.from("crm_follow_ups").insert({
        business_id: businessId,
        title: followForm.title.trim(),
        description: followForm.description || null,
        due_at: new Date(followForm.due_at).toISOString(),
        client_id: followForm.client_id || null,
        lead_id: followForm.lead_id || null,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setFollowForm({ title: "", description: "", due_at: "", client_id: "", lead_id: "" });
      invalidate();
      toast.success("Follow-up criado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const filteredLeads = useMemo(
    () =>
      (leads.data ?? []).filter((lead) =>
        `${lead.name} ${lead.whatsapp ?? ""} ${lead.email ?? ""} ${lead.source ?? ""}`
          .toLowerCase()
          .includes(term.toLowerCase()),
      ),
    [leads.data, term],
  );
  const moveLead = async (lead: Lead, stage: Stage) => {
    const { error } = await db
      .from("crm_leads")
      .update({ stage })
      .eq("id", lead.id)
      .eq("business_id", businessId);
    if (error) toast.error(error.message);
    else {
      invalidate();
      toast.success("Etapa atualizada");
    }
  };
  const convertLead = async (lead: Lead) => {
    const { data, error } = await db.rpc("crm_convert_lead", { _lead_id: lead.id });
    if (error) toast.error(error.message);
    else {
      invalidate();
      toast.success(`${data?.name ?? lead.name} convertido em cliente`);
    }
  };
  const finishFollowUp = async (id: string) => {
    const { error } = await db
      .from("crm_follow_ups")
      .update({ status: "DONE", completed_at: new Date().toISOString() })
      .eq("id", id)
      .eq("business_id", businessId);
    if (error) toast.error(error.message);
    else {
      invalidate();
      toast.success("Follow-up concluído");
    }
  };
  const addInteraction = async () => {
    if (!interaction.text.trim()) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await db.from("crm_interactions").insert({
      business_id: businessId,
      lead_id: interaction.leadId || null,
      type: "NOTE",
      subject: "Contato registrado",
      content: interaction.text.trim(),
      description: interaction.text.trim(),
      created_by: user?.id,
    });
    if (error) toast.error(error.message);
    else {
      setInteraction({ text: "", leadId: "" });
      invalidate();
      toast.success("Interação registrada");
    }
  };
  const openWhatsApp = (client: RetentionClient) => {
    const digits = client.whatsapp?.replace(/\D/g, "");
    if (!digits || digits.length < 10) return toast.error("Cliente sem WhatsApp válido");
    const text = `Olá, ${client.name}! Sentimos sua falta. Gostaria de verificar nossos horários disponíveis?`;
    window.open(
      `https://wa.me/${digits}?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };
  const metrics = {
    total: leads.data?.length ?? 0,
    converted:
      leads.data?.filter((lead) => ["converteu", "fidelizado"].includes(lead.stage)).length ?? 0,
    lost: leads.data?.filter((lead) => lead.stage === "perdido").length ?? 0,
    pending: followUps.data?.length ?? 0,
  };
  return (
    <div>
      <BackButton />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">CRM</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe a jornada completa dos seus leads e clientes.
          </p>
        </div>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
          Plano Ilimitado
        </span>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {(
          [
            ["dashboard", "Dashboard"],
            ["leads", "Leads"],
            ["pipeline", "Funil"],
            ["followups", "Follow-ups"],
            ["retention", "Retenção"],
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <Button
            key={value}
            size="sm"
            variant={tab === value ? "default" : "outline"}
            onClick={() => setTab(value)}
          >
            {label}
          </Button>
        ))}
      </div>
      {tab === "dashboard" ? (
        <Dashboard
          metrics={metrics}
          interactions={interactions.data ?? []}
          retention={retention.data ?? []}
          setTab={setTab}
        />
      ) : null}
      {tab === "leads" ? (
        <LeadsTab
          leads={filteredLeads}
          term={term}
          setTerm={setTerm}
          onConvert={convertLead}
          onMove={moveLead}
          onInteraction={(id) => setInteraction({ ...interaction, leadId: id })}
        />
      ) : null}
      {tab === "pipeline" ? (
        <PipelineTab leads={filteredLeads} onMove={moveLead} onConvert={convertLead} />
      ) : null}
      {tab === "followups" ? (
        <FollowUpsTab
          followUps={followUps.data ?? []}
          clients={clients.data ?? []}
          leads={leads.data ?? []}
          form={followForm}
          setForm={setFollowForm}
          onCreate={() => addFollowUp.mutate()}
          onFinish={finishFollowUp}
          pending={addFollowUp.isPending}
        />
      ) : null}
      {tab === "retention" ? (
        <RetentionTab clients={retention.data ?? []} onWhatsApp={openWhatsApp} />
      ) : null}
      <section className="mt-6 rounded-xl border border-border bg-card p-4">
        <h2 className="font-semibold">Registrar contato rápido</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-[220px_1fr_auto]">
          <select
            className="rounded-md border bg-background px-3"
            value={interaction.leadId}
            onChange={(e) => setInteraction({ ...interaction, leadId: e.target.value })}
          >
            <option value="">Selecione um lead</option>
            {(leads.data ?? []).map((lead) => (
              <option key={lead.id} value={lead.id}>
                {lead.name}
              </option>
            ))}
          </select>
          <Input
            placeholder="Descreva o contato, resultado ou próxima ação"
            value={interaction.text}
            onChange={(e) => setInteraction({ ...interaction, text: e.target.value })}
          />
          <Button onClick={() => void addInteraction()}>
            <Plus className="size-4" /> Registrar
          </Button>
        </div>
      </section>
      {tab === "leads" || tab === "pipeline" ? (
        <section className="mt-4 rounded-xl border border-border bg-card p-4">
          <h2 className="font-semibold">Novo lead</h2>
          <form
            className="mt-3 grid gap-2 md:grid-cols-6"
            onSubmit={(e) => {
              e.preventDefault();
              addLead.mutate();
            }}
          >
            <Input
              required
              placeholder="Nome"
              value={leadForm.name}
              onChange={(e) => setLeadForm({ ...leadForm, name: e.target.value })}
            />
            <Input
              placeholder="WhatsApp"
              value={leadForm.whatsapp}
              onChange={(e) => setLeadForm({ ...leadForm, whatsapp: e.target.value })}
            />
            <Input
              placeholder="E-mail"
              value={leadForm.email}
              onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })}
            />
            <Input
              placeholder="Origem"
              value={leadForm.source}
              onChange={(e) => setLeadForm({ ...leadForm, source: e.target.value })}
            />
            <Input
              inputMode="decimal"
              placeholder="Valor potencial"
              value={leadForm.estimated_value_cents}
              onChange={(e) => setLeadForm({ ...leadForm, estimated_value_cents: e.target.value })}
            />
            <Button type="submit" disabled={addLead.isPending}>
              <Plus className="size-4" /> Criar lead
            </Button>
            <Textarea
              className="md:col-span-6"
              placeholder="Observações"
              value={leadForm.notes}
              onChange={(e) => setLeadForm({ ...leadForm, notes: e.target.value })}
            />
          </form>
        </section>
      ) : null}
    </div>
  );
}

function Dashboard({
  metrics,
  interactions,
  retention,
  setTab,
}: {
  metrics: { total: number; converted: number; lost: number; pending: number };
  interactions: Interaction[];
  retention: RetentionClient[];
  setTab: (tab: Tab) => void;
}) {
  return (
    <section className="mt-5 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Leads cadastrados", metrics.total],
          ["Leads convertidos", metrics.converted],
          ["Leads perdidos", metrics.lost],
          ["Follow-ups pendentes", metrics.pending],
        ].map(([label, value]) => (
          <button
            type="button"
            key={String(label)}
            onClick={() =>
              setTab(
                label === "Follow-ups pendentes"
                  ? "followups"
                  : label === "Leads perdidos"
                    ? "pipeline"
                    : "leads",
              )
            }
            className="rounded-xl border border-border bg-card p-4 text-left hover:border-primary/50"
          >
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
          </button>
        ))}
      </div>
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-display text-lg font-semibold">Jornada do cliente</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Lead → primeiro contato → agendamento → atendimento → fidelização
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {STAGES.slice(0, 9).map((stage, index) => (
            <div className="flex items-center gap-2" key={stage.key}>
              <span className="rounded-full border border-border px-2.5 py-1 text-xs">
                {stage.label}
              </span>
              {index < 8 ? <ArrowRight className="size-3 text-muted-foreground" /> : null}
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">Atividades recentes</h2>
          <div className="mt-3 divide-y divide-border">
            {interactions.slice(0, 6).map((item) => (
              <div className="flex gap-3 py-3" key={item.id}>
                <MessageCircle className="mt-1 size-4 text-primary" />
                <div>
                  <p className="text-sm">{item.subject ?? "Contato registrado"}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.description ?? item.content} ·{" "}
                    {dateTime(item.occurred_at ?? item.created_at)}
                  </p>
                </div>
              </div>
            ))}
            {interactions.length === 0 ? (
              <p className="py-5 text-sm text-muted-foreground">Nenhum contato registrado.</p>
            ) : null}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">Segmentação atual</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(["new", "recurring", "vip", "inactive"] as const).map((segment) => (
              <div key={segment} className="rounded-lg bg-secondary/40 p-3">
                <p className="text-xs text-muted-foreground">
                  {segment === "new"
                    ? "Novos"
                    : segment === "recurring"
                      ? "Recorrentes"
                      : segment === "vip"
                        ? "VIP"
                        : "Inativos"}
                </p>
                <p className="mt-1 text-xl font-semibold">
                  {retention.filter((client) => client.segment === segment).length}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function LeadsTab({
  leads,
  term,
  setTerm,
  onConvert,
  onMove,
  onInteraction,
}: {
  leads: Lead[];
  term: string;
  setTerm: (v: string) => void;
  onConvert: (lead: Lead) => void;
  onMove: (lead: Lead, stage: Stage) => void;
  onInteraction: (id: string) => void;
}) {
  return (
    <section className="mt-5 space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por nome, WhatsApp, e-mail ou origem"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
      </div>
      <div className="divide-y divide-border rounded-xl border border-border bg-card">
        {leads.map((lead) => (
          <div className="flex flex-wrap items-center gap-3 p-4" key={lead.id}>
            <UserRound className="size-5 text-primary" />
            <div className="min-w-44 flex-1">
              <p className="font-medium">{lead.name}</p>
              <p className="text-xs text-muted-foreground">
                {lead.whatsapp ?? lead.email ?? "Sem contato"}
                {lead.source ? ` · ${lead.source}` : ""}
              </p>
            </div>
            <span className="rounded-full bg-secondary px-2.5 py-1 text-xs">
              {stageName(lead.stage)}
            </span>
            <span className="text-sm font-medium">{money(lead.estimated_value_cents)}</span>
            <Button size="sm" variant="outline" onClick={() => onInteraction(lead.id)}>
              <MessageCircle className="size-4" /> Contato
            </Button>
            {!["converteu", "fidelizado"].includes(lead.stage) ? (
              <Button size="sm" onClick={() => onConvert(lead)}>
                Converter
              </Button>
            ) : null}
            <Button
              size="icon"
              variant="ghost"
              title="Arquivar"
              onClick={() => onMove(lead, "perdido")}
            >
              <Archive className="size-4" />
            </Button>
          </div>
        ))}
        {leads.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">Nenhum lead encontrado.</p>
        ) : null}
      </div>
    </section>
  );
}

function PipelineTab({
  leads,
  onMove,
  onConvert,
}: {
  leads: Lead[];
  onMove: (lead: Lead, stage: Stage) => void;
  onConvert: (lead: Lead) => void;
}) {
  return (
    <section className="mt-5 flex gap-3 overflow-x-auto pb-4">
      {STAGES.map((stage) => (
        <div
          className="min-w-64 flex-1 rounded-xl border border-border bg-secondary/20 p-3"
          key={stage.key}
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{stage.label}</h3>
            <span className="text-xs text-muted-foreground">
              {leads.filter((lead) => lead.stage === stage.key).length}
            </span>
          </div>
          <div className="space-y-2">
            {leads
              .filter((lead) => lead.stage === stage.key)
              .map((lead) => (
                <article className="rounded-lg border border-border bg-card p-3" key={lead.id}>
                  <p className="font-medium">{lead.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {lead.whatsapp ?? lead.email ?? "Sem contato"}
                  </p>
                  <p className="mt-1 text-xs font-medium text-primary">
                    {money(lead.estimated_value_cents)}
                  </p>
                  <select
                    className="mt-3 w-full rounded border bg-background p-1 text-xs"
                    value={lead.stage}
                    onChange={(e) => onMove(lead, e.target.value as Stage)}
                  >
                    {STAGES.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {!["converteu", "fidelizado", "perdido"].includes(lead.stage) ? (
                    <Button className="mt-2 w-full" size="sm" onClick={() => onConvert(lead)}>
                      Converter em cliente
                    </Button>
                  ) : null}
                </article>
              ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function FollowUpsTab({
  followUps,
  clients,
  leads,
  form,
  setForm,
  onCreate,
  onFinish,
  pending,
}: {
  followUps: FollowUp[];
  clients: Client[];
  leads: Lead[];
  form: { title: string; description: string; due_at: string; client_id: string; lead_id: string };
  setForm: (form: {
    title: string;
    description: string;
    due_at: string;
    client_id: string;
    lead_id: string;
  }) => void;
  onCreate: () => void;
  onFinish: (id: string) => void;
  pending: boolean;
}) {
  return (
    <section className="mt-5">
      <form
        className="grid gap-2 rounded-xl border border-border bg-card p-4 md:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault();
          onCreate();
        }}
      >
        <Input
          required
          placeholder="Próxima ação"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        <select
          className="rounded-md border bg-background px-3"
          value={form.lead_id}
          onChange={(e) => setForm({ ...form, lead_id: e.target.value, client_id: "" })}
        >
          <option value="">Lead relacionado</option>
          {leads.map((lead) => (
            <option key={lead.id} value={lead.id}>
              {lead.name}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border bg-background px-3"
          value={form.client_id}
          onChange={(e) => setForm({ ...form, client_id: e.target.value, lead_id: "" })}
        >
          <option value="">Cliente relacionado</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
        <Input
          required
          type="datetime-local"
          value={form.due_at}
          onChange={(e) => setForm({ ...form, due_at: e.target.value })}
        />
        <Button type="submit" disabled={pending}>
          <Plus className="size-4" /> Criar
        </Button>
        <Textarea
          className="md:col-span-5"
          placeholder="Descrição"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </form>
      <div className="mt-4 space-y-2">
        {followUps.map((item) => (
          <div
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4"
            key={item.id}
          >
            <div
              className={`grid size-9 place-items-center rounded-full ${new Date(item.due_at).getTime() < Date.now() ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}
            >
              <CheckCircle2 className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{item.title}</p>
              <p className="text-xs text-muted-foreground">
                {item.leads?.name ?? item.clients?.name ?? "Sem vínculo"} · {dateTime(item.due_at)}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => onFinish(item.id)}>
              <Check className="size-4" /> Concluir
            </Button>
          </div>
        ))}
        {followUps.length === 0 ? (
          <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            Nenhum follow-up pendente.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function RetentionTab({
  clients,
  onWhatsApp,
}: {
  clients: RetentionClient[];
  onWhatsApp: (client: RetentionClient) => void;
}) {
  const [segment, setSegment] = useState<RetentionClient["segment"] | "all">("inactive");
  const filtered = clients.filter((client) => segment === "all" || client.segment === segment);
  return (
    <section className="mt-5 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(["inactive", "new", "recurring", "vip"] as const).map((key) => (
          <button
            type="button"
            key={key}
            className={`rounded-xl border p-4 text-left ${segment === key ? "border-primary bg-primary/5" : "border-border bg-card"}`}
            onClick={() => setSegment(key)}
          >
            <p className="text-xs text-muted-foreground">
              {key === "inactive"
                ? "Clientes inativos"
                : key === "new"
                  ? "Clientes novos"
                  : key === "recurring"
                    ? "Recorrentes"
                    : "VIP"}
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {clients.filter((client) => client.segment === key).length}
            </p>
          </button>
        ))}
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Segmento: {segment === "all" ? "Todos" : segment}</h2>
            <p className="text-sm text-muted-foreground">
              Última visita, frequência e valor movimentado por cliente.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setSegment("all")}>
            Ver todos
          </Button>
        </div>
        <div className="space-y-2">
          {filtered.map((client) => (
            <div
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3"
              key={client.id}
            >
              <UserRound className="size-5 text-primary" />
              <div className="min-w-44 flex-1">
                <p className="font-medium">{client.name}</p>
                <p className="text-xs text-muted-foreground">
                  Última visita: {dateTime(client.last_attended)} · {client.visit_count}{" "}
                  atendimento(s)
                </p>
              </div>
              <span className="text-sm font-semibold">{money(client.total_spent_cents)}</span>
              {client.whatsapp ? (
                <Button size="sm" variant="outline" onClick={() => onWhatsApp(client)}>
                  <MessageCircle className="size-4" /> Reativar
                </Button>
              ) : null}
            </div>
          ))}
          {filtered.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Nenhum cliente neste segmento.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
