import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { panelQuery } from "./app";
import { WEEKDAY_LABELS } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/app/configuracoes")({
  component: SettingsPage,
});

function SettingsPage() {
  const { data: panel } = useSuspenseQuery(panelQuery);
  const business = panel.business!;
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: business.name,
    description: business.description ?? "",
    whatsapp: business.whatsapp ?? "",
    email: business.email ?? "",
    address: business.address ?? "",
    booking_policy: business.booking_policy ?? "",
    show_address: business.show_address,
    show_whatsapp: business.show_whatsapp,
    slot_interval_minutes: String(business.slot_interval_minutes),
    min_notice_minutes: String(business.min_notice_minutes),
    max_advance_days: String(business.max_advance_days),
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("businesses")
        .update({
          name: form.name.trim(),
          description: form.description.trim() || null,
          whatsapp: form.whatsapp.trim() || null,
          email: form.email.trim() || null,
          address: form.address.trim() || null,
          booking_policy: form.booking_policy.trim() || null,
          slot_interval_minutes: Number(form.slot_interval_minutes) || 15,
          min_notice_minutes: Number(form.min_notice_minutes) || 0,
          max_advance_days: Number(form.max_advance_days) || 30,
        })
        .eq("id", business.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Configurações salvas");
      queryClient.invalidateQueries({ queryKey: ["panel"] });
    },
    onError: (error: Error) => toast.error("Não foi possível salvar", { description: error.message }),
  });

  const hours = useQuery({
    queryKey: ["business-hours", business.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_hours")
        .select("id, weekday, opens_at, closes_at, closed")
        .eq("business_id", business.id)
        .order("weekday");
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const saveHour = useMutation({
    mutationFn: async (input: { id: string; opens_at: string; closes_at: string; closed: boolean }) => {
      const { error } = await supabase
        .from("business_hours")
        .update({ opens_at: input.opens_at, closes_at: input.closes_at, closed: input.closed })
        .eq("id", input.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["business-hours", business.id] }),
  });

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-foreground">Ajustes do negócio</h1>
      <p className="text-sm text-muted-foreground">
        Link público: /{business.slug} · fuso {business.timezone}
      </p>

      <form
        className="mt-6 grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Nome</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Descrição</Label>
          <Textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>WhatsApp</Label>
          <Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>E-mail</Label>
          <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Endereço</Label>
          <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Política de agendamento</Label>
          <Textarea
            value={form.booking_policy}
            onChange={(e) => setForm({ ...form, booking_policy: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Intervalo de horários (min)</Label>
          <Input
            value={form.slot_interval_minutes}
            onChange={(e) => setForm({ ...form, slot_interval_minutes: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Antecedência mínima (min)</Label>
          <Input
            value={form.min_notice_minutes}
            onChange={(e) => setForm({ ...form, min_notice_minutes: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Antecedência máxima (dias)</Label>
          <Input
            value={form.max_advance_days}
            onChange={(e) => setForm({ ...form, max_advance_days: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={save.isPending}>
            Salvar alterações
          </Button>
        </div>
      </form>

      <h2 className="mt-8 font-display text-lg font-semibold text-foreground">Horário de funcionamento</h2>
      <div className="mt-3 space-y-2 rounded-xl border border-border bg-card p-4">
        {(hours.data ?? []).map((hour) => (
          <div key={hour.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="w-24 text-muted-foreground">{WEEKDAY_LABELS[hour.weekday]}</span>
            <Button
              size="sm"
              variant={hour.closed ? "ghost" : "outline"}
              onClick={() =>
                saveHour.mutate({
                  id: hour.id,
                  opens_at: hour.opens_at,
                  closes_at: hour.closes_at,
                  closed: !hour.closed,
                })
              }
            >
              {hour.closed ? "Fechado" : "Aberto"}
            </Button>
            <input
              type="time"
              value={hour.opens_at.slice(0, 5)}
              onChange={(e) =>
                saveHour.mutate({
                  id: hour.id,
                  opens_at: e.target.value,
                  closes_at: hour.closes_at,
                  closed: hour.closed,
                })
              }
              className="h-8 rounded-md border border-input bg-background px-2"
            />
            <span className="text-muted-foreground">até</span>
            <input
              type="time"
              value={hour.closes_at.slice(0, 5)}
              onChange={(e) =>
                saveHour.mutate({
                  id: hour.id,
                  opens_at: hour.opens_at,
                  closes_at: e.target.value,
                  closed: hour.closed,
                })
              }
              className="h-8 rounded-md border border-input bg-background px-2"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
