import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Fragment, useMemo, useRef, useState } from "react";
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
import { rescheduleAppointmentByManageToken } from "@/lib/appointment-manage.functions";
import { formatBRL, formatDuration, normalizeInstagramUrl, whatsappWebLink } from "@/lib/format";
import { businessTypeConfig } from "@/lib/business-types";
import { isTechnicalError, userFacingError } from "@/lib/user-facing-error";
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
        <p className="mt-2 text-sm text-[var(--public-muted)]">
          Confira o link com o estabelecimento.
        </p>
        <Button asChild className="mt-6">
          <Link to="/">Ir para o início</Link>
        </Button>
      </div>
    </main>
  ),
});

function todayISO(timeZone = "America/Sao_Paulo") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function BookingPage() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(businessQuery(slug));
  const business = data!.business;
  const config = businessTypeConfig(business.business_type);

  const fetchAvailability = useServerFn(getAvailability);
  const book = useServerFn(createPublicAppointment);
  const reschedule = useServerFn(rescheduleAppointmentByManageToken);

  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [productDrafts, setProductDrafts] = useState<Record<string, number>>({});
  const [productQuantities, setProductQuantities] = useState<Record<string, number>>({});

  const updateProductQuantity = (productId: string, quantity: number) => {
    if (!data) return;
    const product = data.products?.find((p) => p.id === productId);
    if (!product) return;
    const safe = Math.max(0, Math.min(quantity, product.stock_quantity));
    setProductQuantities((current) => ({ ...current, [productId]: safe }));
    setSelectedProducts((previous) => {
      const exists = previous.includes(productId);
      if (safe > 0 && !exists) return [...previous, productId];
      if (safe === 0 && exists) return previous.filter((id) => id !== productId);
      return previous;
    });
  };
  const [professionalId, setProfessionalId] = useState<string | null>(null);
  const [date, setDate] = useState(() => todayISO(business.timezone));
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
  const [rescheduleToken] = useState(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("reschedule");
  });
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
  const serviceGroups = useMemo(() => {
    type PublicService = (typeof data extends null
      ? never
      : NonNullable<typeof data>["services"])[number];
    const segmentNames = new Map(
      (data!.segments ?? []).map((segment) => [segment.id, segment.name]),
    );
    const groups = new Map<string, { key: string; name: string; services: PublicService[] }>();
    data!.services
      .filter(
        (service) =>
          !professionalId ||
          data!.links.some(
            (link) => link.professional_id === professionalId && link.service_id === service.id,
          ),
      )
      .forEach((service) => {
        const key = service.segment_id ?? "legacy";
        const current = groups.get(key) ?? {
          key,
          name: segmentNames.get(key) ?? "Serviços",
          services: [],
        };
        current.services.push(service);
        groups.set(key, current);
      });
    return [...groups.values()];
  }, [data, professionalId]);
  const totalMinutes = chosenServices.reduce((sum, s) => sum + s.duration_minutes, 0);
  const totalCents = chosenServices.reduce((sum, s) => sum + s.price_cents, 0);
  const chosenProducts = (data!.products ?? []).filter((product) =>
    selectedProducts.includes(product.id),
  );
  const productsTotalCents = chosenProducts.reduce(
    (sum, product) => sum + product.price_cents * (productQuantities[product.id] ?? 1),
    0,
  );
  const chosenProfessionalName =
    data!.professionals.find((professional) => professional.id === chosen?.professionalId)?.name ??
    "Profissional disponível";
  const manageUrl = confirmed
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/agendamento/${confirmed.manageToken}`
    : "";
  const confirmationWhatsappMessage = confirmed
    ? [
        `Olá! Acabei de agendar em ${business.name}.`,
        `Profissional: ${chosenProfessionalName}`,
        `Serviços: ${chosenServices.map((service) => service.name).join(", ")}`,
        ...(chosenProducts.length > 0
          ? [`Produtos: ${chosenProducts.map((product) => product.name).join(", ")}`]
          : []),
        `Data e horário: ${new Date(confirmed.startsAt).toLocaleString("pt-BR", {
          dateStyle: "full",
          timeStyle: "short",
        })}`,
        `Gerenciar agendamento: ${manageUrl}`,
      ].join("\n")
    : "";
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
  const compositionRules = (data!.serviceCompositions ?? []) as {
    composite_service_id: string;
    component_service_id: string;
  }[];
  const conflictsWith = (serviceId: string, otherId: string) =>
    conflictRules.some(
      (rule) =>
        (rule.service_id === serviceId && rule.conflicting_service_id === otherId) ||
        (rule.service_id === otherId && rule.conflicting_service_id === serviceId),
    );
  /** A combo counts as the set of every service it contains; a single service is its own set. */
  const effectiveSet = (serviceId: string) => {
    const components = compositionRules
      .filter((rule) => rule.composite_service_id === serviceId)
      .map((rule) => rule.component_service_id);
    return components.length > 0 ? new Set(components) : new Set([serviceId]);
  };
  const overlaps = (a: string, b: string) => {
    const setB = effectiveSet(b);
    for (const id of effectiveSet(a)) if (setB.has(id)) return true;
    return false;
  };
  /** Selecting a combo drops every service it already includes (and vice versa). */
  const toggleService = (serviceId: string) => {
    setSelected((previous) => {
      if (previous.includes(serviceId)) return previous.filter((id) => id !== serviceId);
      const kept = previous.filter((id) => !overlaps(id, serviceId));
      return [...kept, serviceId];
    });
  };
  /** Every single service contained in the currently selected combos, by ID. */
  const selectedComboItemIds = useMemo(() => {
    const ids = new Set<string>();
    for (const selectedId of selected) {
      for (const rule of compositionRules) {
        if (rule.composite_service_id === selectedId) ids.add(rule.component_service_id);
      }
    }
    return ids;
  }, [selected, compositionRules]);
  const includedInCombo = (serviceId: string) =>
    !selected.includes(serviceId) && selectedComboItemIds.has(serviceId);
  const blockedService = (serviceId: string) =>
    !selected.includes(serviceId) &&
    (selectedComboItemIds.has(serviceId) || selected.some((sid) => conflictsWith(serviceId, sid)));
  const isServiceDisabled = (serviceId: string) => blockedService(serviceId);
  const blockedReason = (serviceId: string) => {
    if (selected.includes(serviceId)) return "Este serviço já foi adicionado ao atendimento.";
    if (includedInCombo(serviceId)) return "Incluso no combo selecionado";
    return "Indisponível junto dos serviços já selecionados";
  };
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
        description: userFacingError(error),
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
      const result = rescheduleToken
        ? await reschedule({
            data: {
              token: rescheduleToken,
              professionalId: chosen.professionalId,
              startsAt: chosen.startsAt,
            },
          })
        : await book({
            data: {
              slug,
              professionalId: chosen.professionalId,
              serviceIds: selected,
              productIds: selectedProducts,
              productQuantities,
              startsAt: chosen.startsAt,
              clientName,
              whatsapp,
              notes: notes || undefined,
              policyAccepted,
              idempotencyKey:
                idempotencyKey.current ?? (idempotencyKey.current = crypto.randomUUID()),
            },
          });
      setConfirmed({
        startsAt: result.startsAt,
        totalPriceCents: Number(result.totalPriceCents),
        manageToken: result.manageToken,
      });
      setStep(4);
    } catch (error) {
      // Surface the exact backend message in the console so booking failures are diagnosable.
      console.error("[booking] falha ao concluir agendamento", error);
      toast.error("Não foi possível concluir a reserva", {
        description: userFacingError(error),
      });
      if (isTechnicalError(error, "SLOT_UNAVAILABLE")) {
        await loadSlots(date, professionalId);
        setStep(2);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      className="public-theme min-h-screen text-[var(--public-text)]"
      style={{ backgroundColor: business.secondary_color ?? "#0B0A08" }}
    >
      <style>{`.public-theme { --public-primary: ${business.primary_color ?? "#B4884F"}; --public-secondary: ${business.secondary_color ?? "#0B0A08"}; --public-accent: ${business.primary_color ?? "#D1A66C"}; --public-text: #F2EDE4; --public-muted: #9C948A; --public-surface: #1E1B17; --public-card: #262220; --public-border: #35302A; --public-bg: ${business.secondary_color ?? "#14120F"}; }`}</style>
      <div
        className="mx-auto min-h-screen max-w-[460px] overflow-hidden pb-32 shadow-2xl"
        style={{ backgroundColor: business.secondary_color ?? "#14120F" }}
      >
        <div className="h-1 bg-[linear-gradient(90deg,var(--public-primary)_0%,var(--public-primary)_60%,transparent_60%,transparent_70%,var(--public-primary)_70%,var(--public-primary)_100%)]" />
        <div className="border-b border-[var(--public-border)] px-5 py-6">
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
                className="size-16 rounded-full border border-[var(--public-primary)] object-cover"
              />
            ) : (
              <div className="flex size-16 shrink-0 items-center justify-center rounded-full border border-[var(--public-primary)] font-display text-2xl font-bold text-[var(--public-accent)]">
                {business.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--public-primary)]">
                {config.label}
              </p>
              <h1 className="mt-1 font-display text-3xl font-bold uppercase tracking-wide text-[var(--public-text)]">
                {business.name}
              </h1>
            </div>
          </div>

          {business.description ? (
            <p className="mt-4 text-sm leading-6 text-[var(--public-muted)]">
              {business.description}
            </p>
          ) : null}
          {business.address ? (
            <a
              href={mapLink ?? undefined}
              target="_blank"
              rel="noreferrer"
              className="mt-4 flex items-start gap-2 rounded-xl border border-[var(--public-border)] bg-[var(--public-surface)] p-3 text-sm text-[var(--public-text)] transition hover:border-[var(--public-primary)]"
            >
              <MapPin className="mt-0.5 size-4 shrink-0 text-[var(--public-primary)]" aria-hidden />
              <span className="flex-1">
                <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--public-primary)]">
                  Onde estamos
                </span>
                {business.address}
              </span>
              {mapLink ? (
                <Navigation className="size-4 shrink-0 text-[var(--public-primary)]" aria-hidden />
              ) : null}
            </a>
          ) : null}
          <p className="mt-4 rounded-xl border border-[var(--public-primary)] bg-[var(--public-surface)] p-3 text-sm text-[var(--public-accent)]">
            Cancelamentos fora de {business.cancellation_deadline_hours ?? 1} hora(s) do horário
            estão sujeitos a multa de 10% do valor total dos serviços.
          </p>
          {business.whatsapp ? (
            <a
              href={whatsappWebLink(
                business.whatsapp,
                `Olá! Vim pela página do Agendou e gostaria de tirar uma dúvida sobre ${business.name}.`,
              )}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[var(--public-primary)] bg-[var(--public-primary)] px-4 py-3 text-sm font-semibold text-[var(--public-bg)]"
            >
              <MessageCircle className="size-4" aria-hidden /> Conversar pelo WhatsApp
            </a>
          ) : null}
          {normalizeInstagramUrl(business.instagram_url) ? (
            <div className="mt-5 rounded-2xl border border-[var(--public-border)] bg-[var(--public-surface)] p-4">
              <div className="flex items-start gap-3">
                <Instagram
                  className="mt-0.5 size-5 shrink-0 text-[var(--public-primary)]"
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--public-primary)]">
                    Siga nosso trabalho
                  </p>
                  <p className="mt-1 text-sm text-[var(--public-muted)]">
                    Veja nossos serviços, resultados e novidades no Instagram.
                  </p>
                  <a
                    href={normalizeInstagramUrl(business.instagram_url) ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[var(--public-accent)] hover:underline"
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
              className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--public-muted)]"
            >
              <ChevronLeft className="size-4" aria-hidden /> Voltar
            </button>
          ) : null}

          {step === 0 ? (
            <section>
              <div className="mb-7 rounded-2xl border border-[var(--public-border)] bg-[var(--public-surface)] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--public-primary)]">
                  Agendamento online
                </p>
                <h2 className="mt-2 font-display text-3xl font-bold uppercase text-[var(--public-text)]">
                  Agendar horário
                </h2>
                <p className="mt-2 text-sm leading-6 text-[var(--public-muted)]">
                  Primeiro escolha quem vai realizar seu atendimento.
                </p>
              </div>
              <h2 className="font-display text-xl font-bold uppercase tracking-wide">
                1. Escolha o profissional
              </h2>
              <p className="mt-1 text-sm text-[var(--public-muted)]">
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
                    className="flex w-full items-center justify-between rounded-xl border border-[var(--public-border)] bg-[var(--public-surface)] p-4 text-left font-medium text-[var(--public-text)] transition hover:border-[var(--public-primary)]"
                  >
                    Qualquer profissional disponível
                    <ArrowRight className="size-4 text-[var(--public-primary)]" aria-hidden />
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
                      className="flex w-full items-center gap-3 rounded-xl border border-[var(--public-border)] bg-[var(--public-surface)] p-4 text-left transition hover:border-[var(--public-primary)]"
                    >
                      {professional.photo_url ? (
                        <img
                          src={professional.photo_url}
                          alt={professional.name}
                          className="size-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex size-12 items-center justify-center rounded-full border border-[var(--public-primary)] text-lg font-semibold text-[var(--public-accent)]">
                          {professional.name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <span>
                        <span className="block font-medium text-[var(--public-text)]">
                          {professional.name}
                        </span>
                        {professional.bio ? (
                          <span className="text-sm text-[var(--public-muted)]">
                            {professional.bio}
                          </span>
                        ) : null}
                      </span>
                      <ArrowRight
                        className="ml-auto size-4 text-[var(--public-primary)]"
                        aria-hidden
                      />
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
              <p className="mt-1 text-sm text-[var(--public-muted)]">
                Pode escolher mais de um — somamos a duração automaticamente.
              </p>
              <ul className="mt-4 space-y-2">
                {serviceGroups.map((group) => (
                  <Fragment key={group.key}>
                    <li className="pt-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--public-primary)]">
                      {group.name}
                    </li>
                    {group.services.map((service) => {
                      const active = selected.includes(service.id);
                      const blocked = blockedService(service.id);
                      return (
                        <li key={service.id}>
                          <button
                            disabled={isServiceDisabled(service.id)}
                            aria-disabled={isServiceDisabled(service.id)}
                            onClick={() => {
                              if (isServiceDisabled(service.id)) return;
                              toggleService(service.id);
                            }}
                            className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition ${active ? "border-[var(--public-primary)] bg-[var(--public-card)]" : "border-[var(--public-border)] bg-[var(--public-surface)]"} ${isServiceDisabled(service.id) ? "pointer-events-none cursor-not-allowed opacity-50" : "hover:border-[var(--public-primary)]"}`}
                          >
                            <span>
                              <span className="block font-medium text-[var(--public-text)]">
                                {service.name}
                              </span>
                              <span className="mt-1 flex items-center gap-1 text-sm text-[var(--public-accent)]">
                                <Clock className="size-3.5" aria-hidden />
                                {formatDuration(service.duration_minutes)} ·{" "}
                                {formatBRL(service.price_cents)}
                              </span>
                              {blocked ? (
                                <span className="mt-1 block text-xs text-[var(--public-muted)]">
                                  {blockedReason(service.id)}
                                </span>
                              ) : null}
                              {service.allows_parallel ? (
                                <span className="mt-1 block text-xs text-[var(--public-muted)]">
                                  Pode ocorrer atendimento simultâneo durante parte do serviço
                                </span>
                              ) : null}
                            </span>
                            {active ? (
                              <Check className="size-5 text-[var(--public-accent)]" aria-hidden />
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </Fragment>
                ))}
              </ul>
              {hardConflict ? (
                <p className="mt-4 rounded-lg border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-200">
                  {hardConflict.message}
                  {hardConflict.reason ? ` ${hardConflict.reason}` : ""}
                </p>
              ) : null}
              {categoryConflict ? (
                <p className="mt-4 rounded-lg border border-[var(--public-border)] bg-[var(--public-card)] p-3 text-sm text-[var(--public-accent)]">
                  Atenção: você selecionou mais de um serviço de <strong>{categoryConflict}</strong>
                  .
                </p>
              ) : null}
              {chosenServices.length > 0 && !hardConflict ? (
                <Button
                  className="mt-6 w-full bg-[var(--public-primary)] text-[var(--public-bg)] hover:bg-[#D1A66C]"
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
                  <h3 className="font-display text-lg font-bold text-[var(--public-text)]">
                    Produtos para retirar no estabelecimento
                  </h3>
                  <p className="mt-1 text-sm text-[var(--public-muted)]">
                    Opcional. O estoque só será baixado quando a venda for registrada pelo
                    estabelecimento.
                  </p>
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {(data!.products ?? []).map((product) => (
                      <li
                        key={product.id}
                        className={`rounded-xl border bg-[var(--public-surface)] p-3 transition ${selectedProducts.includes(product.id) ? "border-[var(--public-primary)]" : "border-[var(--public-border)]"}`}
                      >
                        <div className="flex w-full items-center gap-3 text-left">
                          {product.image_url ? (
                            <img
                              src={product.image_url}
                              alt=""
                              className="size-12 rounded-lg object-cover"
                            />
                          ) : null}
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium text-[var(--public-text)]">
                              {product.name}
                            </span>
                            <span className="text-sm text-[var(--public-accent)]">
                              {formatBRL(product.price_cents)} · Estoque: {product.stock_quantity}
                            </span>
                          </span>
                        </div>
                        {(() => {
                          const inCart = selectedProducts.includes(product.id);
                          const draft = Math.min(
                            productDrafts[product.id] ?? 1,
                            Math.max(product.stock_quantity, 1),
                          );
                          const setDraft = (next: number) =>
                            setProductDrafts((current) => ({
                              ...current,
                              [product.id]: Math.max(
                                1,
                                Math.min(next, Math.max(product.stock_quantity, 1)),
                              ),
                            }));
                          const cartQty = productQuantities[product.id] ?? 1;
                          return (
                            <div className="mt-3 space-y-2">
                              <div className="flex items-center gap-2 text-sm text-[var(--public-text)]">
                                <span>Quantidade</span>
                                <button
                                  type="button"
                                  aria-label="Diminuir quantidade"
                                  className="rounded border border-[var(--public-primary)] px-2"
                                  disabled={draft <= 1}
                                  onClick={() => setDraft(draft - 1)}
                                >
                                  −
                                </button>
                                <span className="min-w-6 text-center font-semibold">{draft}</span>
                                <button
                                  type="button"
                                  aria-label="Aumentar quantidade"
                                  className="rounded border border-[var(--public-primary)] px-2"
                                  disabled={draft >= product.stock_quantity}
                                  onClick={() => setDraft(draft + 1)}
                                >
                                  +
                                </button>
                                {inCart ? (
                                  <span className="ml-auto flex items-center gap-1 text-xs text-[var(--public-accent)]">
                                    <Check className="size-4" aria-hidden /> {cartQty} no
                                    agendamento
                                  </span>
                                ) : null}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  className="rounded-md border border-[var(--public-primary)] px-3 py-1.5 text-sm font-medium text-[var(--public-primary)] transition hover:bg-[var(--public-primary)] hover:text-[var(--public-bg)]"
                                  disabled={product.stock_quantity < 1}
                                  onClick={() => updateProductQuantity(product.id, draft)}
                                >
                                  {inCart
                                    ? draft === cartQty
                                      ? "Quantidade atualizada"
                                      : "Atualizar quantidade"
                                    : "Adicionar ao agendamento"}
                                </button>
                                {inCart ? (
                                  <button
                                    type="button"
                                    className="rounded-md border border-[var(--public-border)] px-3 py-1.5 text-sm text-[var(--public-muted)] transition hover:text-[var(--public-text)]"
                                    onClick={() => updateProductQuantity(product.id, 0)}
                                  >
                                    Remover
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          );
                        })()}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}

          {step === 2 ? (
            <section>
              <h2 className="font-display text-xl font-bold uppercase tracking-wide text-[var(--public-text)]">
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
                    className={`shrink-0 rounded-xl border px-4 py-2 text-sm font-semibold ${day === date ? "border-[var(--public-primary)] bg-[var(--public-primary)] text-[var(--public-bg)]" : "border-[var(--public-border)] bg-[var(--public-surface)] text-[var(--public-text)]"}`}
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
                <p className="mt-6 text-sm text-[var(--public-muted)]">Carregando horários...</p>
              ) : slots.every((p) => p.slots.length === 0) ? (
                <p className="mt-6 text-sm text-[var(--public-muted)]">
                  Nenhum horário livre neste dia. Tente outra data.
                </p>
              ) : (
                slots
                  .filter((p) => p.slots.length > 0)
                  .map((p) => (
                    <div key={p.professionalId} className="mt-6">
                      <h3 className="text-sm font-semibold text-[var(--public-accent)]">
                        {p.professionalName}
                      </h3>
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
                            className="rounded-xl border border-[var(--public-border)] bg-[var(--public-card)] py-3 text-sm font-semibold text-[var(--public-text)] shadow-sm transition hover:border-[var(--public-primary)] hover:bg-[var(--public-primary)] hover:text-[var(--public-bg)]"
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
              <p className="mt-2 text-sm text-[var(--public-muted)]">
                {new Date(chosen.startsAt).toLocaleString("pt-BR", {
                  dateStyle: "full",
                  timeStyle: "short",
                })}{" "}
                · {formatDuration(totalMinutes)} · {formatBRL(totalCents + productsTotalCents)}
              </p>
              {chosenProducts.length > 0 ? (
                <p className="mt-2 text-sm text-[var(--public-accent)]">
                  Produtos: {chosenProducts.map((product) => product.name).join(", ")} ·{" "}
                  {formatBRL(productsTotalCents)}
                </p>
              ) : null}
              {rescheduleToken ? (
                <p className="mt-2 rounded-lg border border-[var(--public-primary)]/40 bg-[var(--public-card)] p-3 text-sm text-[var(--public-accent)]">
                  Escolha o novo horário. Os dados e produtos do agendamento original serão
                  preservados.
                </p>
              ) : null}
              <form onSubmit={confirm} className="mt-5 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="nome">Nome completo</Label>
                  <Input
                    id="nome"
                    required={!rescheduleToken}
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="zap">WhatsApp</Label>
                  <WhatsappInput
                    id="zap"
                    required={!rescheduleToken}
                    value={whatsapp}
                    onChange={setWhatsapp}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="obs">Observações (opcional)</Label>
                  <Input id="obs" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
                {business.booking_policy ? (
                  <label className="flex items-start gap-3 rounded-xl border border-[var(--public-border)] bg-[var(--public-surface)] p-4 text-sm text-[var(--public-text)]">
                    <input
                      type="checkbox"
                      required={!rescheduleToken}
                      checked={policyAccepted}
                      onChange={(e) => setPolicyAccepted(e.target.checked)}
                      className="mt-0.5 size-4 accent-[var(--public-primary)]"
                    />
                    <span>
                      <span className="font-semibold text-[var(--public-accent)]">
                        Li e aceito a política do estabelecimento.
                      </span>
                      <span className="mt-2 block whitespace-pre-wrap text-xs leading-5 text-[var(--public-muted)]">
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
              <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-[var(--public-primary)]/10">
                <Check className="size-7 text-[var(--public-primary)]" aria-hidden />
              </div>
              <h2 className="mt-4 font-display text-2xl font-bold">Agendamento enviado!</h2>
              <p className="mt-2 text-sm text-[var(--public-muted)]">
                {new Date(confirmed.startsAt).toLocaleString("pt-BR", {
                  dateStyle: "full",
                  timeStyle: "short",
                })}
                <br />
                Total: {formatBRL(confirmed.totalPriceCents)}
              </p>
              {chosenProducts.length > 0 ? (
                <p className="mt-3 text-sm text-[var(--public-accent)]">
                  Produtos solicitados: {chosenProducts.map((product) => product.name).join(", ")}
                </p>
              ) : null}
              <Button
                asChild
                variant="outline"
                className="mt-6 w-full !border-[var(--public-primary)] !bg-[var(--public-text)] !text-[var(--public-surface)] hover:!bg-[var(--public-accent)] hover:!text-[var(--public-surface)]"
              >
                <a href={`/agendamento/${confirmed.manageToken}`}>Gerenciar meu agendamento</a>
              </Button>
              {business.whatsapp ? (
                <Button
                  asChild
                  variant="outline"
                  className="mt-6 !border-[var(--public-primary)] !bg-[var(--public-text)] !text-[var(--public-surface)] hover:!bg-[var(--public-accent)] hover:!text-[var(--public-surface)]"
                >
                  <a
                    href={whatsappWebLink(business.whatsapp, confirmationWhatsappMessage)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Conversar pelo WhatsApp
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
