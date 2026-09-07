import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { panelQuery } from "./app";
import { formatBRL, formatDuration } from "@/lib/format";
import { businessTypeConfig } from "@/lib/business-types";
import { userFacingError } from "@/lib/user-facing-error";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/app/servicos")({
  component: ServicesPage,
});

interface EditForm {
  id: string;
  name: string;
  category: string;
  price: string;
  duration: string;
  segment_id: string;
  allows_parallel: boolean;
  is_composite: boolean;
  component_ids: string[];
}

function replaceInitialZeroPrice(current: string, next: string): string {
  if ((current === "0" || current === "0,00") && next.startsWith(current)) {
    return next.slice(current.length);
  }
  return next;
}

function ServicesPage() {
  const { data: panel } = useSuspenseQuery(panelQuery);
  const businessId = panel.business!.id;
  const config = businessTypeConfig(panel.business!.business_type);
  const queryClient = useQueryClient();
  const db = supabase as unknown as SupabaseClient;
  const [form, setForm] = useState({
    name: "",
    category: "",
    price: "",
    duration: "30",
    segment_id: "",
    allows_parallel: false,
    is_composite: false,
    component_ids: [] as string[],
  });
  const [edit, setEdit] = useState<EditForm | null>(null);
  const [catalogSegmentId, setCatalogSegmentId] = useState("");
  const [expandedSegmentId, setExpandedSegmentId] = useState<string | null>(null);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const segments = useQuery({
    queryKey: ["business-segments", businessId],
    queryFn: async () => {
      const { data, error } = await db
        .from("business_segments")
        .select("id, segment_id, name, slug, description, sort_order, active")
        .eq("business_id", businessId)
        .order("sort_order")
        .order("name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const catalogSegments = useQuery({
    queryKey: ["catalog-segments"],
    queryFn: async () => {
      const { data, error } = await db
        .from("segments")
        .select("id, name, slug, description, sort_order")
        .eq("active", true)
        .order("sort_order");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const catalogTemplates = useQuery({
    queryKey: ["catalog-service-templates"],
    queryFn: async () => {
      const { data, error } = await db
        .from("service_templates")
        .select("id, segment_id, name, description, category, price_cents, duration_minutes")
        .is("business_id", null)
        .eq("active", true)
        .order("name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const professionals = useQuery({
    queryKey: ["professionals", businessId],
    queryFn: async () => {
      const { data, error } = await db
        .from("professionals")
        .select("id, name")
        .eq("business_id", businessId)
        .eq("active", true)
        .is("deleted_at", null)
        .order("name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const professionalServices = useQuery({
    queryKey: ["professional-services", businessId],
    queryFn: async () => {
      const { data, error } = await db
        .from("professional_services")
        .select("professional_id, service_id")
        .eq("business_id", businessId);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const services = useQuery({
    queryKey: ["services", businessId],
    queryFn: async () => {
      const { data, error } = await db
        .from("services")
        .select(
          "id, name, category, price_cents, duration_minutes, active, segment_id, allows_parallel, is_composite",
        )
        .eq("business_id", businessId)
        .is("deleted_at", null)
        .order("name");
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const compositions = useQuery({
    queryKey: ["service-compositions", businessId],
    queryFn: async () => {
      const { data, error } = await db
        .from("service_compositions")
        .select("composite_service_id, component_service_id")
        .eq("business_id", businessId);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const createSegment = useMutation({
    mutationFn: async () => {
      const segment = (catalogSegments.data ?? []).find(
        (item: { id: string }) => item.id === catalogSegmentId,
      );
      if (!segment) throw new Error("Selecione um segmento do catálogo");
      const { error } = await db.from("business_segments").insert({
        business_id: businessId,
        segment_id: segment.id,
        name: segment.name,
        slug: segment.slug,
        description: segment.description,
        sort_order: segments.data?.length ?? 0,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setCatalogSegmentId("");
      queryClient.invalidateQueries({ queryKey: ["business-segments", businessId] });
      toast.success("Segmento criado");
    },
    onError: (error: Error) =>
      toast.error("Não foi possível criar o segmento", { description: userFacingError(error) }),
  });

  const toggleSegment = useMutation({
    mutationFn: async (input: { id: string; active: boolean }) => {
      const { error } = await db
        .from("business_segments")
        .update({ active: input.active })
        .eq("id", input.id)
        .eq("business_id", businessId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["business-segments", businessId] }),
    onError: (error: Error) =>
      toast.error("Não foi possível atualizar o segmento", { description: userFacingError(error) }),
  });

  const copyTemplates = useMutation({
    mutationFn: async (input: { segmentId: string; templateIds: string[] }) => {
      if (input.templateIds.length === 0) return 0;
      const selectedTemplates = (catalogTemplates.data ?? []).filter((template: { id: string }) =>
        input.templateIds.includes(template.id),
      );
      const businessSegmentId = segments.data?.find(
        (segment: { segment_id: string | null }) => segment.segment_id === input.segmentId,
      )?.id;
      const templateNames = selectedTemplates.map((template: { name: string }) => template.name);
      const existingServices = businessSegmentId
        ? await db
            .from("services")
            .select("id")
            .eq("business_id", businessId)
            .eq("segment_id", businessSegmentId)
            .in("name", templateNames)
            .is("deleted_at", null)
        : { data: [], error: null };
      if (existingServices.error) throw new Error(existingServices.error.message);
      const { data, error } = await db.rpc(
        "copy_catalog_services" as never,
        {
          _business_id: businessId,
          _segment_id: input.segmentId,
          _template_ids: input.templateIds,
        } as never,
      );
      if (error) throw new Error(error.message);
      if (data && businessSegmentId && professionals.data?.length) {
        const copiedServices = await db
          .from("services")
          .select("id")
          .eq("business_id", businessId)
          .eq("segment_id", businessSegmentId)
          .in("name", templateNames)
          .is("deleted_at", null);
        if (copiedServices.error) throw new Error(copiedServices.error.message);
        const existingIds = new Set(
          (existingServices.data ?? []).map((service: { id: string }) => service.id),
        );
        const newServiceIds = (copiedServices.data ?? [])
          .map((service: { id: string }) => service.id)
          .filter((id: string) => !existingIds.has(id));
        const links = newServiceIds.flatMap((serviceId: string) =>
          (professionals.data ?? []).map((professional: { id: string }) => ({
            business_id: businessId,
            professional_id: professional.id,
            service_id: serviceId,
          })),
        );
        if (links.length > 0) {
          const { error: linkError } = await db.from("professional_services").insert(links);
          if (linkError) throw new Error(linkError.message);
        }
      }
      return Number(data ?? 0);
    },
    onSuccess: async (count) => {
      setSelectedTemplateIds([]);
      setExpandedSegmentId(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["services", businessId] }),
        queryClient.invalidateQueries({ queryKey: ["professional-services", businessId] }),
      ]);
      toast.success(`${count} serviço(s) adicionado(s)`);
    },
    onError: (error: Error) =>
      toast.error("Não foi possível adicionar os serviços", { description: userFacingError(error) }),
  });

  const toggleProfessionalService = useMutation({
    mutationFn: async (input: { professionalId: string; serviceId: string; linked: boolean }) => {
      if (input.linked) {
        const { error } = await db
          .from("professional_services")
          .delete()
          .eq("business_id", businessId)
          .eq("professional_id", input.professionalId)
          .eq("service_id", input.serviceId);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await db.from("professional_services").insert({
          business_id: businessId,
          professional_id: input.professionalId,
          service_id: input.serviceId,
        });
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["professional-services", businessId] });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível atualizar os profissionais", { description: userFacingError(error) }),
  });

  const create = useMutation({
    mutationFn: async () => {
      const price = Math.round(Number(form.price.replace(",", ".")) * 100);
      const duration = Number(form.duration);
      if (!form.name.trim()) throw new Error("Informe o nome do serviço");
      if (!Number.isFinite(price) || price < 0) throw new Error("Preço inválido");
      if (!Number.isFinite(duration) || duration < 5)
        throw new Error("Duração mínima de 5 minutos");
      const { data: created, error } = await db.from("services").insert({
        business_id: businessId,
        name: form.name.trim(),
        category: form.category.trim() || null,
        price_cents: price,
        duration_minutes: duration,
        ...(form.segment_id ? { segment_id: form.segment_id } : {}),
        allows_parallel: form.allows_parallel,
        is_composite: false,
      }).select("id").single();
      if (error) throw new Error(error.message);
      const { error: compositionError } = await db.rpc("save_service_composition" as never, {
        _business_id: businessId,
        _service_id: created.id,
        _is_composite: form.is_composite,
        _component_ids: form.component_ids,
      } as never);
      if (compositionError) throw new Error(compositionError.message);
    },
    onSuccess: () => {
      setForm({
        name: "",
        category: "",
        price: "",
        duration: "30",
        segment_id: "",
        allows_parallel: false,
        is_composite: false,
        component_ids: [],
      });
      toast.success("Serviço criado");
      queryClient.invalidateQueries({ queryKey: ["services", businessId] });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível salvar", { description: userFacingError(error) }),
  });

  const toggle = useMutation({
    mutationFn: async (input: { id: string; active: boolean }) => {
      const { error } = await db
        .from("services")
        .update({ active: input.active })
        .eq("id", input.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["services", businessId] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db
        .from("services")
        .update({ deleted_at: new Date().toISOString(), active: false })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Serviço removido");
      queryClient.invalidateQueries({ queryKey: ["services", businessId] });
    },
  });

  const update = useMutation({
    mutationFn: async (input: EditForm) => {
      const price = Math.round(Number(input.price.replace(",", ".")) * 100);
      const duration = Number(input.duration);
      if (!input.name.trim()) throw new Error("Informe o nome do serviço");
      if (!Number.isFinite(price) || price < 0) throw new Error("Preço inválido");
      if (!Number.isFinite(duration) || duration < 5)
        throw new Error("Duração mínima de 5 minutos");
      const { error } = await db
        .from("services")
        .update({
          name: input.name.trim(),
          category: input.category.trim() || null,
          price_cents: price,
          duration_minutes: duration,
          segment_id: input.segment_id,
          allows_parallel: input.allows_parallel,
        })
        .eq("id", input.id)
        .eq("business_id", businessId);
      if (error) throw new Error(error.message);
      const { error: compositionError } = await db.rpc("save_service_composition" as never, {
        _business_id: businessId,
        _service_id: input.id,
        _is_composite: input.is_composite,
        _component_ids: input.component_ids,
      } as never);
      if (compositionError) throw new Error(compositionError.message);
    },
    onSuccess: () => {
      setEdit(null);
      toast.success("Serviço atualizado");
      queryClient.invalidateQueries({ queryKey: ["services", businessId] });
      queryClient.invalidateQueries({ queryKey: ["service-compositions", businessId] });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível atualizar", { description: userFacingError(error) }),
  });

  return (
    <div>
      <BackButton />
      <h1 className="font-display text-2xl font-bold text-foreground">Serviços</h1>
      <p className="text-sm text-muted-foreground">
        Categorias sugeridas para {config.label.toLowerCase()}: {config.categories.join(", ")}
      </p>

      <section className="mt-6 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold text-card-foreground">Catálogo de segmentos</h2>
            <p className="text-sm text-muted-foreground">
              Escolha um segmento e selecione os serviços sugeridos. Serviços personalizados são
              ilimitados em todos os planos.
            </p>
          </div>
          <div className="flex gap-2">
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              value={catalogSegmentId}
              onChange={(event) => setCatalogSegmentId(event.currentTarget.value)}
              aria-label="Segmento do catálogo"
            >
              <option value="">Selecionar segmento</option>
              {(catalogSegments.data ?? []).map((segment: { id: string; name: string }) => (
                <option key={segment.id} value={segment.id}>
                  {segment.name}
                </option>
              ))}
            </select>
            <Button
              type="button"
              disabled={createSegment.isPending}
              onClick={() => createSegment.mutate()}
            >
              <Plus className="size-4" aria-hidden /> Ativar
            </Button>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {(segments.data ?? [])
            .filter((segment: { slug: string }) => segment.slug !== "geral")
            .map(
              (segment: {
                id: string;
                segment_id: string | null;
                name: string;
                active: boolean;
              }) => (
                <div key={segment.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      className="flex items-center gap-2 text-left font-medium text-card-foreground"
                      onClick={() => {
                        setExpandedSegmentId((current) =>
                          current === segment.id ? null : segment.id,
                        );
                        setSelectedTemplateIds([]);
                      }}
                    >
                      <ChevronDown
                        className={`size-4 transition ${expandedSegmentId === segment.id ? "rotate-180" : ""}`}
                        aria-hidden
                      />
                      {segment.name}
                    </button>
                    <Button
                      type="button"
                      size="sm"
                      variant={segment.active ? "outline" : "default"}
                      onClick={() =>
                        toggleSegment.mutate({ id: segment.id, active: !segment.active })
                      }
                    >
                      {segment.active ? "Desativar" : "Ativar"}
                    </Button>
                  </div>
                  {expandedSegmentId === segment.id && segment.segment_id ? (
                    <div className="mt-3 space-y-2 border-t border-border pt-3">
                      {(() => {
                        const templates = (catalogTemplates.data ?? []).filter(
                          (template: { segment_id: string }) =>
                            template.segment_id === segment.segment_id,
                        );
                        const selected = templates.filter((template: { id: string }) =>
                          selectedTemplateIds.includes(template.id),
                        );
                        return (
                          <>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm text-muted-foreground">
                                Selecione todos, alguns ou nenhum serviço sugerido.
                              </p>
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    setSelectedTemplateIds((current) => [
                                      ...new Set([
                                        ...current,
                                        ...templates.map((template: { id: string }) => template.id),
                                      ]),
                                    ])
                                  }
                                >
                                  Selecionar todos
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() =>
                                    copyTemplates.mutate({
                                      segmentId: segment.segment_id!,
                                      templateIds: selected.map(
                                        (template: { id: string }) => template.id,
                                      ),
                                    })
                                  }
                                  disabled={
                                    !segment.active ||
                                    selected.length === 0 ||
                                    copyTemplates.isPending
                                  }
                                >
                                  Adicionar selecionados
                                </Button>
                              </div>
                            </div>
                            {templates.map(
                              (template: {
                                id: string;
                                name: string;
                                description: string | null;
                                price_cents: number;
                                duration_minutes: number;
                              }) => {
                                const checked = selectedTemplateIds.includes(template.id);
                                return (
                                  <label
                                    key={template.id}
                                    className="flex cursor-pointer items-center justify-between rounded-md border border-border p-2 text-sm"
                                  >
                                    <span>
                                      <span className="font-medium text-card-foreground">
                                        {template.name}
                                      </span>
                                      <span className="ml-2 text-muted-foreground">
                                        {template.duration_minutes} min
                                        {template.price_cents > 0
                                          ? ` · ${formatBRL(template.price_cents)}`
                                          : ""}
                                        {template.description ? ` · ${template.description}` : ""}
                                      </span>
                                    </span>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() =>
                                        setSelectedTemplateIds((current) =>
                                          checked
                                            ? current.filter((id) => id !== template.id)
                                            : [...current, template.id],
                                        )
                                      }
                                    />
                                  </label>
                                );
                              },
                            )}
                            {templates.length === 0 ? (
                              <p className="text-sm text-muted-foreground">
                                Nenhuma sugestão cadastrada.
                              </p>
                            ) : null}
                          </>
                        );
                      })()}
                    </div>
                  ) : null}
                </div>
              ),
            )}
        </div>
      </section>

      <form
        className="mt-6 grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Nome</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Categoria</Label>
          <Input
            list="categorias"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />
          <datalist id="categorias">
            {config.categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1.5">
          <Label>Segmento</Label>
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
            value={form.segment_id}
            onChange={(event) => setForm({ ...form, segment_id: event.target.value })}
          >
            <option value="">Sem segmento</option>
            {(segments.data ?? []).map((segment: { id: string; name: string }) => (
              <option key={segment.id} value={segment.id}>
                {segment.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Preço (R$)</Label>
            <Input
              inputMode="decimal"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Duração (min)</Label>
            <Input
              inputMode="numeric"
              value={form.duration}
              onChange={(e) => setForm({ ...form, duration: e.target.value })}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground sm:col-span-2">
          <input
            type="checkbox"
            checked={form.allows_parallel}
            onChange={(event) => setForm({ ...form, allows_parallel: event.target.checked })}
          />
          Permite atendimento simultâneo
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground sm:col-span-2">
          <input
            type="checkbox"
            checked={form.is_composite}
            onChange={(event) =>
              setForm({ ...form, is_composite: event.target.checked, component_ids: [] })
            }
          />
          Serviço composto/conjunto
        </label>
        {form.is_composite ? (
          <label className="space-y-1.5 text-sm text-muted-foreground sm:col-span-2">
            <span className="block">Serviços componentes</span>
            <select
              multiple
              className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              value={form.component_ids}
              onChange={(event) =>
                setForm({
                  ...form,
                  component_ids: Array.from(event.target.selectedOptions, (option) => option.value),
                })
              }
            >
              {(services.data ?? [])
                .filter((service: { is_composite: boolean }) => !service.is_composite)
                .map((service: { id: string; name: string }) => (
                <option key={service.id} value={service.id}>{service.name}</option>
                ))}
            </select>
          </label>
        ) : null}
        <div className="sm:col-span-2">
          <Button type="submit" disabled={create.isPending}>
            <Plus className="size-4" aria-hidden /> Adicionar serviço
          </Button>
        </div>
      </form>

      <ul className="mt-6 space-y-2">
        {(services.data ?? []).map(
          (service: {
            id: string;
            name: string;
            category: string | null;
            price_cents: number;
            duration_minutes: number;
            active: boolean;
            segment_id: string | null;
            allows_parallel: boolean;
            is_composite: boolean;
          }) => (
            <li key={service.id} className="rounded-xl border border-border bg-card p-4">
              {edit?.id === service.id ? (
                <form
                  className="grid gap-3 sm:grid-cols-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (edit) update.mutate(edit);
                  }}
                >
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Nome</Label>
                    <Input
                      value={edit!.name}
                      onChange={(e) => setEdit({ ...edit!, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Categoria</Label>
                    <Input
                      value={edit!.category}
                      onChange={(e) => setEdit({ ...edit!, category: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Segmento</Label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                      value={edit!.segment_id}
                      onChange={(event) => setEdit({ ...edit!, segment_id: event.target.value })}
                    >
                      <option value="">Sem segmento</option>
                      {(segments.data ?? []).map((segment: { id: string; name: string }) => (
                        <option key={segment.id} value={segment.id}>
                          {segment.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Preço (R$)</Label>
                      <Input
                        inputMode="decimal"
                        value={edit!.price}
                        onChange={(e) =>
                          setEdit({
                            ...edit!,
                            price: replaceInitialZeroPrice(edit!.price, e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Duração (min)</Label>
                      <Input
                        inputMode="numeric"
                        value={edit!.duration}
                        onChange={(e) => setEdit({ ...edit!, duration: e.target.value })}
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={edit!.allows_parallel}
                      onChange={(event) =>
                        setEdit({ ...edit!, allows_parallel: event.target.checked })
                      }
                    />
                    Permite atendimento simultâneo
                  </label>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={edit!.is_composite}
                      onChange={(event) =>
                        setEdit({ ...edit!, is_composite: event.target.checked })
                      }
                    />
                    Serviço composto/conjunto
                  </label>
                  {edit!.is_composite ? (
                    <label className="space-y-1.5 text-sm text-muted-foreground sm:col-span-2">
                      <span className="block">Serviços componentes</span>
                      <select
                        multiple
                        className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                        value={edit!.component_ids}
                        onChange={(event) =>
                          setEdit({
                            ...edit!,
                            component_ids: Array.from(
                              event.target.selectedOptions,
                              (option) => option.value,
                            ),
                          })
                        }
                      >
                        {(services.data ?? [])
                          .filter(
                            (candidate: { id: string; is_composite: boolean }) =>
                              candidate.id !== edit!.id && !candidate.is_composite,
                          )
                          .map((candidate: { id: string; name: string }) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  ) : null}
                  <div className="flex gap-2 sm:col-span-2">
                    <Button type="submit" size="sm" disabled={update.isPending}>
                      Salvar alterações
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEdit(null)}>
                      Cancelar
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-card-foreground">{service.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {service.category ? `${service.category} · ` : ""}
                      {formatDuration(service.duration_minutes)} · {formatBRL(service.price_cents)}
                      {service.allows_parallel ? " · Simultâneo" : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(professionals.data ?? []).map(
                        (professional: { id: string; name: string }) => {
                          const linked = (professionalServices.data ?? []).some(
                            (link: { professional_id: string; service_id: string }) =>
                              link.professional_id === professional.id &&
                              link.service_id === service.id,
                          );
                          return (
                            <label
                              key={professional.id}
                              className="flex items-center gap-1 text-xs text-muted-foreground"
                            >
                              <input
                                type="checkbox"
                                checked={linked}
                                onChange={() =>
                                  toggleProfessionalService.mutate({
                                    professionalId: professional.id,
                                    serviceId: service.id,
                                    linked,
                                  })
                                }
                              />
                              {professional.name}
                            </label>
                          );
                        },
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggle.mutate({ id: service.id, active: !service.active })}
                    >
                      {service.active ? "Ativo" : "Inativo"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Editar ${service.name}`}
                      onClick={() =>
                        setEdit({
                          id: service.id,
                          name: service.name,
                          category: service.category ?? "",
                          price: (service.price_cents / 100).toFixed(2).replace(".", ","),
                          duration: String(service.duration_minutes),
                          segment_id: service.segment_id ?? "",
                          allows_parallel: service.allows_parallel,
                          is_composite: service.is_composite,
                          component_ids: (compositions.data ?? [])
                            .filter(
                              (composition: { composite_service_id: string }) =>
                                composition.composite_service_id === service.id,
                            )
                            .map(
                              (composition: { component_service_id: string }) =>
                                composition.component_service_id,
                            ),
                        })
                      }
                    >
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Remover ${service.name}`}
                      onClick={() => remove.mutate(service.id)}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ),
        )}
      </ul>

      <ConflictRules businessId={businessId} services={services.data ?? []} />
    </div>
  );
}

/**
 * Incompatible service pairs — e.g. "Corte + Barba" cannot be combined with
 * "Corte Masculino". Blocked on the public booking page and on the server.
 */
function ConflictRules({
  businessId,
  services,
}: {
  businessId: string;
  services: { id: string; name: string }[];
}) {
  const queryClient = useQueryClient();
  const [pair, setPair] = useState({ a: "", b: "", reason: "" });

  const conflicts = useQuery({
    queryKey: ["service-conflicts", businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_conflicts")
        .select("id, service_id, conflicting_service_id, reason")
        .eq("business_id", businessId);
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!pair.a || !pair.b) throw new Error("Selecione os dois serviços");
      if (pair.a === pair.b) throw new Error("Selecione serviços diferentes");
      const { error } = await supabase.from("service_conflicts").insert({
        business_id: businessId,
        service_id: pair.a,
        conflicting_service_id: pair.b,
        reason: pair.reason.trim() || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setPair({ a: "", b: "", reason: "" });
      toast.success("Regra criada");
      queryClient.invalidateQueries({ queryKey: ["service-conflicts", businessId] });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível criar a regra", {
        description: userFacingError(error),
      }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("service_conflicts").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Regra removida");
      queryClient.invalidateQueries({ queryKey: ["service-conflicts", businessId] });
    },
  });

  const nameOf = (id: string) => services.find((s) => s.id === id)?.name ?? "Serviço removido";
  const selectClass =
    "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground";

  return (
    <section className="mt-10">
      <h2 className="font-display text-lg font-bold text-foreground">Serviços incompatíveis</h2>
      <p className="text-sm text-muted-foreground">
        Impeça combinações que não fazem sentido no mesmo atendimento (ex.: “Corte + Barba” junto de
        “Corte Masculino”).
      </p>

      <form
        className="mt-4 grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label>Serviço</Label>
          <select
            className={selectClass}
            value={pair.a}
            onChange={(e) => setPair({ ...pair, a: e.target.value })}
          >
            <option value="">Selecione</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Não pode ser combinado com</Label>
          <select
            className={selectClass}
            value={pair.b}
            onChange={(e) => setPair({ ...pair, b: e.target.value })}
          >
            <option value="">Selecione</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Motivo (opcional)</Label>
          <Input
            value={pair.reason}
            onChange={(e) => setPair({ ...pair, reason: e.target.value })}
            placeholder="Serviços equivalentes"
          />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" size="sm" disabled={add.isPending}>
            <Plus className="size-4" aria-hidden /> Criar regra
          </Button>
        </div>
      </form>

      <ul className="mt-4 space-y-2">
        {(conflicts.data ?? []).map((rule) => (
          <li
            key={rule.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-card-foreground">
                {nameOf(rule.service_id)} ✕ {nameOf(rule.conflicting_service_id)}
              </p>
              {rule.reason ? <p className="text-sm text-muted-foreground">{rule.reason}</p> : null}
            </div>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Remover regra"
              onClick={() => remove.mutate(rule.id)}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </li>
        ))}
        {(conflicts.data ?? []).length === 0 ? (
          <li className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nenhuma regra criada. Todos os serviços podem ser combinados.
          </li>
        ) : null}
      </ul>
    </section>
  );
}
