import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Mail, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { panelQuery, entitlementsQuery } from "./app";
import { WEEKDAY_SHORT } from "@/lib/format";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhotoField } from "@/components/ui/photo-field";
import { useServerFn } from "@tanstack/react-start";
import {
  inviteProfessional,
  listProfessionalInvites,
  revokeProfessionalInvite,
} from "@/lib/team.functions";

export const Route = createFileRoute("/_authenticated/app/profissionais")({
  component: ProfessionalsPage,
});

function ProfessionalsPage() {
  const { data: panel } = useSuspenseQuery(panelQuery);
  const { data: entitlements } = useSuspenseQuery(entitlementsQuery);
  const commissionsEnabled =
    ((entitlements?.features ?? {}) as Record<string, unknown>)["commissions"] === true;
  const teamManageEnabled =
    ((entitlements?.features ?? {}) as Record<string, unknown>)["team_manage"] === true;
  const businessId = panel.business!.id;
  const plan = panel.subscription?.plans as { professional_limit?: number | null; name?: string } | null;
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", commission: "0" });

  const sendInvite = useServerFn(inviteProfessional);
  const fetchInvites = useServerFn(listProfessionalInvites);
  const revokeInvite = useServerFn(revokeProfessionalInvite);
  const [inviteEmail, setInviteEmail] = useState<Record<string, string>>({});

  const invites = useQuery({ queryKey: ["professional-invites", businessId], queryFn: () => fetchInvites() });

  const invite = useMutation({
    mutationFn: (input: { professionalId: string; email: string }) => sendInvite({ data: input }),
    onSuccess: (result) => {
      setInviteEmail({});
      toast.success(`Convite criado para ${result.professionalName}`, {
        description: "Envie o link de ativação para o profissional.",
        action: {
          label: "Copiar link",
          onClick: () => void navigator.clipboard.writeText(result.inviteUrl),
        },
      });
      queryClient.invalidateQueries({ queryKey: ["professional-invites", businessId] });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível convidar", {
        description: error.message.replace(/^[A-Z_]+:\s*/, ""),
      }),
  });

  const revoke = useMutation({
    mutationFn: (inviteId: string) => revokeInvite({ data: { inviteId } }),
    onSuccess: () => {
      toast.success("Convite revogado");
      queryClient.invalidateQueries({ queryKey: ["professional-invites", businessId] });
    },
    onError: (error: Error) => toast.error("Erro ao revogar", { description: error.message }),
  });

  const professionals = useQuery({
    queryKey: ["professionals", businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select("id, name, commission_percent, active, user_id, photo_url")
        .eq("business_id", businessId)
        .is("deleted_at", null)
        .order("name");
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const services = useQuery({
    queryKey: ["services", businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name")
        .eq("business_id", businessId)
        .is("deleted_at", null)
        .order("name");
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const links = useQuery({
    queryKey: ["professional-services", businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professional_services")
        .select("professional_id, service_id")
        .eq("business_id", businessId);
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Informe o nome");
      const professional = await supabase
        .from("professionals")
        .insert({
          business_id: businessId,
          name: form.name.trim(),
          commission_percent: Number(form.commission.replace(",", ".")) || 0,
        })
        .select("id")
        .single();
      if (professional.error) throw new Error(professional.error.message);
      const { error } = await supabase.from("professional_hours").insert(
        [1, 2, 3, 4, 5].map((weekday) => ({
          professional_id: professional.data.id,
          business_id: businessId,
          weekday,
          starts_at: "09:00",
          ends_at: "19:00",
          enabled: true,
        })),
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setForm({ name: "", commission: "0" });
      toast.success("Profissional adicionado");
      queryClient.invalidateQueries({ queryKey: ["professionals", businessId] });
      queryClient.invalidateQueries({ queryKey: ["panel"] });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível adicionar", {
        description: error.message.includes("PLAN_LIMIT_REACHED")
          ? `Seu plano ${plan?.name ?? ""} permite ${plan?.professional_limit} profissionais ativos. Faça upgrade para adicionar mais.`
          : error.message,
      }),
  });

  const toggleService = useMutation({
    mutationFn: async (input: { professionalId: string; serviceId: string; linked: boolean }) => {
      if (input.linked) {
        const { error } = await supabase
          .from("professional_services")
          .delete()
          .eq("professional_id", input.professionalId)
          .eq("service_id", input.serviceId);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("professional_services").insert({
          professional_id: input.professionalId,
          service_id: input.serviceId,
          business_id: businessId,
        });
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["professional-services", businessId] }),
    onError: (error: Error) => toast.error("Erro ao vincular serviço", { description: error.message }),
  });

  const setActive = useMutation({
    mutationFn: async (input: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from("professionals")
        .update({ active: input.active })
        .eq("id", input.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["professionals", businessId] });
      queryClient.invalidateQueries({ queryKey: ["panel"] });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível alterar", {
        description: error.message.includes("PLAN_LIMIT_REACHED")
          ? "Limite de profissionais do plano atingido."
          : error.message,
      }),
  });

  const setPhoto = useMutation({
    mutationFn: async (input: { id: string; url: string | null }) => {
      const { error } = await supabase
        .from("professionals")
        .update({ photo_url: input.url })
        .eq("id", input.id)
        .eq("business_id", businessId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Foto atualizada!");
      queryClient.invalidateQueries({ queryKey: ["professionals", businessId] });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível atualizar a foto", {
        description: error.message.includes("FEATURE_LOCKED_TEAM")
          ? "Edição de profissionais exige um plano superior."
          : error.message,
      }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("professionals")
        .update({ deleted_at: new Date().toISOString(), active: false })
        .eq("id", id)
        .eq("business_id", businessId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Profissional removido");
      queryClient.invalidateQueries({ queryKey: ["professionals", businessId] });
      queryClient.invalidateQueries({ queryKey: ["panel"] });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível remover", {
        description: error.message.includes("FEATURE_LOCKED_TEAM")
          ? "Excluir profissionais exige um plano superior."
          : error.message,
      }),
  });



  return (
    <div>
      <BackButton />
      <h1 className="font-display text-2xl font-bold text-foreground">Equipe</h1>
      <p className="text-sm text-muted-foreground">
        {panel.usage?.activeProfessionals} ativo(s)
        {plan?.professional_limit ? ` de ${plan.professional_limit} do plano ${plan.name}` : " · plano ilimitado"}
      </p>
      {!teamManageEnabled ? (
        <p className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          No seu plano a equipe é apenas de consulta: você pode visualizar os profissionais, mas
          editar ou excluir exige um plano superior.
        </p>
      ) : null}

      <form
        className="mt-6 grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3"
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
          <Label>Comissão (%)</Label>
          <Input
            inputMode="decimal"
            disabled={!commissionsEnabled}
            value={commissionsEnabled ? form.commission : "0"}
            onChange={(e) => setForm({ ...form, commission: e.target.value })}
          />
          {!commissionsEnabled ? (
            <p className="text-xs text-muted-foreground">
              Comissões disponíveis no plano Ilimitado.
            </p>
          ) : null}
        </div>
        <div className="sm:col-span-3">
          <Button type="submit" disabled={create.isPending}>
            <Plus className="size-4" aria-hidden /> Adicionar profissional
          </Button>
        </div>
      </form>

      <div className="mt-6 space-y-3">
        {(professionals.data ?? []).map((professional) => (
          <article key={professional.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {professional.photo_url ? (
                  <img
                    src={professional.photo_url}
                    alt={professional.name}
                    className="size-12 rounded-full object-cover"
                  />
                ) : null}
                <div>
                  <p className="font-medium text-card-foreground">{professional.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Comissão de {Number(professional.commission_percent)}%
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!teamManageEnabled}
                  onClick={() => setActive.mutate({ id: professional.id, active: !professional.active })}
                >
                  {professional.active ? "Ativo" : "Inativo"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remover ${professional.name}`}
                  disabled={!teamManageEnabled}
                  onClick={() => remove.mutate(professional.id)}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            </div>

            <div className="mt-3">
              <PhotoField
                businessId={businessId}
                folder="profissionais"
                value={professional.photo_url}
                onChange={(url) => setPhoto.mutate({ id: professional.id, url })}
                label="Foto do profissional"
                disabled={!teamManageEnabled}
              />
            </div>


            <p className="mt-4 text-xs uppercase tracking-wide text-muted-foreground">
              Serviços que realiza
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(services.data ?? []).map((service) => {
                const linked = (links.data ?? []).some(
                  (l) => l.professional_id === professional.id && l.service_id === service.id,
                );
                return (
                  <button
                    key={service.id}
                    onClick={() =>
                      toggleService.mutate({
                        professionalId: professional.id,
                        serviceId: service.id,
                        linked,
                      })
                    }
                    className={`rounded-full border px-3 py-1.5 text-sm transition ${linked ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"}`}
                  >
                    {service.name}
                  </button>
                );
              })}
            </div>

            <ProfessionalAccess
              hasAccess={Boolean(professional.user_id)}
              pendingInvite={(invites.data ?? []).find(
                (i) => i.professional_id === professional.id && i.status === "PENDING",
              )}
              email={inviteEmail[professional.id] ?? ""}
              onEmailChange={(value) => setInviteEmail((prev) => ({ ...prev, [professional.id]: value }))}
              onInvite={() =>
                invite.mutate({
                  professionalId: professional.id,
                  email: (inviteEmail[professional.id] ?? "").trim(),
                })
              }
              onRevoke={(inviteId) => revoke.mutate(inviteId)}
              busy={invite.isPending || revoke.isPending}
            />

            <ProfessionalHours professionalId={professional.id} businessId={businessId} />
          </article>
        ))}
      </div>
    </div>
  );
}

function ProfessionalAccess({
  hasAccess,
  pendingInvite,
  email,
  onEmailChange,
  onInvite,
  onRevoke,
  busy,
}: {
  hasAccess: boolean;
  pendingInvite?: { id: string; email: string; expires_at: string } | undefined;
  email: string;
  onEmailChange: (value: string) => void;
  onInvite: () => void;
  onRevoke: (inviteId: string) => void;
  busy: boolean;
}) {
  return (
    <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Acesso ao painel</p>
      {hasAccess ? (
        <p className="mt-1 text-sm text-card-foreground">
          Este profissional já entra no painel e vê apenas a própria agenda.
        </p>
      ) : pendingInvite ? (
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">
            Convite pendente para {pendingInvite.email} · expira em{" "}
            {new Date(pendingInvite.expires_at).toLocaleDateString("pt-BR")}
          </p>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onRevoke(pendingInvite.id)}>
            Revogar
          </Button>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div className="min-w-[220px] flex-1 space-y-1.5">
            <Label>E-mail do profissional</Label>
            <Input
              type="email"
              value={email}
              placeholder="nome@email.com"
              onChange={(e) => onEmailChange(e.target.value)}
            />
          </div>
          <Button size="sm" variant="outline" disabled={busy || email.trim().length < 5} onClick={onInvite}>
            <Mail className="size-4" aria-hidden /> Convidar
          </Button>
        </div>
      )}
    </div>
  );
}

function ProfessionalHours({ professionalId, businessId }: { professionalId: string; businessId: string }) {
  const queryClient = useQueryClient();
  const hours = useQuery({
    queryKey: ["professional-hours", professionalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professional_hours")
        .select("id, weekday, starts_at, ends_at, enabled, lunch_starts_at, lunch_ends_at")
        .eq("professional_id", professionalId)
        .order("weekday");
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const upsert = useMutation({
    mutationFn: async (input: {
      weekday: number;
      enabled: boolean;
      starts_at: string;
      ends_at: string;
      lunch_starts_at: string | null;
      lunch_ends_at: string | null;
    }) => {
      const payload = {
        enabled: input.enabled,
        starts_at: input.starts_at,
        ends_at: input.ends_at,
        lunch_starts_at: input.lunch_starts_at || null,
        lunch_ends_at: input.lunch_ends_at || null,
      };
      const existing = (hours.data ?? []).find((h) => h.weekday === input.weekday);
      if (existing) {
        const { error } = await supabase
          .from("professional_hours")
          .update(payload)
          .eq("id", existing.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("professional_hours").insert({
          professional_id: professionalId,
          business_id: businessId,
          weekday: input.weekday,
          ...payload,
        });
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["professional-hours", professionalId] }),
  });

  return (
    <div className="mt-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Horários de trabalho</p>
      <div className="mt-2 space-y-2">
        {[0, 1, 2, 3, 4, 5, 6].map((weekday) => {
          const row = (hours.data ?? []).find((h) => h.weekday === weekday);
          const starts = (row?.starts_at ?? "09:00").slice(0, 5);
          const ends = (row?.ends_at ?? "19:00").slice(0, 5);
          const enabled = row?.enabled ?? false;
          return (
            <div key={weekday} className="flex items-center gap-2 text-sm">
              <button
                onClick={() => upsert.mutate({ weekday, enabled: !enabled, starts_at: starts, ends_at: ends })}
                className={`w-14 rounded-md border px-2 py-1 ${enabled ? "border-primary bg-primary/10" : "border-border text-muted-foreground"}`}
              >
                {WEEKDAY_SHORT[weekday]}
              </button>
              <input
                type="time"
                value={starts}
                onChange={(e) =>
                  upsert.mutate({ weekday, enabled, starts_at: e.target.value, ends_at: ends })
                }
                className="h-8 rounded-md border border-input bg-background px-2"
              />
              <span className="text-muted-foreground">até</span>
              <input
                type="time"
                value={ends}
                onChange={(e) =>
                  upsert.mutate({ weekday, enabled, starts_at: starts, ends_at: e.target.value })
                }
                className="h-8 rounded-md border border-input bg-background px-2"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
