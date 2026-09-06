import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Clock,
  Instagram,
  MapPin,
  MessageCircle,
  Navigation,
} from "lucide-react";
import { toast } from "sonner";
import {
  createPublicAppointment,
  getAvailability,
  getPublicBusiness,
} from "@/lib/booking.functions";
import { formatBRL, formatDuration, normalizeInstagramUrl, whatsappLink } from "@/lib/format";
import { businessTypeConfig } from "@/lib/business-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WhatsappInput } from "@/components/ui/whatsapp-input";
import { Label } from "@/components/ui/label";

const businessQuery = (slug: string) =>
  queryOptions({
    queryKey: ["public-business", slug],
    queryFn: () => getPublicBusiness({ data: { slug } }),
  });

export const Route = createFileRoute("/$slug")({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(businessQuery(params.slug));
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Página não encontrada — Agendou" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const title = `${loaderData.business.name} — agende seu horário`;
    const description =
      loaderData.business.description ??
      `Escolha o serviço, o profissional e o horário em ${loaderData.business.name}.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        ...(loaderData.business.cover_url?.startsWith("https://")
          ? [
              { property: "og:image", content: loaderData.business.cover_url },
              { name: "twitter:image", content: loaderData.business.cover_url },
            ]
          : []),
      ],
    };
  },
  component: BookingPage,
  notFoundComponent: () => (
    <main className="flex min-h-screen items-center justify-center px-5 text-center">
      <div>
        <h1 className="font-display text-2xl font-bold">Página de reservas não encontrada</h1>
        <p className="mt-2 text-sm text-muted-foreground">Confira o link com o estabelecimento.</p>
        <Button asChild className="mt-6">
          <Link to="/">Ir para o início</Link>
        </Button>
      </div>
    </main>
  ),
});

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function BookingPage() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(businessQuery(slug));
  const business = data!.business;
  const config = businessTypeConfig(business.business_type);

  const fetchAvailability = useServerFn(getAvailability);
  const book = useServerFn(createPublicAppointment);

  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [professionalId, setProfessionalId] = useState<string | null>(null);
  const [date, setDate] = useState(todayISO());
  const [slots, setSlots] = useState<
    {
      professionalId: string;
      professionalName: string;
      slots: { label: string; startsAt: string }[];
    }[]
  >([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [chosen, setChosen] = useState<{ startsAt: string; professionalId: string } | null>(null);
  const [clientName, setClientName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [notes, setNotes] = useState("");
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState<{
    startsAt: string;
    totalPriceCents: number;
    manageToken: string;
  } | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  const chosenServices = useMemo(
    () => data!.services.filter((s) => selected.includes(s.id)),
    [data, selected],
  );
  const totalMinutes = chosenServices.reduce((sum, s) => sum + s.duration_minutes, 0);
  const totalCents = chosenServices.reduce((sum, s) => sum + s.price_cents, 0);
  const mapLink = business.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(business.address)}`
    : null;

  /** Warns when two services of the same category are picked (usually a mistake). */
  const categoryConflict = useMemo(() => {
    const seen = new Set<string>();
    for (const service of chosenServices) {
      const category = service.category?.trim();
      if (!category) continue;
      if (seen.has(category)) return category;
      seen.add(category);
    }
    return null;
  }, [chosenServices]);

  /** Owner-configured incompatibilities: these combinations are blocked, not just warned. */
  const conflictRules = data!.serviceConflicts ?? [];
  const conflictsWith = (serviceId: string, otherId: string) =>
    conflictRules.some(
      (rule) =>
        (rule.service_id === serviceId && rule.conflicting_service_id === otherId) ||
        (rule.service_id === otherId && rule.conflicting_service_id === serviceId),
    );
  const blockedService = (serviceId: string) =>
    !selected.includes(serviceId) && selected.some((sid) => conflictsWith(serviceId, sid));
  const hardConflict = useMemo(() => {
    for (const rule of conflictRules) {
      if (selected.includes(rule.service_id) && selected.includes(rule.conflicting_service_id)) {
        const nameOf = (id: string) => data!.services.find((s) => s.id === id)?.name ?? "serviço";
        return {
          message: `${nameOf(rule.service_id)} e ${nameOf(rule.conflicting_service_id)} não podem ser agendados juntos.`,
          reason: rule.reason,
        };
      }
    }
    return null;
  }, [conflictRules, selected, data]);

  const eligibleProfessionals = data!.professionals.filter((p) =>
    selected.every((sid) =>
      data!.links.some((l) => l.professional_id === p.id && l.service_id === sid),
    ),
  );

  const days = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < Math.min(business.max_advance_days, 30); i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      out.push(d.toISOString().slice(0, 10));
    }
    return out;
  }, [business.max_advance_days]);

  async function loadSlots(nextDate: string, prof: string | null) {
    setLoadingSlots(true);
    setChosen(null);
    idempotencyKey.current = null;
    try {
      const result = await fetchAvailability({
        data: { slug, date: nextDate, serviceIds: selected, professionalId: prof },
      });
      setSlots(result.byProfessional);
    } catch (error) {
      toast.error("Não foi possível carregar os horários", {
        description: error instanceof Error ? error.message.replace(/^[A-Z_]+:\s*/, "") : undefined,
      });
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    if (!chosen) return;
    setBusy(true);
    try {
      const result = await book({
        data: {
          slug,
          professionalId: chosen.professionalId,
          serviceIds: selected,
          startsAt: chosen.startsAt,
          clientName,
          whatsapp,
          notes: notes || undefined,
          policyAccepted,
          idempotencyKey: idempotencyKey.current ?? (idempotencyKey.current = crypto.randomUUID()),
        },
      });
      setConfirmed({
        startsAt: result.startsAt,
        totalPriceCents: result.totalPriceCents,
        manageToken: result.manageToken,
      });
      setStep(4);
    } catch (error) {
      toast.error("Não foi possível concluir a reserva", {
        description: error instanceof Error ? error.message.replace(/^[A-Z_]+:\s*/, "") : undefined,
      });
      if (error instanceof Error && error.message.includes("SLOT_UNAVAILABLE")) {
        await loadSlots(date, professionalId);
        setStep(2);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0B0A08] text-[#F2EDE4]">
      <div className="mx-auto min-h-screen max-w-[460px] overflow-hidden bg-[#14120F] pb-32 shadow-2xl">
        <div className="h-1 bg-[linear-gradient(90deg,#B4884F_0%,#B4884F_60%,transparent_60%,transparent_70%,#B4884F_70%,#B4884F_100%)]" />
        <div className="border-b border-[#35302A] px-5 py-6">
          {business.cover_url ? (
            <img
              src={business.cover_url}
              alt=""
              className="mb-5 h-32 w-full rounded-2xl object-cover opacity-80"
            />
          ) : null}
          <div className="flex items-center gap-4">
            {business.logo_url ? (
              <img
                src={business.logo_url}
                alt={`Logo de ${business.name}`}
                className="size-16 rounded-full border border-[#B4884F] object-cover"
              />
            ) : (
              <div className="flex size-16 shrink-0 items-center justify-center rounded-full border border-[#B4884F] font-display text-2xl font-bold text-[#D1A66C]">
                {business.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#B4884F]">
                {config.label}
              </p>
              <h1 className="mt-1 font-display text-3xl font-bold uppercase tracking-wide text-[#F2EDE4]">
                {business.name}
              </h1>
            </div>
          </div>
          {business.description ? (
            <p className="mt-4 text-sm leading-6 text-[#9C948A]">{business.description}</p>
          ) : null}
          {business.address ? (
            <a
              href={mapLink ?? undefined}
              target="_blank"
              rel="noreferrer"
              className="mt-4 flex items-start gap-2 rounded-xl border border-[#35302A] bg-[#1E1B17] p-3 text-sm text-[#F2EDE4] transition hover:border-[#B4884F]"
            >
              <MapPin className="mt-0.5 size-4 shrink-0 text-[#B4884F]" aria-hidden />
              <span className="flex-1">
                <span className="block text-xs font-semibold uppercase tracking-wide text-[#B4884F]">
                  Onde estamos
                </span>
                {business.address}
              </span>
              {mapLink ? (
                <Navigation className="size-4 shrink-0 text-[#B4884F]" aria-hidden />
              ) : null}
            </a>
          ) : null}
          {business.whatsapp ? (
            <a
              href={whatsappLink(
                business.whatsapp,
                `Olá! Vim pela página do Agendou e gostaria de tirar uma dúvida sobre ${business.name}.`,
              )}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[#B4884F] bg-[#B4884F] px-4 py-3 text-sm font-semibold text-[#14120F]"
            >
              <MessageCircle className="size-4" aria-hidden /> Falar com o estabelecimento
            </a>
          ) : null}
          {normalizeInstagramUrl(business.instagram_url) ? (
            <div className="mt-5 rounded-2xl border border-[#35302A] bg-[#1E1B17] p-4">
              <div className="flex items-start gap-3">
                <Instagram className="mt-0.5 size-5 shrink-0 text-[#B4884F]" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#B4884F]">
                    Siga nosso trabalho
                  </p>
                  <p className="mt-1 text-sm text-[#9C948A]">
                    Veja nossos serviços, resultados e novidades no Instagram.
                  </p>
                  <a
                    href={normalizeInstagramUrl(business.instagram_url) ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[#D1A66C] hover:underline"
                  >
                    <span>Ver Instagram</span> <ArrowRight className="size-4" aria-hidden />
                  </a>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="px-5 py-6">
          {step > 0 && step < 4 ? (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground"
            >
              <ChevronLeft className="size-4" aria-hidden /> Voltar
            </button>
          ) : null}

          {step === 0 ? (
            <section>
              <div className="mb-7 rounded-2xl border border-[#35302A] bg-[#1E1B17] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#B4884F]">
                  Agendamento online
                </p>
                <h2 className="mt-2 font-display text-3xl font-bold uppercase text-[#F2EDE4]">
                  Agendar horário
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#9C948A]">
                  Primeiro escolha quem vai realizar seu atendimento.
                </p>
              </div>
              <h2 className="font-display text-xl font-bold uppercase tracking-wide">
                1. Escolha o profissional
              </h2>
              <p className="mt-1 text-sm text-[#9C948A]">
                Depois você poderá escolher os serviços disponíveis para essa pessoa.
              </p>
              <ul className="mt-4 space-y-2">
                <li>
                  <button
                    onClick={() => {
                      setProfessionalId(null);
                      setSelected([]);
                      setStep(1);
                    }}
                    className="flex w-full items-center justify-between rounded-xl border border-[#35302A] bg-[#1E1B17] p-4 text-left font-medium text-[#F2EDE4] transition hover:border-[#B4884F]"
                  >
                    Qualquer profissional disponível
                    <ArrowRight className="size-4 text-[#B4884F]" aria-hidden />
                  </button>
                </li>
                {data!.professionals.map((professional) => (
                  <li key={professional.id}>
                    <button
                      onClick={() => {
                        setProfessionalId(professional.id);
                        setSelected([]);
                        setStep(1);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl border border-[#35302A] bg-[#1E1B17] p-4 text-left transition hover:border-[#B4884F]"
                    >
                      {professional.photo_url ? (
                        <img
                          src={professional.photo_url}
                          alt={professional.name}
                          className="size-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex size-12 items-center justify-center rounded-full border border-[#B4884F] text-lg font-semibold text-[#D1A66C]">
                          {professional.name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <span>
                        <span className="block font-medium text-[#F2EDE4]">
                          {professional.name}
                        </span>
                        {professional.bio ? (
                          <span className="text-sm text-[#9C948A]">{professional.bio}</span>
                        ) : null}
                      </span>
                      <ArrowRight className="ml-auto size-4 text-[#B4884F]" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {step === 1 ? (
            <section>
              <h2 className="font-display text-xl font-bold uppercase tracking-wide">
                2. Escolha os serviços
              </h2>
              <p className="mt-1 text-sm text-[#9C948A]">
                Pode escolher mais de um — somamos a duração automaticamente.
              </p>
              <ul className="mt-4 space-y-2">
                {data!.services
                  .filter(
                    (service) =>
                      !professionalId ||
                      data!.links.some(
                        (l) => l.professional_id === professionalId && l.service_id === service.id,
                      ),
                  )
                  .map((service) => {
                    const active = selected.includes(service.id);
                    const blocked = blockedService(service.id);
                    return (
                      <li key={service.id}>
                        <button
                          disabled={blocked}
                          aria-disabled={blocked}
                          onClick={() =>
                            setSelected((prev) =>
                              prev.includes(service.id)
                                ? prev.filter((id) => id !== service.id)
                                : [...prev, service.id],
                            )
                          }
                          className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition ${active ? "border-[#B4884F] bg-[#262220]" : "border-[#35302A] bg-[#1E1B17]"} ${blocked ? "cursor-not-allowed opacity-50" : "hover:border-[#B4884F]"}`}
                        >
                          <span>
                            <span className="block font-medium text-[#F2EDE4]">{service.name}</span>
                            <span className="mt-1 flex items-center gap-1 text-sm text-[#D1A66C]">
                              <Clock className="size-3.5" aria-hidden />
                              {formatDuration(service.duration_minutes)} ·{" "}
                              {formatBRL(service.price_cents)}
                            </span>
                            {blocked ? (
                              <span className="mt-1 block text-xs text-[#9C948A]">
                                Indisponível junto dos serviços já selecionados
                              </span>
                            ) : null}
                            {service.allows_parallel ? (
                              <span className="mt-1 block text-xs text-[#9C948A]">
                                Pode ocorrer atendimento simultâneo durante parte do serviço
                              </span>
                            ) : null}
                          </span>
                          {active ? <Check className="size-5 text-[#D1A66C]" aria-hidden /> : null}
                        </button>
                      </li>
                    );
                  })}
              </ul>
              {hardConflict ? (
                <p className="mt-4 rounded-lg border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-200">
                  {hardConflict.message}
                  {hardConflict.reason ? ` ${hardConflict.reason}` : ""}
                </p>
              ) : null}
              {categoryConflict ? (
                <p className="mt-4 rounded-lg border border-[#35302A] bg-[#262220] p-3 text-sm text-[#D1A66C]">
                  Atenção: você selecionou mais de um serviço de <strong>{categoryConflict}</strong>
                  .
                </p>
              ) : null}
              {chosenServices.length > 0 && !hardConflict ? (
                <Button
                  className="mt-6 w-full bg-[#B4884F] text-[#14120F] hover:bg-[#D1A66C]"
                  onClick={() => {
                    setStep(2);
                    void loadSlots(date, professionalId);
                  }}
                >
                  Continuar para horários <ArrowRight className="ml-2 size-4" aria-hidden />
                </Button>
              ) : null}
              {(data!.products ?? []).length > 0 ? (
                <div className="mt-8">
                  <h3 className="font-display text-lg font-bold text-[#F2EDE4]">
                    Produtos disponíveis
                  </h3>
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {(data!.products ?? []).map((product) => (
                      <li
                        key={product.id}
                        className="flex items-center gap-3 rounded-xl border border-[#35302A] bg-[#1E1B17] p-3"
                      >
                        <span>
                          <span className="block font-medium text-[#F2EDE4]">{product.name}</span>
                          <span className="text-sm text-[#D1A66C]">
                            {formatBRL(product.price_cents)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}

          {step === 2 ? (
            <section>
              <h2 className="font-display text-xl font-bold uppercase tracking-wide text-[#F2EDE4]">
                3. Escolha o horário
              </h2>
              <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-2">
                {days.map((day) => (
                  <button
                    key={day}
                    onClick={() => {
                      setDate(day);
                      void loadSlots(day, professionalId);
                    }}
                    className={`shrink-0 rounded-xl border px-4 py-2 text-sm font-semibold ${day === date ? "border-[#B4884F] bg-[#B4884F] text-[#14120F]" : "border-[#35302A] bg-[#1E1B17] text-[#F2EDE4]"}`}
                  >
                    {new Date(`${day}T12:00:00`).toLocaleDateString("pt-BR", {
                      weekday: "short",
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </button>
                ))}
              </div>
              {loadingSlots ? (
                <p className="mt-6 text-sm text-[#9C948A]">Carregando horários...</p>
              ) : slots.every((p) => p.slots.length === 0) ? (
                <p className="mt-6 text-sm text-[#9C948A]">
                  Nenhum horário livre neste dia. Tente outra data.
                </p>
              ) : (
                slots
                  .filter((p) => p.slots.length > 0)
                  .map((p) => (
                    <div key={p.professionalId} className="mt-6">
                      <h3 className="text-sm font-semibold text-[#D1A66C]">{p.professionalName}</h3>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {p.slots.map((slot) => (
                          <button
                            key={`${p.professionalId}-${slot.startsAt}`}
                            onClick={() => {
                              setChosen({
                                startsAt: slot.startsAt,
                                professionalId: p.professionalId,
                              });
                              setStep(3);
                            }}
                            className="rounded-xl border border-[#35302A] bg-[#262220] py-3 text-sm font-semibold text-[#F2EDE4] shadow-sm transition hover:border-[#B4884F] hover:bg-[#B4884F] hover:text-[#14120F]"
                          >
                            {slot.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
              )}
            </section>
          ) : null}

          {step === 3 && chosen ? (
            <section>
              <h2 className="font-display text-xl font-bold">4. Seus dados</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {new Date(chosen.startsAt).toLocaleString("pt-BR", {
                  dateStyle: "full",
                  timeStyle: "short",
                })}{" "}
                · {formatDuration(totalMinutes)} · {formatBRL(totalCents)}
              </p>
              <form onSubmit={confirm} className="mt-5 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="nome">Nome completo</Label>
                  <Input
                    id="nome"
                    required
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="zap">WhatsApp</Label>
                  <WhatsappInput id="zap" required value={whatsapp} onChange={setWhatsapp} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="obs">Observações (opcional)</Label>
                  <Input id="obs" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
                {business.booking_policy ? (
                  <label className="flex items-start gap-3 rounded-xl border border-[#35302A] bg-[#1E1B17] p-4 text-sm text-[#F2EDE4]">
                    <input
                      type="checkbox"
                      required
                      checked={policyAccepted}
                      onChange={(e) => setPolicyAccepted(e.target.checked)}
                      className="mt-0.5 size-4 accent-[#B4884F]"
                    />
                    <span>
                      <span className="font-semibold text-[#D1A66C]">
                        Li e aceito a política do estabelecimento.
                      </span>
                      <span className="mt-2 block whitespace-pre-wrap text-xs leading-5 text-[#9C948A]">
                        {business.booking_policy}
                      </span>
                    </span>
                  </label>
                ) : null}
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Confirmando..." : "Confirmar agendamento"}
                </Button>
              </form>
            </section>
          ) : null}

          {step === 4 && confirmed ? (
            <section className="text-center">
              <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10">
                <Check className="size-7 text-primary" aria-hidden />
              </div>
              <h2 className="mt-4 font-display text-2xl font-bold">Agendamento enviado!</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {new Date(confirmed.startsAt).toLocaleString("pt-BR", {
                  dateStyle: "full",
                  timeStyle: "short",
                })}
                <br />
                Total: {formatBRL(confirmed.totalPriceCents)}
              </p>
              <Button asChild variant="outline" className="mt-6 w-full">
                <a href={`/agendamento/${confirmed.manageToken}`}>Gerenciar meu agendamento</a>
              </Button>
              {business.whatsapp ? (
                <Button asChild variant="outline" className="mt-6">
                  <a
                    href={whatsappLink(
                      business.whatsapp,
                      `Olá! Acabei de agendar em ${business.name}.`,
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Falar no WhatsApp
                  </a>
                </Button>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}
