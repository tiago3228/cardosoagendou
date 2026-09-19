import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Check, KanbanSquare, MessageCircle, Plus, Save, Tag, UserRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { panelQuery, entitlementsQuery } from "./app";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app/crm")({ component: CrmPage });
const STAGES = ["NEW", "CONTACTED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] as const;
// The generated Supabase types predate the CRM tables; this adapter is isolated until types are regenerated.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (table: string) => any };
type Client = {
  id: string;
  name: string;
  whatsapp: string;
  email: string | null;
  notes: string | null;
};
type CrmTag = { id: string; name: string; color: string };
type CrmLead = { id: string; name: string; source: string | null; stage: (typeof STAGES)[number] };
type CrmTask = {
  id: string;
  title: string;
  due_at: string | null;
  status: string;
  clients?: { name: string } | null;
};
const stageLabel: Record<string, string> = {
  NEW: "Novo",
  CONTACTED: "Contato",
  PROPOSAL: "Proposta",
  NEGOTIATION: "Negociação",
  WON: "Ganho",
  LOST: "Perdido",
};

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
  return <CrmDashboard businessId={panel.business!.id} />;
}

function CrmDashboard({ businessId }: { businessId: string }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"clients" | "pipeline" | "tasks">("clients");
  const clients = useQuery({
    queryKey: ["crm-clients", businessId],
    queryFn: async () => {
      const { data, error } = await db
        .from("clients")
        .select("id,name,whatsapp,email,notes")
        .eq("business_id", businessId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const tags = useQuery({
    queryKey: ["crm-tags", businessId],
    queryFn: async () => {
      const { data, error } = await db
        .from("crm_tags")
        .select("id,name,color")
        .eq("business_id", businessId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const leads = useQuery({
    queryKey: ["crm-leads", businessId],
    queryFn: async () => {
      const { data, error } = await db
        .from("crm_leads")
        .select("*")
        .eq("business_id", businessId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const tasks = useQuery({
    queryKey: ["crm-tasks", businessId],
    queryFn: async () => {
      const { data, error } = await db
        .from("crm_tasks")
        .select("*, clients(name)")
        .eq("business_id", businessId)
        .order("due_at");
      if (error) throw error;
      return data ?? [];
    },
  });
  const [search, setSearch] = useState("");
  const [newTag, setNewTag] = useState("");
  const [lead, setLead] = useState({
    name: "",
    whatsapp: "",
    email: "",
    source: "",
    estimated_value_cents: "",
  });
  const [task, setTask] = useState({ title: "", due_at: "", client_id: "" });
  const filtered = useMemo(
    () =>
      (clients.data ?? []).filter((c: Client) =>
        `${c.name} ${c.whatsapp} ${c.email ?? ""}`.toLowerCase().includes(search.toLowerCase()),
      ),
    [clients.data, search],
  );
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["crm"] });
    void qc.invalidateQueries({ queryKey: ["crm-clients", businessId] });
    void qc.invalidateQueries({ queryKey: ["crm-tags", businessId] });
    void qc.invalidateQueries({ queryKey: ["crm-leads", businessId] });
    void qc.invalidateQueries({ queryKey: ["crm-tasks", businessId] });
  };
  const addTag = useMutation({
    mutationFn: async () => {
      const { error } = await db
        .from("crm_tags")
        .insert({ business_id: businessId, name: newTag.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewTag("");
      invalidate();
      toast.success("Tag criada");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const addLead = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("crm_leads").insert({
        business_id: businessId,
        ...lead,
        estimated_value_cents: Math.round(Number(lead.estimated_value_cents || 0) * 100),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setLead({ name: "", whatsapp: "", email: "", source: "", estimated_value_cents: "" });
      invalidate();
      toast.success("Lead criado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const addTask = useMutation({
    mutationFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await db.from("crm_tasks").insert({
        business_id: businessId,
        title: task.title.trim(),
        due_at: task.due_at ? new Date(task.due_at).toISOString() : null,
        client_id: task.client_id || null,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setTask({ title: "", due_at: "", client_id: "" });
      invalidate();
      toast.success("Tarefa criada");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const moveLead = async (id: string, stage: string) => {
    const { error } = await db
      .from("crm_leads")
      .update({ stage, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("business_id", businessId);
    if (error) toast.error(error.message);
    else invalidate();
  };
  const doneTask = async (id: string) => {
    const { error } = await db
      .from("crm_tasks")
      .update({ status: "DONE", completed_at: new Date().toISOString() })
      .eq("id", id)
      .eq("business_id", businessId);
    if (error) toast.error(error.message);
    else invalidate();
  };
  return (
    <div>
      <BackButton />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">CRM</h1>
          <p className="text-sm text-muted-foreground">
            Clientes, relacionamento, tarefas e oportunidades em um só lugar.
          </p>
        </div>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
          Plano Ilimitado
        </span>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {(
          [
            ["clients", "Clientes"],
            ["pipeline", "Funil de vendas"],
            ["tasks", "Tarefas e follow-up"],
          ] as const
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
      {tab === "clients" ? (
        <section className="mt-5 space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap gap-2">
              <Input
                className="max-w-md"
                placeholder="Buscar cliente..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Input
                className="max-w-xs"
                placeholder="Nova tag"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
              />
              <Button disabled={!newTag.trim() || addTag.isPending} onClick={() => addTag.mutate()}>
                <Tag className="size-4" /> Criar tag
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(tags.data ?? []).map((tag: CrmTag) => (
                <span
                  key={tag.id}
                  className="rounded-full border border-border px-2.5 py-1 text-xs"
                >
                  {tag.name}
                </span>
              ))}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {filtered.map((client: Client) => (
              <ClientRow
                key={client.id}
                client={client}
                businessId={businessId}
                tags={tags.data ?? []}
                invalidate={invalidate}
              />
            ))}
            {filtered.length === 0 && (
              <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                Nenhum cliente encontrado.
              </p>
            )}
          </div>
        </section>
      ) : null}
      {tab === "pipeline" ? (
        <section className="mt-5">
          <form
            className="grid gap-2 rounded-xl border border-border bg-card p-4 md:grid-cols-6"
            onSubmit={(e) => {
              e.preventDefault();
              addLead.mutate();
            }}
          >
            <Input
              required
              placeholder="Nome do lead"
              value={lead.name}
              onChange={(e) => setLead({ ...lead, name: e.target.value })}
            />
            <Input
              placeholder="WhatsApp"
              value={lead.whatsapp}
              onChange={(e) => setLead({ ...lead, whatsapp: e.target.value })}
            />
            <Input
              placeholder="E-mail"
              value={lead.email}
              onChange={(e) => setLead({ ...lead, email: e.target.value })}
            />
            <Input
              placeholder="Origem"
              value={lead.source}
              onChange={(e) => setLead({ ...lead, source: e.target.value })}
            />
            <Input
              inputMode="decimal"
              placeholder="Valor potencial"
              value={lead.estimated_value_cents}
              onChange={(e) => setLead({ ...lead, estimated_value_cents: e.target.value })}
            />
            <Button type="submit" disabled={addLead.isPending}>
              <Plus className="size-4" /> Novo lead
            </Button>
          </form>
          <div className="mt-4 grid gap-3 xl:grid-cols-6">
            {STAGES.map((stage) => (
              <div
                key={stage}
                className="min-h-36 rounded-xl border border-border bg-secondary/20 p-3"
              >
                <h2 className="text-sm font-semibold">{stageLabel[stage]}</h2>
                <div className="mt-2 space-y-2">
                  {(leads.data ?? [])
                    .filter((item: CrmLead) => item.stage === stage)
                    .map((item: CrmLead) => (
                      <article
                        key={item.id}
                        className="rounded-lg border border-border bg-card p-3"
                      >
                        <p className="font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.source || "Sem origem"}
                        </p>
                        <select
                          className="mt-2 w-full rounded border bg-background p-1 text-xs"
                          value={item.stage}
                          onChange={(e) => void moveLead(item.id, e.target.value)}
                        >
                          {STAGES.map((s) => (
                            <option key={s} value={s}>
                              {stageLabel[s]}
                            </option>
                          ))}
                        </select>
                      </article>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {tab === "tasks" ? (
        <section className="mt-5">
          <form
            className="grid gap-2 rounded-xl border border-border bg-card p-4 md:grid-cols-4"
            onSubmit={(e) => {
              e.preventDefault();
              addTask.mutate();
            }}
          >
            <Input
              required
              placeholder="Próxima ação"
              value={task.title}
              onChange={(e) => setTask({ ...task, title: e.target.value })}
            />
            <select
              className="rounded-md border bg-background px-3"
              value={task.client_id}
              onChange={(e) => setTask({ ...task, client_id: e.target.value })}
            >
              <option value="">Sem cliente</option>
              {(clients.data ?? []).map((c: Client) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <Input
              type="datetime-local"
              value={task.due_at}
              onChange={(e) => setTask({ ...task, due_at: e.target.value })}
            />
            <Button type="submit" disabled={addTask.isPending}>
              <Plus className="size-4" /> Criar tarefa
            </Button>
          </form>
          <div className="mt-4 space-y-2">
            {(tasks.data ?? []).map((item: CrmTask) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"
              >
                <div>
                  <p className="font-medium">{item.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.clients?.name ?? "Sem cliente"}
                    {item.due_at ? ` · ${new Date(item.due_at).toLocaleString("pt-BR")}` : ""}
                  </p>
                </div>
                {item.status === "OPEN" ? (
                  <Button size="sm" variant="outline" onClick={() => void doneTask(item.id)}>
                    <Check className="size-4" /> Concluir
                  </Button>
                ) : (
                  <span className="text-sm text-primary">Concluída</span>
                )}
              </div>
            ))}
            {(tasks.data ?? []).length === 0 && (
              <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                Nenhuma tarefa cadastrada.
              </p>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ClientRow({
  client,
  businessId,
  tags,
  invalidate,
}: {
  client: Client;
  businessId: string;
  tags: CrmTag[];
  invalidate: () => void;
}) {
  const [note, setNote] = useState("");
  const [tagId, setTagId] = useState("");
  const [expanded, setExpanded] = useState(false);
  const addInteraction = async () => {
    if (!note.trim()) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await db.from("crm_interactions").insert({
      business_id: businessId,
      client_id: client.id,
      type: "NOTE",
      content: note.trim(),
      created_by: user?.id,
    });
    if (error) toast.error(error.message);
    else {
      setNote("");
      invalidate();
      toast.success("Interação registrada");
    }
  };
  const addClientTag = async () => {
    if (!tagId) return;
    const { error } = await db
      .from("crm_client_tags")
      .upsert({ business_id: businessId, client_id: client.id, tag_id: tagId });
    if (error) toast.error(error.message);
    else {
      setTagId("");
      invalidate();
    }
  };
  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <button
        className="flex w-full items-center gap-3 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
          <UserRound className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block truncate">{client.name}</strong>
          <span className="text-sm text-muted-foreground">
            {client.whatsapp}
            {client.email ? ` · ${client.email}` : ""}
          </span>
        </span>
        <MessageCircle className="size-4 text-muted-foreground" />
      </button>
      {expanded && (
        <div className="mt-4 space-y-3 border-t pt-4">
          <div className="flex gap-2">
            <Input
              placeholder="Registrar uma interação..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button size="sm" onClick={() => void addInteraction()}>
              <Save className="size-4" /> Salvar
            </Button>
          </div>
          <div className="flex gap-2">
            <select
              className="rounded-md border bg-background px-3 text-sm"
              value={tagId}
              onChange={(e) => setTagId(e.target.value)}
            >
              <option value="">Adicionar tag...</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
            <Button size="sm" variant="outline" onClick={() => void addClientTag()}>
              <Tag className="size-4" /> Aplicar
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {client.notes || "Sem observações cadastradas."}
          </p>
        </div>
      )}
    </article>
  );
}
