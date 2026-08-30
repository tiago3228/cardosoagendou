import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { panelQuery } from "./app";
import { formatBRL, formatDuration } from "@/lib/format";
import { businessTypeConfig } from "@/lib/business-types";
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
}

function ServicesPage() {
  const { data: panel } = useSuspenseQuery(panelQuery);
  const businessId = panel.business!.id;
  const config = businessTypeConfig(panel.business!.business_type);
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", category: "", price: "", duration: "30" });
  const [edit, setEdit] = useState<EditForm | null>(null);

  const services = useQuery({
    queryKey: ["services", businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, category, price_cents, duration_minutes, active")
        .eq("business_id", businessId)
        .is("deleted_at", null)
        .order("name");
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const price = Math.round(Number(form.price.replace(",", ".")) * 100);
      const duration = Number(form.duration);
      if (!form.name.trim()) throw new Error("Informe o nome do serviço");
      if (!Number.isFinite(price) || price < 0) throw new Error("Preço inválido");
      if (!Number.isFinite(duration) || duration < 5) throw new Error("Duração mínima de 5 minutos");
      const { error } = await supabase.from("services").insert({
        business_id: businessId,
        name: form.name.trim(),
        category: form.category.trim() || null,
        price_cents: price,
        duration_minutes: duration,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setForm({ name: "", category: "", price: "", duration: "30" });
      toast.success("Serviço criado");
      queryClient.invalidateQueries({ queryKey: ["services", businessId] });
    },
    onError: (error: Error) => toast.error("Não foi possível salvar", { description: error.message }),
  });

  const toggle = useMutation({
    mutationFn: async (input: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from("services")
        .update({ active: input.active })
        .eq("id", input.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["services", businessId] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
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
      if (!Number.isFinite(duration) || duration < 5) throw new Error("Duração mínima de 5 minutos");
      const { error } = await supabase
        .from("services")
        .update({
          name: input.name.trim(),
          category: input.category.trim() || null,
          price_cents: price,
          duration_minutes: duration,
        })
        .eq("id", input.id)
        .eq("business_id", businessId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setEdit(null);
      toast.success("Serviço atualizado");
      queryClient.invalidateQueries({ queryKey: ["services", businessId] });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível atualizar", { description: error.message }),
  });

  return (
    <div>
      <BackButton />
      <h1 className="font-display text-2xl font-bold text-foreground">Serviços</h1>
      <p className="text-sm text-muted-foreground">
        Categorias sugeridas para {config.label.toLowerCase()}: {config.categories.join(", ")}
      </p>

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
        <div className="sm:col-span-2">
          <Button type="submit" disabled={create.isPending}>
            <Plus className="size-4" aria-hidden /> Adicionar serviço
          </Button>
        </div>
      </form>

      <ul className="mt-6 space-y-2">
        {(services.data ?? []).map((service) => (
          <li key={service.id} className="rounded-xl border border-border bg-card p-4">
            {edit?.id === service.id ? (
              <form
                className="grid gap-3 sm:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  update.mutate(edit);
                }}
              >
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Nome</Label>
                  <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Categoria</Label>
                  <Input
                    value={edit.category}
                    onChange={(e) => setEdit({ ...edit, category: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Preço (R$)</Label>
                    <Input
                      inputMode="decimal"
                      value={edit.price}
                      onChange={(e) => setEdit({ ...edit, price: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Duração (min)</Label>
                    <Input
                      inputMode="numeric"
                      value={edit.duration}
                      onChange={(e) => setEdit({ ...edit, duration: e.target.value })}
                    />
                  </div>
                </div>
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
                  </p>
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

        ))}
      </ul>
    </div>
  );
}
