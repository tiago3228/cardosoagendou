import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Copy, FileText, Plus, Printer, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { panelQuery } from "./app";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatBRL } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/orcamentos")({ component: QuotesPage });

type Db = SupabaseClient;
type Inclusion = { id?: string | undefined; label: string; is_custom: boolean; sort_order: number };
type QuoteItem = {
  id?: string | undefined;
  service_id: string | null;
  name: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  is_custom: boolean;
  sort_order: number;
};
type Quote = {
  id: string;
  quote_number: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  title: string;
  issue_date: string;
  valid_until: string | null;
  status: string;
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  notes: string | null;
  quote_items?: QuoteItem[];
  quote_inclusions?: Inclusion[];
};

const PRESET_INCLUSIONS = [
  "Horas de gravação",
  "Equipamentos",
  "Alimentação",
  "Olhar artístico",
  "Horas de edição",
  "Trilha sonora sem direitos autorais",
  "Vídeo pronto + cenas brutas",
  "Decupagem de vídeos",
  "Deslocamento",
  "Tempo de entrega",
  "Storytelling",
  "Direção de arte",
];
const today = () => new Date().toISOString().slice(0, 10);
const moneyToCents = (value: string) =>
  Math.round((Number(value.replace(".", "").replace(",", ".")) || 0) * 100);
const centsToMoney = (value: number) => (value / 100).toFixed(2).replace(".", ",");

function emptyItem(sort_order: number): QuoteItem {
  return {
    service_id: null,
    name: "",
    description: "",
    quantity: 1,
    unit_price_cents: 0,
    is_custom: true,
    sort_order,
  };
}
function emptyQuote(): Omit<Quote, "id"> {
  return {
    quote_number: "",
    customer_name: "",
    customer_phone: null,
    customer_email: null,
    title: "Orçamento",
    issue_date: today(),
    valid_until: null,
    status: "DRAFT",
    subtotal_cents: 0,
    discount_cents: 0,
    total_cents: 0,
    notes: null,
    quote_items: [emptyItem(0)],
    quote_inclusions: [],
  };
}

