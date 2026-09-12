import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { panelQuery } from "./app";
import { updateBusinessSettings } from "@/lib/panel.functions";
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
import { generateBookingShareMessage, SHARE_STYLES, type ShareStyle } from "@/lib/booking-share";

const SHARE_NICHES = [
  ["BARBERSHOP", "Barbearia"],
  ["HAIR_SALON", "Salão de beleza"],
  ["BEAUTY_SALON", "Espaço de beleza"],
  ["AESTHETIC_CLINIC", "Clínica de estética"],
  ["NAIL_SALON", "Espaço de unhas"],
  ["MASSAGE", "Bem-estar e massagem"],
  ["TATTOO", "Estúdio de tatuagem"],
  ["THERAPY", "Consultório"],
  ["OTHER", "Outro negócio"],
] as const;

export const Route = createFileRoute("/_authenticated/app/configuracoes")({
  component: SettingsPage,
});

function SettingsPage() {
  const { data: panel } = useSuspenseQuery(panelQuery);
  const business = panel.business!;
  const queryClient = useQueryClient();
  const saveBusinessSettings = useServerFn(updateBusinessSettings);
  const [form, setForm] = useState({
    name: business.name,
    description: business.description ?? "",
    whatsapp: business.whatsapp ?? "",
    email: business.email ?? "",
    address: business.address ?? "",
    booking_policy: business.booking_policy ?? "",
    show_address: business.show_address,
    show_whatsapp: business.show_whatsapp,
    agenda_alerts_enabled: business.agenda_alerts_enabled,
    confirmation_enabled: business.confirmation_enabled,
    confirmation_minutes: String(business.confirmation_minutes),
    booking_share_message: business.booking_share_message ?? "",
    booking_share_niche: business.booking_share_niche ?? business.business_type,
    booking_share_style: (business.booking_share_style ?? "professional") as ShareStyle,
    slot_interval_minutes: String(business.slot_interval_minutes),
    min_notice_minutes: String(business.min_notice_minutes),
    max_advance_days: String(business.max_advance_days),
    cancellation_deadline_hours: String(business.cancellation_deadline_hours ?? 1),
    primary_color: business.primary_color ?? "#B4884F",
    secondary_color: business.secondary_color ?? "#14120F",
  });

  const save = useMutation({
    mutationFn: async () => {
      await saveBusinessSettings({
        data: {
          businessId: business.id,
          values: {
            name: form.name.trim(),
            description: form.description.trim() || null,
            whatsapp: form.whatsapp.trim() || null,
            email: form.email.trim() || null,
            address: form.address.trim() || null,
            booking_policy: form.booking_policy.trim() || null,
            show_address: form.show_address,
            show_whatsapp: form.show_whatsapp,
            agenda_alerts_enabled: form.agenda_alerts_enabled,
            confirmation_enabled: form.confirmation_enabled,
            confirmation_minutes: Math.max(
              0,
              Math.min(10080, Number(form.confirmation_minutes) || 0),
            ),
            booking_share_message: form.booking_share_message.trim() || null,
            booking_share_niche: form.booking_share_niche,
            booking_share_style: form.booking_share_style,
            slot_interval_minutes: Number(form.slot_interval_minutes) || 15,
            min_notice_minutes: Number(form.min_notice_minutes) || 0,
            max_advance_days: Number(form.max_advance_days) || 30,
            cancellation_deadline_hours: Math.max(
              0,
              Math.min(720, Number(form.cancellation_deadline_hours) || 1),
            ),
            primary_color: form.primary_color,
            secondary_color: form.secondary_color,
          },
        },
      });
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
        .select("id, weekday, opens_at, closes_at, closed")
        .eq("business_id", business.id)
        .order("weekday");
      if (error) throw new Error(error.message);
      return data;
    },
  });

  type BusinessHourDraft = { opens_at: string; closes_at: string; closed: boolean };
  const [hourDrafts, setHourDrafts] = useState<Record<number, BusinessHourDraft>>({});
  useEffect(() => {
    if (!hours.data) return;
    setHourDrafts(
      Object.fromEntries(
        [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
          const row = hours.data.find((item) => item.weekday === weekday);
          return [
            weekday,
            {
              opens_at: (row?.opens_at ?? "09:00").slice(0, 5),
              closes_at: (row?.closes_at ?? "19:00").slice(0, 5),
              closed: row?.closed ?? true,
            },
          ];
        }),
      ),
    );
  }, [hours.data]);

  const saveHours = useMutation({
    mutationFn: async () => {
      for (const weekday of [0, 1, 2, 3, 4, 5, 6]) {
        const draft = hourDrafts[weekday];
        if (!draft) continue;
        const existing = (hours.data ?? []).find((item) => item.weekday === weekday);
        const payload = {
          business_id: business.id,
          weekday,
          opens_at: draft.opens_at,
          closes_at: draft.closes_at,
          closed: draft.closed,
        };
        const result = existing
          ? await supabase.from("business_hours").update(payload).eq("id", existing.id)
          : await supabase.from("business_hours").insert(payload);
        if (result.error) throw new Error(result.error.message);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["business-hours", business.id] });
      toast.success("Horário de funcionamento salvo", {
        description: "A disponibilidade pública foi atualizada.",
      });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível salvar o horário", { description: userFacingError(error) }),
  });

  return (
    <div>
      <BackButton />
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
          <WhatsappInput
            value={form.whatsapp}
            onChange={(v) => setForm({ ...form, whatsapp: v })}
          />
        </div>

        <div className="space-y-1.5">
          <Label>E-mail</Label>
          <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <p className="text-xs text-muted-foreground">Nunca aparece na página pública.</p>
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
              checked={form.show_address}
              onChange={(e) => setForm({ ...form, show_address: e.target.checked })}
            />
            Mostrar endereço para clientes
          </label>
        </div>
        <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3 sm:col-span-2">
          <p className="text-sm font-medium text-foreground">Alertas da agenda</p>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={form.agenda_alerts_enabled}
              onChange={(e) => setForm({ ...form, agenda_alerts_enabled: e.target.checked })}
            />
            Mostrar alerta quando houver agendamentos na agenda
          </label>
          <p className="text-xs text-muted-foreground">
            Você pode limpar um alerta na agenda; ele reaparece quando houver um novo agendamento.
          </p>
        </div>
        <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4 sm:col-span-2">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Mensagem do link de agendamentos
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Compartilhe o link com seus clientes para eles encontrarem horários e agendarem
              sozinhos.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm text-muted-foreground">
              Nicho
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-foreground"
                value={form.booking_share_niche}
                onChange={(e) => setForm({ ...form, booking_share_niche: e.target.value })}
              >
                {SHARE_NICHES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm text-muted-foreground">
              Estilo da frase
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-foreground"
                value={form.booking_share_style}
                onChange={(e) =>
                  setForm({ ...form, booking_share_style: e.target.value as ShareStyle })
                }
              >
                {SHARE_STYLES.map((style) => (
                  <option key={style.value} value={style.value}>
                    {style.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Textarea
            value={form.booking_share_message}
            onChange={(e) => setForm({ ...form, booking_share_message: e.target.value })}
            placeholder="Crie uma frase para acompanhar o seu link..."
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setForm({
                  ...form,
                  booking_share_message: generateBookingShareMessage(
                    form.name,
                    form.booking_share_niche,
                    form.booking_share_style,
                  ),
                })
              }
            >
              Criar frase do link
            </Button>
            <span className="text-xs text-muted-foreground">
              Você pode editar a sugestão antes de salvar.
            </span>
          </div>
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
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>Mensagens de confirmação</Label>
              <p className="text-xs text-muted-foreground">
                Ao confirmar, prepara uma mensagem com o link seguro para o cliente.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.confirmation_enabled}
                onChange={(e) => setForm({ ...form, confirmation_enabled: e.target.checked })}
              />
              Ativar
            </label>
          </div>
          <div className="max-w-xs space-y-1.5">
            <Label>Disponibilizar confirmação (minutos antes)</Label>
            <Input
              type="number"
              min="0"
              max="10080"
              value={form.confirmation_minutes}
              onChange={(e) => setForm({ ...form, confirmation_minutes: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Zero significa imediatamente. O envio automático depende de um provedor WhatsApp
              conectado.
            </p>
          </div>
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

      <h2 className="mt-8 font-display text-lg font-semibold text-foreground">
        Horário de funcionamento
      </h2>
      <div className="mt-3 space-y-2 rounded-xl border border-border bg-card p-4">
        {[0, 1, 2, 3, 4, 5, 6].map((weekday) => {
          const draft = hourDrafts[weekday] ?? {
            opens_at: "09:00",
            closes_at: "19:00",
            closed: true,
          };
          return (
            <div key={weekday} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-24 text-muted-foreground">{WEEKDAY_LABELS[weekday]}</span>
              <Button
                type="button"
                size="sm"
                variant={draft.closed ? "ghost" : "outline"}
                onClick={() =>
                  setHourDrafts((current) => ({
                    ...current,
                    [weekday]: { ...draft, closed: !draft.closed },
                  }))
                }
              >
                {draft.closed ? "Fechado" : "Aberto"}
              </Button>
              <input
                type="time"
                value={draft.opens_at}
                onChange={(e) =>
                  setHourDrafts((current) => ({
                    ...current,
                    [weekday]: { ...draft, opens_at: e.target.value },
                  }))
                }
                className="h-8 rounded-md border border-input bg-background px-2"
              />
              <span className="text-muted-foreground">até</span>
              <input
                type="time"
                value={draft.closes_at}
                onChange={(e) =>
                  setHourDrafts((current) => ({
                    ...current,
                    [weekday]: { ...draft, closes_at: e.target.value },
                  }))
                }
                className="h-8 rounded-md border border-input bg-background px-2"
              />
            </div>
          );
        })}
        <Button
          type="button"
          className="mt-3"
          disabled={saveHours.isPending || !hours.data}
          onClick={() => saveHours.mutate()}
        >
          {saveHours.isPending ? "Salvando..." : "Salvar horário de funcionamento"}
        </Button>
      </div>

      <InstallAppSection />
    </div>
  );
}

function InstallAppSection() {
  const { canInstall, installed, install, manualHint } = useInstallApp();
  const [hint, setHint] = useState(false);

  return (
    <div className="mt-8 rounded-xl border border-border bg-card p-5">
      <h2 className="font-display text-lg font-bold text-foreground">Instalar Agendou Pro</h2>
      <p className="mt-1 text-sm text-muted-foreground">
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
  );
}
