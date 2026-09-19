import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { panelQuery } from "./app";
import { WEEKDAY_LABELS } from "@/lib/format";
import { userFacingError } from "@/lib/user-facing-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WhatsappInput } from "@/components/ui/whatsapp-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useInstallApp } from "@/lib/use-install-app";
import { BackButton } from "@/components/BackButton";
import { uploadBusinessMedia } from "@/lib/media";

export const Route = createFileRoute("/_authenticated/app/configuracoes")({
  component: SettingsPage,
});

function SettingsPage() {
  const { data: panel } = useSuspenseQuery(panelQuery);
  const business = panel.business!;
  const queryClient = useQueryClient();
  const [businessSettingsOpen, setBusinessSettingsOpen] = useState(false);
  const [hoursOpen, setHoursOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [couponsOpen, setCouponsOpen] = useState(false);
  const [defaultHours, setDefaultHours] = useState({
    opens_at: "09:00",
    closes_at: "19:00",
    closed: false,
    lunch_enabled: true,
    lunch_starts_at: "12:00",
    lunch_ends_at: "13:00",
  });
  const [recoveryDays, setRecoveryDays] = useState(String(business.client_recovery_days ?? 60));
  const [couponForm, setCouponForm] = useState({
    id: "",
    code: "",
    discount_percent: "",
    starts_at: "",
    expires_at: "",
    active: true,
    single_use_per_client: false,
    usage_limit: "",
    notes: "",
  });
  const [form, setForm] = useState({
    name: business.name,
    description: business.description ?? "",
    whatsapp: business.whatsapp ?? "",
    instagram_url: business.instagram_url ?? "",
    google_review_url: business.google_review_url ?? "",
    email: business.email ?? "",
    address: business.address ?? "",
    booking_policy: business.booking_policy ?? "",
    show_address: business.show_address,
    show_whatsapp: business.show_whatsapp,
    show_instagram: business.show_instagram,
    slot_interval_minutes: String(business.slot_interval_minutes),
    min_notice_minutes: String(business.min_notice_minutes),
    max_advance_days: String(business.max_advance_days),
    cancellation_deadline_hours: String(business.cancellation_deadline_hours ?? 1),
    primary_color: business.primary_color ?? "#B4884F",
    secondary_color: business.secondary_color ?? "#14120F",
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("businesses")
        .update({
          name: form.name.trim(),
          description: form.description.trim() || null,
          whatsapp: form.whatsapp.trim() || null,
          instagram_url: form.instagram_url.trim() || null,
          google_review_url: form.google_review_url.trim() || null,
          email: form.email.trim() || null,
          address: form.address.trim() || null,
          booking_policy: form.booking_policy.trim() || null,
          show_address: form.show_address,
          show_whatsapp: form.show_whatsapp,
          show_instagram: form.show_instagram,
          slot_interval_minutes: Number(form.slot_interval_minutes) || 15,
          min_notice_minutes: Number(form.min_notice_minutes) || 0,
          max_advance_days: Number(form.max_advance_days) || 30,
          cancellation_deadline_hours: Math.max(
            0,
            Math.min(720, Number(form.cancellation_deadline_hours) || 1),
          ),
          primary_color: form.primary_color,
          secondary_color: form.secondary_color,
        })
        .eq("id", business.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Configurações salvas");
      queryClient.invalidateQueries({ queryKey: ["panel"] });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível salvar", { description: userFacingError(error) }),
  });

  const hours = useQuery({
    queryKey: ["business-hours", business.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_hours")
        .select("id, weekday, opens_at, closes_at, closed, lunch_starts_at, lunch_ends_at")
        .eq("business_id", business.id)
        .order("weekday");
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const saveHour = useMutation({
    mutationFn: async (input: {
      id: string;
      opens_at: string;
      closes_at: string;
      closed: boolean;
      lunch_starts_at: string;
      lunch_ends_at: string;
    }) => {
      const { error } = await supabase
        .from("business_hours")
        .update({
          opens_at: input.opens_at,
          closes_at: input.closes_at,
          closed: input.closed,
          lunch_starts_at: input.lunch_starts_at,
          lunch_ends_at: input.lunch_ends_at,
        })
        .eq("id", input.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["business-hours", business.id] }),
  });

  const applyDefaultHours = useMutation({
    mutationFn: async () => {
      const rows = hours.data ?? [];
      if (rows.length === 0) throw new Error("Nenhum horário de funcionamento foi encontrado");

      const { error } = await supabase.from("business_hours").upsert(
        rows.map((hour) => ({
          id: hour.id,
          business_id: business.id,
          weekday: hour.weekday,
          opens_at: defaultHours.opens_at,
          closes_at: defaultHours.closes_at,
          closed: defaultHours.closed,
          ...(defaultHours.lunch_enabled
            ? {
                lunch_starts_at: defaultHours.lunch_starts_at,
                lunch_ends_at: defaultHours.lunch_ends_at,
              }
            : {}),
        })),
        { onConflict: "id" },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Horário padrão aplicado a todos os dias");
      queryClient.invalidateQueries({ queryKey: ["business-hours", business.id] });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível aplicar o horário padrão", {
        description: userFacingError(error),
      }),
  });

  const coupons = useQuery({
    queryKey: ["coupons", business.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coupons")
        .select(
          "id, code, discount_percent, starts_at, expires_at, active, single_use_per_client, usage_limit, notes",
        )
        .eq("business_id", business.id)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
  });
  const saveRecovery = useMutation({
    mutationFn: async () => {
      const days = Math.max(1, Math.min(3650, Number(recoveryDays) || 60));
      const { error } = await supabase
        .from("businesses")
        .update({ client_recovery_days: days })
        .eq("id", business.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Período de recuperação salvo");
      queryClient.invalidateQueries({ queryKey: ["panel"] });
    },
  });
  const saveCoupon = useMutation({
    mutationFn: async () => {
      const payload = {
        business_id: business.id,
        code: couponForm.code.trim().toUpperCase(),
        discount_percent: Number(couponForm.discount_percent),
        starts_at: couponForm.starts_at || new Date().toISOString().slice(0, 10),
        expires_at: couponForm.expires_at || null,
        active: couponForm.active,
        single_use_per_client: couponForm.single_use_per_client,
        usage_limit: couponForm.usage_limit ? Number(couponForm.usage_limit) : null,
        notes: couponForm.notes.trim() || null,
      };
      const result = couponForm.id
        ? await supabase
            .from("coupons")
            .update(payload)
            .eq("id", couponForm.id)
            .eq("business_id", business.id)
        : await supabase.from("coupons").insert(payload);
      if (result.error) throw new Error(result.error.message);
    },
    onSuccess: () => {
      toast.success(couponForm.id ? "Cupom atualizado" : "Cupom criado");
      setCouponForm({
        id: "",
        code: "",
        discount_percent: "",
        starts_at: "",
        expires_at: "",
        active: true,
        single_use_per_client: false,
        usage_limit: "",
        notes: "",
      });
      queryClient.invalidateQueries({ queryKey: ["coupons", business.id] });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível salvar o cupom", { description: userFacingError(error) }),
  });
  const deleteCoupon = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("coupons")
        .delete()
        .eq("id", id)
        .eq("business_id", business.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Cupom excluído");
      queryClient.invalidateQueries({ queryKey: ["coupons", business.id] });
    },
  });

  return (
    <div>
      <BackButton />
      <h1 className="font-display text-2xl font-bold text-foreground">Ajustes do negócio</h1>
      <p className="text-sm text-muted-foreground">
        Link público: /{business.slug} · fuso {business.timezone}
      </p>

      <div className="mt-6 rounded-xl border border-border bg-card p-4">
        <Button
          type="button"
          variant={businessSettingsOpen ? "secondary" : "outline"}
          className="w-full justify-between sm:w-auto"
          onClick={() => setBusinessSettingsOpen((current) => !current)}
          aria-expanded={businessSettingsOpen}
        >
          <span>Ajustes do negócio</span>
          <ChevronDown
            className={`size-4 transition-transform ${businessSettingsOpen ? "rotate-180" : ""}`}
          />
        </Button>
      </div>
      {businessSettingsOpen ? (
        <form
          className="mt-3 grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-2"
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
            <WhatsappInput
              value={form.whatsapp}
              onChange={(v) => setForm({ ...form, whatsapp: v })}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Instagram</Label>
            <Input
              value={form.instagram_url}
              placeholder="@seuperfil ou instagram.com/seuperfil"
              onChange={(e) => setForm({ ...form, instagram_url: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Informe o @usuário ou o endereço completo do perfil.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>E-mail</Label>
            <Input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">Nunca aparece na página pública.</p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Avaliações no Google</Label>
            <p className="text-xs text-muted-foreground">
              Cole o link da sua página de avaliações. Ele será usado na mensagem de satisfação
              pós-atendimento.
            </p>
            <Input
              type="url"
              value={form.google_review_url}
              placeholder="https://..."
              onChange={(e) => setForm({ ...form, google_review_url: e.target.value })}
            />
          </div>
          <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3 sm:col-span-2">
            <p className="text-sm font-medium text-foreground">Visibilidade na página pública</p>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={form.show_whatsapp}
                onChange={(e) => setForm({ ...form, show_whatsapp: e.target.checked })}
              />
              Mostrar WhatsApp para clientes
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={form.show_instagram}
                onChange={(e) => setForm({ ...form, show_instagram: e.target.checked })}
              />
              Mostrar Instagram para clientes
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={form.show_address}
                onChange={(e) => setForm({ ...form, show_address: e.target.checked })}
              />
              Mostrar endereço para clientes
            </label>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Endereço</Label>
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
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
            <Label>Prazo Limite para Cancelamento (em horas)</Label>
            <Input
              type="number"
              min="0"
              max="720"
              value={form.cancellation_deadline_hours}
              onChange={(e) => setForm({ ...form, cancellation_deadline_hours: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Cancelamentos fora desse prazo estão sujeitos a multa de 10%.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Antecedência máxima (dias)</Label>
            <Input
              value={form.max_advance_days}
              onChange={(e) => setForm({ ...form, max_advance_days: e.target.value })}
            />
          </div>
          <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3 sm:col-span-2">
            <Label>Logo do negócio</Label>
            {business.logo_url ? (
              <img
                src={business.logo_url}
                alt="Logo atual"
                className="size-16 rounded-full object-cover"
              />
            ) : null}
            <Input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const url = await uploadBusinessMedia(business.id, "logo", file);
                  const { error } = await supabase
                    .from("businesses")
                    .update({ logo_url: url })
                    .eq("id", business.id);
                  if (error) throw error;
                  await queryClient.invalidateQueries({ queryKey: ["panel"] });
                  toast.success("Logo atualizada");
                } catch (error) {
                  toast.error("Não foi possível enviar a logo", {
                    description: userFacingError(error),
                  });
                }
              }}
            />
          </div>
          <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3 sm:col-span-2">
            <p className="text-sm font-medium text-foreground">Cores da página pública</p>
            <div className="flex flex-wrap gap-4">
              <label className="grid gap-1 text-sm">
                Primária{" "}
                <input
                  type="color"
                  value={form.primary_color}
                  onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                />
              </label>
              <label className="grid gap-1 text-sm">
                Secundária{" "}
                <input
                  type="color"
                  value={form.secondary_color}
                  onChange={(e) => setForm({ ...form, secondary_color: e.target.value })}
                />
              </label>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setForm({ ...form, primary_color: "#B4884F", secondary_color: "#14120F" })
                }
              >
                Restaurar Cores Padrão
              </Button>
            </div>
            <div
              className="rounded-lg p-3"
              style={{ backgroundColor: form.secondary_color, color: form.primary_color }}
            >
              Pré-visualização do tema público
            </div>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={save.isPending}>
              Salvar alterações
            </Button>
          </div>
        </form>
      ) : null}

      <div className="mt-6 rounded-xl border border-border bg-card p-4">
        <Button
          type="button"
          variant={hoursOpen ? "secondary" : "outline"}
          className="w-full justify-between sm:w-auto"
          onClick={() => setHoursOpen((current) => !current)}
          aria-expanded={hoursOpen}
        >
          <span>Horário de funcionamento</span>
          <ChevronDown className={`size-4 transition-transform ${hoursOpen ? "rotate-180" : ""}`} />
        </Button>
      </div>
      {hoursOpen ? (
        <div className="mt-3 space-y-2 rounded-xl border border-border bg-card p-4">
          <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <p className="font-medium text-foreground">Horário padrão</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure uma vez e aplique o mesmo horário de funcionamento e almoço a todos os dias.
              Depois, você ainda pode ajustar qualquer dia individualmente.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Abertura</span>
                <input
                  type="time"
                  value={defaultHours.opens_at}
                  onChange={(e) => setDefaultHours({ ...defaultHours, opens_at: e.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Fechamento</span>
                <input
                  type="time"
                  value={defaultHours.closes_at}
                  onChange={(e) => setDefaultHours({ ...defaultHours, closes_at: e.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2"
                />
              </label>
              <label className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={defaultHours.lunch_enabled}
                  onChange={(e) =>
                    setDefaultHours({ ...defaultHours, lunch_enabled: e.target.checked })
                  }
                />
                Configurar almoço
              </label>
              {defaultHours.lunch_enabled ? (
                <>
                  <label className="grid gap-1 text-sm">
                    <span className="text-muted-foreground">Início do almoço</span>
                    <input
                      type="time"
                      value={defaultHours.lunch_starts_at}
                      onChange={(e) =>
                        setDefaultHours({ ...defaultHours, lunch_starts_at: e.target.value })
                      }
                      className="h-9 rounded-md border border-input bg-background px-2"
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="text-muted-foreground">Fim do almoço</span>
                    <input
                      type="time"
                      value={defaultHours.lunch_ends_at}
                      onChange={(e) =>
                        setDefaultHours({ ...defaultHours, lunch_ends_at: e.target.value })
                      }
                      className="h-9 rounded-md border border-input bg-background px-2"
                    />
                  </label>
                </>
              ) : null}
              <Button
                type="button"
                onClick={() => applyDefaultHours.mutate()}
                disabled={applyDefaultHours.isPending || !hours.data?.length}
              >
                Aplicar a todos os dias
              </Button>
            </div>
          </div>
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
                    lunch_starts_at: hour.lunch_starts_at?.slice(0, 5) ?? "12:00",
                    lunch_ends_at: hour.lunch_ends_at?.slice(0, 5) ?? "13:00",
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
                    lunch_starts_at: hour.lunch_starts_at?.slice(0, 5) ?? "12:00",
                    lunch_ends_at: hour.lunch_ends_at?.slice(0, 5) ?? "13:00",
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
                    lunch_starts_at: hour.lunch_starts_at?.slice(0, 5) ?? "12:00",
                    lunch_ends_at: hour.lunch_ends_at?.slice(0, 5) ?? "13:00",
                  })
                }
                className="h-8 rounded-md border border-input bg-background px-2"
              />
              <span className="text-muted-foreground">· almoço</span>
              <input
                type="time"
                value={hour.lunch_starts_at?.slice(0, 5) ?? "12:00"}
                aria-label={`Início do almoço de ${WEEKDAY_LABELS[hour.weekday]}`}
                onChange={(e) =>
                  saveHour.mutate({
                    id: hour.id,
                    opens_at: hour.opens_at,
                    closes_at: hour.closes_at,
                    closed: hour.closed,
                    lunch_starts_at: e.target.value || "12:00",
                    lunch_ends_at: hour.lunch_ends_at?.slice(0, 5) ?? "13:00",
                  })
                }
                className="h-8 rounded-md border border-input bg-background px-2"
              />
              <span className="text-muted-foreground">às</span>
              <input
                type="time"
                value={hour.lunch_ends_at?.slice(0, 5) ?? "13:00"}
                aria-label={`Fim do almoço de ${WEEKDAY_LABELS[hour.weekday]}`}
                onChange={(e) =>
                  saveHour.mutate({
                    id: hour.id,
                    opens_at: hour.opens_at,
                    closes_at: hour.closes_at,
                    closed: hour.closed,
                    lunch_starts_at: hour.lunch_starts_at?.slice(0, 5) ?? "12:00",
                    lunch_ends_at: e.target.value || "13:00",
                  })
                }
                className="h-8 rounded-md border border-input bg-background px-2"
              />
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-6 rounded-xl border border-border bg-card p-4">
        <Button
          type="button"
          variant={recoveryOpen ? "secondary" : "outline"}
          className="w-full justify-between sm:w-auto"
          onClick={() => setRecoveryOpen((current) => !current)}
          aria-expanded={recoveryOpen}
        >
          <span>Clientes em recuperação</span>
          <ChevronDown
            className={`size-4 transition-transform ${recoveryOpen ? "rotate-180" : ""}`}
            aria-hidden
          />
        </Button>
        {recoveryOpen ? (
          <div className="mt-4 max-w-xl space-y-3">
            <p className="text-sm text-muted-foreground">
              Identifique clientes que não retornaram após o período configurado.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">
                  Considerar em recuperação após (dias)
                </span>
                <Input
                  type="number"
                  min={1}
                  max={3650}
                  value={recoveryDays}
                  onChange={(e) => setRecoveryDays(e.target.value)}
                />
              </label>
              <Button onClick={() => saveRecovery.mutate()} disabled={saveRecovery.isPending}>
                Salvar período
              </Button>
            </div>
          </div>
        ) : null}
      </div>
      <div className="mt-6 rounded-xl border border-border bg-card p-4">
        <Button
          type="button"
          variant={couponsOpen ? "secondary" : "outline"}
          className="w-full justify-between sm:w-auto"
          onClick={() => setCouponsOpen((current) => !current)}
          aria-expanded={couponsOpen}
        >
          <span>Configurar descontos</span>
          <ChevronDown
            className={`size-4 transition-transform ${couponsOpen ? "rotate-180" : ""}`}
            aria-hidden
          />
        </Button>
        {couponsOpen ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Crie e gerencie cupons para campanhas e recuperação de clientes.
            </p>
            <form
              className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                saveCoupon.mutate();
              }}
            >
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Código</span>
                <Input
                  required
                  value={couponForm.code}
                  onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value })}
                  placeholder="DESCONTO10"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Desconto (%)</span>
                <Input
                  required
                  type="number"
                  min={0.01}
                  max={100}
                  step={0.01}
                  value={couponForm.discount_percent}
                  onChange={(e) =>
                    setCouponForm({ ...couponForm, discount_percent: e.target.value })
                  }
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Data de início</span>
                <Input
                  type="date"
                  value={couponForm.starts_at}
                  onChange={(e) => setCouponForm({ ...couponForm, starts_at: e.target.value })}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Validade</span>
                <Input
                  type="date"
                  value={couponForm.expires_at}
                  onChange={(e) => setCouponForm({ ...couponForm, expires_at: e.target.value })}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Limite total</span>
                <Input
                  type="number"
                  min={1}
                  value={couponForm.usage_limit}
                  onChange={(e) => setCouponForm({ ...couponForm, usage_limit: e.target.value })}
                  placeholder="Opcional"
                />
              </label>
              <label className="flex items-center gap-2 pt-6 text-sm">
                <input
                  type="checkbox"
                  checked={couponForm.single_use_per_client}
                  onChange={(e) =>
                    setCouponForm({ ...couponForm, single_use_per_client: e.target.checked })
                  }
                />{" "}
                Uso único por cliente
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={couponForm.active}
                  onChange={(e) => setCouponForm({ ...couponForm, active: e.target.checked })}
                />{" "}
                Cupom ativo
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block text-muted-foreground">Observação</span>
                <Textarea
                  value={couponForm.notes}
                  onChange={(e) => setCouponForm({ ...couponForm, notes: e.target.value })}
                  placeholder="Campanha de retorno, aniversário..."
                />
              </label>
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" disabled={saveCoupon.isPending}>
                  <Plus className="size-4" aria-hidden />{" "}
                  {couponForm.id ? "Salvar cupom" : "Criar cupom"}
                </Button>
                {couponForm.id ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setCouponForm({
                        id: "",
                        code: "",
                        discount_percent: "",
                        starts_at: "",
                        expires_at: "",
                        active: true,
                        single_use_per_client: false,
                        usage_limit: "",
                        notes: "",
                      })
                    }
                  >
                    Cancelar
                  </Button>
                ) : null}
              </div>
            </form>
            <div className="space-y-2">
              {(coupons.data ?? []).map((coupon) => (
                <div
                  key={coupon.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
                >
                  <div>
                    <p className="font-semibold">
                      {coupon.code}{" "}
                      <span className="font-normal text-muted-foreground">
                        — {coupon.discount_percent}%
                      </span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {coupon.starts_at}
                      {coupon.expires_at ? ` até ${coupon.expires_at}` : " · sem validade"} ·{" "}
                      {coupon.active ? "Ativo" : "Inativo"}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setCouponForm({
                          id: coupon.id,
                          code: coupon.code,
                          discount_percent: String(coupon.discount_percent),
                          starts_at: coupon.starts_at,
                          expires_at: coupon.expires_at ?? "",
                          active: coupon.active,
                          single_use_per_client: coupon.single_use_per_client,
                          usage_limit: coupon.usage_limit ? String(coupon.usage_limit) : "",
                          notes: coupon.notes ?? "",
                        })
                      }
                    >
                      <Pencil className="size-4" aria-hidden /> Editar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteCoupon.mutate(coupon.id)}
                    >
                      <Trash2 className="size-4" aria-hidden /> Excluir
                    </Button>
                  </div>
                </div>
              ))}
              {(coupons.data ?? []).length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                  Nenhum cupom cadastrado.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      <InstallAppSection />
    </div>
  );
}

function InstallAppSection() {
  const { canInstall, installed, install, manualHint } = useInstallApp();
  const [hint, setHint] = useState(false);
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-4">
      <Button
        type="button"
        variant={open ? "secondary" : "outline"}
        className="w-full justify-between sm:w-auto"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <span>Instalar Agendou Pro</span>
        <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>
      {open ? (
        <div className="mt-4">
          <p className="text-sm text-muted-foreground">
            {installed
              ? "O Agendou Pro já está instalado neste dispositivo."
              : "Crie um atalho para abrir o Agendou Pro direto da tela inicial ou da área de trabalho."}
          </p>
          {installed ? null : (
            <>
              <Button
                className="mt-4"
                variant="outline"
                onClick={async () => {
                  const outcome = await install();
                  if (outcome === "accepted") {
                    toast.success("Atalho criado! Abra o Agendou Pro pelo ícone do app.");
                    return;
                  }
                  setHint(true);
                  toast.info(
                    outcome === "dismissed"
                      ? "Sem problemas — veja abaixo como criar o atalho manualmente."
                      : "Seu navegador não abre a instalação automática",
                    { description: manualHint, duration: 8000 },
                  );
                }}
              >
                Instalar Agendou Pro
              </Button>
              {hint || !canInstall ? (
                <p className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                  {manualHint}
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