function QuotesPage() {
  const { data: panel } = useSuspenseQuery(panelQuery);
  const businessId = panel.business!.id;
  const db = supabase as unknown as Db;
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Quote | null>(null);
  const [showInclusions, setShowInclusions] = useState(false);
  const [saving, setSaving] = useState(false);
  const quotes = useQuery({
    queryKey: ["quotes", businessId],
    queryFn: async () => {
      const { data, error } = await db
        .from("quotes")
        .select("*, quote_items(*), quote_inclusions(*)")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Quote[];
    },
  });
  const services = useQuery({
    queryKey: ["quote-services", businessId],
    queryFn: async () => {
      const { data, error } = await db
        .from("services")
        .select("id,name,description,price_cents")
        .eq("business_id", businessId)
        .eq("active", true)
        .is("deleted_at", null)
        .order("name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const openNew = () => {
    setEditing({ id: "new", ...emptyQuote() } as Quote);
    setShowInclusions(false);
  };
  const loadEdit = (quote: Quote) => {
    setEditing({
      ...quote,
      quote_items: quote.quote_items ?? [],
      quote_inclusions: quote.quote_inclusions ?? [],
    });
    setShowInclusions((quote.quote_inclusions?.length ?? 0) > 0);
  };
  const update = (patch: Partial<Quote>) =>
    setEditing((current) => (current ? { ...current, ...patch } : current));
  const items = editing?.quote_items ?? [];
  const inclusions = editing?.quote_inclusions ?? [];
  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + Math.round(item.quantity * item.unit_price_cents), 0),
    [items],
  );
  const total = Math.max(0, subtotal - (editing?.discount_cents ?? 0));

  function selectService(index: number, serviceId: string) {
    const service = (services.data ?? []).find((item) => item.id === serviceId);
    const current = items[index];
    if (!current) return;
    const next = [...items];
    next[index] = {
      ...current,
      service_id: serviceId || null,
      name: service?.name ?? current.name,
      description: service?.description ?? current.description,
      unit_price_cents: service?.price_cents ?? current.unit_price_cents,
      is_custom: false,
    };
    update({ quote_items: next });
  }
  function addInclusion(label = "") {
    update({
      quote_inclusions: [...inclusions, { label, is_custom: true, sort_order: inclusions.length }],
    });
    setShowInclusions(true);
  }

  async function saveQuote() {
    if (!editing || !editing.customer_name.trim()) {
      alert("Informe o nome do cliente.");
      return;
    }
    const quoteNumber = editing.quote_number || `ORC-${Date.now().toString().slice(-8)}`;
    setSaving(true);
    const payload = {
      business_id: businessId,
      customer_name: editing.customer_name.trim(),
      customer_phone: editing.customer_phone?.trim() || null,
      customer_email: editing.customer_email?.trim() || null,
      quote_number: quoteNumber,
      title: editing.title.trim() || "Orçamento",
      issue_date: editing.issue_date || today(),
      valid_until: editing.valid_until || null,
      status: editing.valid_until && editing.valid_until < today() ? "EXPIRED" : "VALID",
      subtotal_cents: subtotal,
      discount_cents: editing.discount_cents ?? 0,
      total_cents: total,
      notes: editing.notes?.trim() || null,
    };
    const result =
      editing.id === "new"
        ? await db.from("quotes").insert(payload).select("id").single()
        : await db.from("quotes").update(payload).eq("id", editing.id).select("id").single();
    if (result.error || !result.data) {
      setSaving(false);
      alert(result.error?.message ?? "Não foi possível salvar o orçamento");
      return;
    }
    await db.from("quote_items").delete().eq("quote_id", result.data.id);
    await db.from("quote_inclusions").delete().eq("quote_id", result.data.id);
    const validItems = items
      .filter((item) => item.name.trim())
      .map((item, index) => ({
        ...item,
        business_id: businessId,
        quote_id: result.data.id,
        name: item.name.trim(),
        description: item.description.trim() || null,
        total_cents: Math.round(item.quantity * item.unit_price_cents),
        sort_order: index,
      }));
    if (validItems.length) await db.from("quote_items").insert(validItems);
    const validInclusions = inclusions
      .filter((item) => item.label.trim())
      .map((item, index) => ({
        ...item,
        business_id: businessId,
        quote_id: result.data.id,
        label: item.label.trim(),
        sort_order: index,
      }));
    if (validInclusions.length) await db.from("quote_inclusions").insert(validInclusions);
    setSaving(false);
    setEditing(null);
    await queryClient.invalidateQueries({ queryKey: ["quotes", businessId] });
  }
  async function duplicate(quote: Quote) {
    const copy: Quote = {
      ...quote,
      id: "new",
      quote_number: "",
      issue_date: today(),
      valid_until: null,
      status: "DRAFT",
      quote_items: (quote.quote_items ?? []).map(({ id: _id, ...item }, i) => ({
        ...item,
        sort_order: i,
      })),
      quote_inclusions: (quote.quote_inclusions ?? []).map(({ id: _id, ...item }, i) => ({
        ...item,
        sort_order: i,
      })),
    };
    setEditing(copy);
    setShowInclusions((copy.quote_inclusions?.length ?? 0) > 0);
  }
  function printQuote() {
    window.print();
  }

  if (editing)
    return (
      <QuoteEditor
        editing={editing}
        items={items}
        inclusions={inclusions}
        services={services.data ?? []}
        showInclusions={showInclusions}
        setShowInclusions={setShowInclusions}
        subtotal={subtotal}
        total={total}
        update={update}
        selectService={selectService}
        addInclusion={addInclusion}
        setSaving={setSaving}
        saving={saving}
        saveQuote={saveQuote}
        printQuote={printQuote}
      />
    );
  return (
    <div>
      <BackButton />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Orçamentos</h1>
          <p className="text-sm text-muted-foreground">
            Crie propostas profissionais e reutilize seus modelos.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="size-4" /> Novo orçamento
        </Button>
      </div>
      <ul className="mt-6 space-y-3">
        {(quotes.data ?? []).map((quote) => (
          <li
            key={quote.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"
          >
            <div>
              <p className="font-semibold text-card-foreground">
                {quote.quote_number} · {quote.customer_name}
              </p>
              <p className="text-sm text-muted-foreground">
                {quote.title} · {formatBRL(quote.total_cents)} ·{" "}
                {quote.status === "EXPIRED"
                  ? "Expirado"
                  : quote.status === "DRAFT"
                    ? "Rascunho"
                    : "Válido"}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => loadEdit(quote)}>
                Editar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => duplicate(quote)}>
                <Copy className="size-4" /> Duplicar
              </Button>
            </div>
          </li>
        ))}
        {quotes.data?.length === 0 ? (
          <li className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            Nenhum orçamento criado.
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function QuoteEditor({
  editing,
  items,
  inclusions,
  services,
  showInclusions,
  setShowInclusions,
  subtotal,
  total,
  update,
  selectService,
  addInclusion,
  saving,
  saveQuote,
  printQuote,
}: {
  editing: Quote;
  items: QuoteItem[];
  inclusions: Inclusion[];
  services: Array<{ id: string; name: string; description: string | null; price_cents: number }>;
  showInclusions: boolean;
  setShowInclusions: (value: boolean) => void;
  subtotal: number;
  total: number;
  update: (patch: Partial<Quote>) => void;
  selectService: (index: number, id: string) => void;
  addInclusion: (label?: string) => void;
  setSaving: (value: boolean) => void;
  saving: boolean;
  saveQuote: () => Promise<void>;
  printQuote: () => void;
}) {
  function moveInclusion(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= inclusions.length) return;
    const next = [...inclusions];
    const currentItem = next[index];
    const targetItem = next[target];
    if (!currentItem || !targetItem) return;
    next[index] = targetItem;
    next[target] = currentItem;
    update({
      quote_inclusions: next.map((item, sort_order) => ({ ...item, sort_order })),
    });
  }

  return (
    <div className="quote-editor">
      <div className="no-print">
        <BackButton />
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold">
            {editing.id === "new" ? "Novo orçamento" : "Editar orçamento"}
          </h1>
          <Button variant="ghost" onClick={() => window.history.back()}>
            <X className="size-4" /> Fechar
          </Button>
        </div>
      </div>
      <article className="mt-5 rounded-xl border border-border bg-card p-5 print:border-0 print:p-0">
        <header>
          <p className="text-sm font-semibold text-primary">
            {editing.quote_number || "Novo orçamento"}
          </p>
          <Input
            className="mt-2 text-xl font-semibold"
            value={editing.title}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="Título do orçamento"
          />
        </header>
        <section className="mt-5 grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Cliente</Label>
            <Input
              value={editing.customer_name}
              onChange={(e) => update({ customer_name: e.target.value })}
              placeholder="Nome do cliente"
            />
          </div>
          <div>
            <Label>WhatsApp</Label>
            <Input
              value={editing.customer_phone ?? ""}
              onChange={(e) => update({ customer_phone: e.target.value })}
            />
          </div>
          <div>
            <Label>Data do orçamento</Label>
            <Input
              type="date"
              value={editing.issue_date}
              onChange={(e) => update({ issue_date: e.target.value })}
            />
          </div>
          <div>
            <Label>Validade</Label>
            <Input
              type="date"
              value={editing.valid_until ?? ""}
              onChange={(e) => update({ valid_until: e.target.value || null })}
            />
          </div>
        </section>
        <section className="mt-6">
          <h2 className="font-semibold">Serviços</h2>
          {items.map((item, index) => (
            <div
              key={item.id ?? index}
              className="mt-3 grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1.3fr_1fr_100px_120px_auto]"
            >
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={item.service_id ?? ""}
                onChange={(e) => selectService(index, e.target.value)}
              >
                <option value="">Serviço personalizado</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </select>
              <Input
                placeholder="Nome do item"
                value={item.name}
                onChange={(e) => {
                  const next = [...items];
                  next[index] = { ...item, name: e.target.value };
                  update({ quote_items: next });
                }}
              />
              <Input
                inputMode="decimal"
                placeholder="Preço"
                value={centsToMoney(item.unit_price_cents)}
                onChange={(e) => {
                  const next = [...items];
                  next[index] = { ...item, unit_price_cents: moneyToCents(e.target.value) };
                  update({ quote_items: next });
                }}
              />
              <Input
                type="number"
                min="1"
                step="1"
                value={item.quantity}
                onChange={(e) => {
                  const next = [...items];
                  next[index] = { ...item, quantity: Number(e.target.value) || 1 };
                  update({ quote_items: next });
                }}
              />
              <Button
                variant="ghost"
                onClick={() => update({ quote_items: items.filter((_, i) => i !== index) })}
              >
                <Trash2 className="size-4" />
              </Button>
              <Textarea
                className="sm:col-span-5"
                placeholder="Descrição deste item no orçamento (opcional)"
                value={item.description}
                onChange={(e) => {
                  const next = [...items];
                  next[index] = { ...item, description: e.target.value };
                  update({ quote_items: next });
                }}
              />
            </div>
          ))}
          <Button
            className="mt-3"
            variant="outline"
            onClick={() => update({ quote_items: [...items, emptyItem(items.length)] })}
          >
            <Plus className="size-4" /> Adicionar serviço
          </Button>
        </section>
        <section className="mt-6 rounded-lg border border-primary/25 bg-primary/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">O que está incluso?</h2>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowInclusions(!showInclusions)}
            >
              O que está incluso?
            </Button>
          </div>
          {showInclusions ? (
            <div className="mt-4 space-y-2">
              {PRESET_INCLUSIONS.map((label) => {
                const selected = inclusions.some((item) => item.label === label);
                return (
                  <label key={label} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(e) =>
                        update({
                          quote_inclusions: e.target.checked
                            ? [
                                ...inclusions,
                                { label, is_custom: false, sort_order: inclusions.length },
                              ]
                            : inclusions.filter((item) => item.label !== label),
                        })
                      }
                    />
                    {label}
                  </label>
                );
              })}
              {inclusions
                .filter((item) => item.is_custom)
                .map((item, index) => (
                  <div key={item.id ?? index} className="flex gap-2">
                    <Input
                      value={item.label}
                      placeholder="Item personalizado"
                      onChange={(e) =>
                        update({
                          quote_inclusions: inclusions.map((current) =>
                            current === item ? { ...current, label: e.target.value } : current,
                          ),
                        })
                      }
                    />
                    <Button
                      variant="ghost"
                      onClick={() =>
                        update({
                          quote_inclusions: inclusions.filter((current) => current !== item),
                        })
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              {inclusions.length > 0 ? (
                <div className="mt-4 rounded-md border border-border bg-background/60 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                    Ordem no orçamento
                  </p>
                  <div className="space-y-2">
                    {inclusions.map((item, index) => (
                      <div
                        key={`${item.id ?? "new"}-${index}`}
                        className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5 text-sm"
                      >
                        <span className="truncate">{item.label || "Item personalizado"}</span>
                        <span className="flex shrink-0 gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label="Mover item para cima"
                            disabled={index === 0}
                            onClick={() => moveInclusion(index, -1)}
                          >
                            <ArrowUp className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label="Mover item para baixo"
                            disabled={index === inclusions.length - 1}
                            onClick={() => moveInclusion(index, 1)}
                          >
                            <ArrowDown className="size-4" />
                          </Button>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <Button type="button" variant="outline" onClick={() => addInclusion()}>
                <Plus className="size-4" /> Adicionar item personalizado
              </Button>
            </div>
          ) : null}
        </section>
        <section className="mt-6">
          <Textarea
            placeholder="Observações e condições (opcional)"
            value={editing.notes ?? ""}
            onChange={(e) => update({ notes: e.target.value })}
          />
        </section>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div>
            <p>
              Subtotal: <strong>{formatBRL(subtotal)}</strong>
            </p>
            <p className="text-xl font-bold">Total: {formatBRL(total)}</p>
          </div>
          <div className="no-print flex gap-2">
            <Button variant="outline" onClick={printQuote}>
              <Printer className="size-4" /> Gerar PDF
            </Button>
            <Button onClick={saveQuote} disabled={saving}>
              <FileText className="size-4" /> Salvar orçamento
            </Button>
          </div>
        </div>
        {inclusions.filter((item) => item.label.trim()).length > 0 ? (
          <section className="print-only mt-6">
            <h2 className="font-semibold uppercase">O que está incluso</h2>
            <ul className="mt-2 list-disc pl-5">
              {inclusions
                .filter((item) => item.label.trim())
                .map((item, index) => (
                  <li key={index}>{item.label}</li>
                ))}
            </ul>
          </section>
        ) : null}
        {editing.notes?.trim() ? (
          <section className="print-only mt-6">
            <h2 className="font-semibold">Observações</h2>
            <p className="whitespace-pre-wrap">{editing.notes}</p>
          </section>
        ) : null}
      </article>
      <style>{`@media print { .no-print { display:none!important } .print-only { display:block!important } body { background:white!important } .quote-editor { margin:0!important } } .print-only { display:none }`}</style>
    </div>
  );
}
