import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  computeSlots,
  localDateOf,
  totalDuration,
  totalPriceCents,
  weekdayOf,
  type BusyInterval,
} from "./availability";

export type Db = SupabaseClient<Database>;

export interface BookingBusiness {
  id: string;
  slug: string;
  name: string;
  business_type: string;
  description: string | null;
  logo_url: string | null;
  cover_url: string | null;
  whatsapp: string | null;
  address: string | null;
  booking_policy: string | null;
  timezone: string;
  slot_interval_minutes: number;
  min_notice_minutes: number;
  max_advance_days: number;
}

const BUSINESS_COLUMNS =
  "id, slug, name, business_type, description, logo_url, cover_url, whatsapp, address, booking_policy, timezone, slot_interval_minutes, min_notice_minutes, max_advance_days";

export async function loadBusinessBySlug(db: Db, slug: string): Promise<BookingBusiness | null> {
  const { data } = await db
    .from("businesses")
    .select(BUSINESS_COLUMNS)
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  return (data as BookingBusiness | null) ?? null;
}

/**
 * PUBLIC path (anon key): the booking page never reads tables directly.
 * `public_business` / `public_catalog` are the only anon-reachable surface and
 * they project public columns only (email is never exposed; address/WhatsApp
 * honour the business visibility toggles).
 */
export async function loadPublicBusinessBySlug(
  db: Db,
  slug: string,
): Promise<(BookingBusiness & { accepts_bookings: boolean }) | null> {
  const { data } = await db.rpc("public_business", { _slug: slug });
  return (data as (BookingBusiness & { accepts_bookings: boolean }) | null) ?? null;
}

export interface PublicCatalog {
  services: { id: string; name: string; description: string | null; category: string | null; price_cents: number; duration_minutes: number; image_url: string | null; allows_parallel?: boolean }[];
  products?: { id: string; name: string; price_cents: number; stock_quantity: number; image_url: string | null }[];
  professionals: { id: string; name: string; photo_url: string | null; bio: string | null }[];
  links: { professional_id: string; service_id: string }[];
  /** Owner-configured pairs of services that cannot be booked together. */
  serviceConflicts?: { service_id: string; conflicting_service_id: string; reason: string | null }[];
  businessHours: { weekday: number; opens_at: string; closes_at: string; closed: boolean }[];
  professionalHours: { professional_id: string; weekday: number; starts_at: string; ends_at: string; enabled: boolean; lunch_starts_at: string | null; lunch_ends_at: string | null }[];
}

export async function loadPublicCatalogBySlug(db: Db, slug: string): Promise<PublicCatalog> {
  const { data } = await db.rpc("public_catalog", { _slug: slug });
  const catalog = (data as PublicCatalog | null) ?? null;
  return (
    catalog ?? {
      services: [],
      products: [],
      professionals: [],
      links: [],
      serviceConflicts: [],
      businessHours: [],
      professionalHours: [],
    }
  );
}

export async function loadPublicCatalog(db: Db, businessId: string) {
  const [services, professionals, links, businessHours, professionalHours] = await Promise.all([
    db
      .from("services")
      .select(
        "id, name, description, category, price_cents, duration_minutes, image_url, allows_parallel",
      )
      .eq("business_id", businessId)
      .eq("active", true)
      .is("deleted_at", null)
      .order("category", { ascending: true })
      .order("name", { ascending: true }),
    db
      .from("professionals")
      .select("id, name, photo_url, bio")
      .eq("business_id", businessId)
      .eq("active", true)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    db.from("professional_services").select("professional_id, service_id").eq("business_id", businessId),
    db
      .from("business_hours")
      .select("weekday, opens_at, closes_at, closed")
      .eq("business_id", businessId),
    db
      .from("professional_hours")
      .select("professional_id, weekday, starts_at, ends_at, enabled, lunch_starts_at, lunch_ends_at")
      .eq("business_id", businessId),
  ]);

  return {
    services: services.data ?? [],
    professionals: professionals.data ?? [],
    links: links.data ?? [],
    businessHours: businessHours.data ?? [],
    professionalHours: professionalHours.data ?? [],
  };
}

export interface ResolvedSelection {
  services: { id: string; name: string; price_cents: number; duration_minutes: number }[];
  durationMinutes: number;
  priceCents: number;
  /**
   * False when every selected service allows parallel work (e.g. hair
   * straightening waiting time): the appointment does not occupy the
   * professional's agenda, so other clients can still book that time.
   */
  blocksAgenda: boolean;
}

/**
 * Owner-configured incompatibilities (e.g. "Corte + Barba" with "Corte Masculino").
 * Enforced here so every booking path (public page and panel) shares the rule,
 * and again by a database trigger as the last line of defence.
 */
