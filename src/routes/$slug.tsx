import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Check, ChevronLeft, Clock, MapPin } from "lucide-react";
import { toast } from "sonner";
import { createPublicAppointment, getAvailability, getPublicBusiness } from "@/lib/booking.functions";
import { formatBRL, formatDuration, whatsappLink } from "@/lib/format";
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
        meta: [{ title: "Página não encontrada — Agendou" }, { name: "robots", content: "noindex" }],
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
    { professionalId: string; professionalName: string; slots: { label: string; startsAt: string }[] }[]
  >([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [chosen, setChosen] = useState<{ startsAt: string; professionalId: string } | null>(null);
  const [clientName, setClientName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState<{ startsAt: string; totalPriceCents: number } | null>(null);

  const chosenServices = useMemo(
    () => data!.services.filter((s) => selected.includes(s.id)),
    [data, selected],
  );
  const totalMinutes = chosenServices.reduce((sum, s) => sum + s.duration_minutes, 0);
  const totalCents = chosenServices.reduce((sum, s) => sum + s.price_cents, 0);

  const eligibleProfessionals = data!.professionals.filter((p) =>
    selected.every((sid) => data!.links.some((l) => l.professional_id === p.id && l.service_id === sid)),
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
        },
      });
      setConfirmed({ startsAt: result.startsAt, totalPriceCents: result.totalPriceCents });
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
    <main className="mx-auto min-h-screen max-w-lg bg-background pb-32">
      <div className="border-b border-border px-5 py-6">
        {business.logo_url ? (
          <img
            src={business.logo_url}
            alt={`Logo de ${business.name}`}
            className="size-14 rounded-full object-cover"
          />
        ) : null}
        <h1 className="mt-3 font-display text-2xl font-bold text-foreground">{business.name}</h1>
        <p className="text-sm text-muted-foreground">{config.label}</p>
        {business.description ? (
          <p className="mt-2 text-sm text-muted-foreground">{business.description}</p>
        ) : null}
        {business.address ? (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-4" aria-hidden /> {business.address}
          </p>
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
            <h2 className="font-display text-xl font-bold">1. Escolha os serviços</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Pode escolher mais de um — somamos a duração automaticamente.
            </p>
            <ul className="mt-4 space-y-2">
              {data!.services.map((service) => {
                const active = selected.includes(service.id);
                return (
                  <li key={service.id}>
                    <button
                      onClick={() =>
                        setSelected((prev) =>
                          prev.includes(service.id)
                            ? prev.filter((id) => id !== service.id)
                            : [...prev, service.id],
                        )
                      }
                      className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition ${active ? "border-primary bg-primary/5" : "border-border bg-card"}`}
                    >
                      <span>
                        <span className="block font-medium text-card-foreground">{service.name}</span>
                        <span className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                          <Clock className="size-3.5" aria-hidden />
                          {formatDuration(service.duration_minutes)} · {formatBRL(service.price_cents)}
                        </span>
                      </span>
                      {active ? <Check className="size-5 text-primary" aria-hidden /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
            {data!.services.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Este negócio ainda não publicou serviços.
              </p>
            ) : null}
          </section>
        ) : null}

        {step === 1 ? (
          <section>
            <h2 className="font-display text-xl font-bold">2. Escolha o profissional</h2>
            <ul className="mt-4 space-y-2">
              <li>
                <button
                  onClick={() => {
                    setProfessionalId(null);
                    setStep(2);
                    void loadSlots(date, null);
                  }}
                  className="w-full rounded-xl border border-border bg-card p-4 text-left font-medium"
                >
                  Qualquer profissional disponível
                </button>
              </li>
              {eligibleProfessionals.map((professional) => (
                <li key={professional.id}>
                  <button
                    onClick={() => {
                      setProfessionalId(professional.id);
                      setStep(2);
                      void loadSlots(date, professional.id);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 text-left"
                  >
                    {professional.photo_url ? (
                      <img
                        src={professional.photo_url}
                        alt={professional.name}
                        className="size-10 rounded-full object-cover"
                      />
                    ) : null}
                    <span>
                      <span className="block font-medium text-card-foreground">{professional.name}</span>
                      {professional.bio ? (
                        <span className="text-sm text-muted-foreground">{professional.bio}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {step === 2 ? (
          <section>
            <h2 className="font-display text-xl font-bold">3. Escolha o horário</h2>
            <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-2">
              {days.map((day) => (
                <button
                  key={day}
                  onClick={() => {
                    setDate(day);
                    void loadSlots(day, professionalId);
                  }}
                  className={`shrink-0 rounded-xl border px-4 py-2 text-sm ${day === date ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}
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
              <p className="mt-6 text-sm text-muted-foreground">Carregando horários...</p>
            ) : slots.every((p) => p.slots.length === 0) ? (
              <p className="mt-6 text-sm text-muted-foreground">
                Nenhum horário livre neste dia. Tente outra data.
              </p>
            ) : (
              slots
                .filter((p) => p.slots.length > 0)
                .map((p) => (
                  <div key={p.professionalId} className="mt-6">
                    <h3 className="text-sm font-semibold text-muted-foreground">
                      {p.professionalName}
                    </h3>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {p.slots.map((slot) => (
                        <button
                          key={`${p.professionalId}-${slot.startsAt}`}
                          onClick={() => {
                            setChosen({ startsAt: slot.startsAt, professionalId: p.professionalId });
                            setStep(3);
                          }}
                          className="rounded-lg border border-border bg-card py-2 text-sm font-medium"
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
                <Input id="nome" required value={clientName} onChange={(e) => setClientName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="zap">WhatsApp</Label>
                <WhatsappInput id="zap" required value={whatsapp} onChange={setWhatsapp} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="obs">Observações (opcional)</Label>
                <Input id="obs" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Confirmando..." : "Confirmar agendamento"}
              </Button>
              {business.booking_policy ? (
                <p className="text-xs text-muted-foreground">{business.booking_policy}</p>
              ) : null}
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
            {business.whatsapp ? (
              <Button asChild variant="outline" className="mt-6">
                <a
                  href={whatsappLink(business.whatsapp, `Olá! Acabei de agendar em ${business.name}.`)}
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

      {step === 0 && selected.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 mx-auto max-w-lg border-t border-border bg-card/95 p-4 backdrop-blur">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {selected.length} serviço(s) · {formatDuration(totalMinutes)}
            </span>
            <span className="font-semibold">{formatBRL(totalCents)}</span>
          </div>
          <Button className="mt-3 w-full" onClick={() => setStep(1)}>
            Continuar
          </Button>
        </div>
      ) : null}
    </main>
  );
}