export async function assertNoServiceConflicts(
  db: Db,
  businessId: string,
  serviceIds: string[],
): Promise<void> {
  if (serviceIds.length < 2) return;
  const { data } = await db
    .from("service_conflicts")
    .select("service_id, conflicting_service_id")
    .eq("business_id", businessId)
    .in("service_id", serviceIds)
    .in("conflicting_service_id", serviceIds);
  if ((data ?? []).length > 0) {
    throw new Error(
      "SERVICE_CONFLICT: os serviços selecionados não podem ser combinados no mesmo atendimento",
    );
  }
}

export async function resolveSelection(
  db: Db,
  businessId: string,
  serviceIds: string[],
): Promise<ResolvedSelection> {
  await assertNoServiceConflicts(db, businessId, serviceIds);
  const { data } = await db
    .from("services")
    .select("id, name, price_cents, duration_minutes, allows_parallel")
    .eq("business_id", businessId)
    .eq("active", true)
    .is("deleted_at", null)
    .in("id", serviceIds);
  const rows = data ?? [];
  if (rows.length !== new Set(serviceIds).size) {
    throw new Error("SERVICE_NOT_AVAILABLE: um dos serviços selecionados não está disponível");
  }
  const services = rows.map(({ allows_parallel: _ignored, ...s }) => s);
  return {
    services,
    durationMinutes: totalDuration(services),
    priceCents: totalPriceCents(services),
    blocksAgenda: !(rows.length > 0 && rows.every((s) => s.allows_parallel === true)),
  };
}

export async function busyIntervals(
  db: Db,
  professionalId: string,
  date: string,
  timeZone: string,
): Promise<BusyInterval[]> {
  // Widen by a day on both sides so timezone conversion never clips an appointment.
  const from = new Date(`${date}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 1);
  const to = new Date(`${date}T00:00:00Z`);
  to.setUTCDate(to.getUTCDate() + 2);
  void timeZone;
  const { data } = await db
    .from("appointments")
    .select("starts_at, ends_at, status")
    .eq("professional_id", professionalId)
    .eq("blocks_agenda", true)
    .gte("starts_at", from.toISOString())
    .lt("starts_at", to.toISOString())
    .not("status", "in", "(CANCELED,NO_SHOW)");
  return (data ?? []).map((a) => ({ start: a.starts_at, end: a.ends_at }));
}

export interface DaySlots {
  professionalId: string;
  professionalName: string;
  slots: { label: string; startsAt: string; endsAt: string }[];
}

export async function availabilityForDay(
  db: Db,
  business: BookingBusiness,
  serviceIds: string[],
  date: string,
  professionalId: string | null,
  now: Date,
): Promise<{ durationMinutes: number; priceCents: number; byProfessional: DaySlots[] }> {
  const selection = await resolveSelection(db, business.id, serviceIds);

  // Booking window guard: never offer past days or days beyond max_advance_days.
  const today = localDateOf(now, business.timezone);
  const maxDate = localDateOf(
    new Date(now.getTime() + business.max_advance_days * 86400000),
    business.timezone,
  );
  if (date < today || date > maxDate) {
    return { durationMinutes: selection.durationMinutes, priceCents: selection.priceCents, byProfessional: [] };
  }

  const catalog = await loadPublicCatalog(db, business.id);
  const weekday = weekdayOf(date);

  const bh = catalog.businessHours.find((h) => h.weekday === weekday);
  const businessWindow =
    bh && !bh.closed ? { startsAt: bh.opens_at, endsAt: bh.closes_at } : null;

  const candidates = catalog.professionals.filter((p) => {
    if (professionalId && p.id !== professionalId) return false;
    // The professional must perform every selected service.
    return serviceIds.every((sid) =>
      catalog.links.some((l) => l.professional_id === p.id && l.service_id === sid),
    );
  });

  const byProfessional: DaySlots[] = [];
  for (const professional of candidates) {
    const ph = catalog.professionalHours.find(
      (h) => h.professional_id === professional.id && h.weekday === weekday,
    );
    const professionalWindow =
      ph && ph.enabled ? { startsAt: ph.starts_at, endsAt: ph.ends_at } : null;
    const breakWindow =
      ph && ph.enabled && ph.lunch_starts_at && ph.lunch_ends_at
        ? { startsAt: ph.lunch_starts_at, endsAt: ph.lunch_ends_at }
        : null;
    const busy = await busyIntervals(db, professional.id, date, business.timezone);
    const slots = computeSlots({
      date,
      timeZone: business.timezone,
      businessWindow,
      professionalWindow,
      breakWindow,
      durationMinutes: selection.durationMinutes,
      slotIntervalMinutes: business.slot_interval_minutes,
      minNoticeMinutes: business.min_notice_minutes,
      busy,
      now: now.toISOString(),
    });
    byProfessional.push({ professionalId: professional.id, professionalName: professional.name, slots });
  }

  return {
    durationMinutes: selection.durationMinutes,
    priceCents: selection.priceCents,
    byProfessional,
  };
}
