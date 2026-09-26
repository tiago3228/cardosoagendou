/**
 * Availability engine — pure, timezone-aware and business-type agnostic.
 *
 * Total appointment duration is always the SUM of the selected services'
 * durations (30min + 45min => 75min), and every candidate slot must fit the
 * whole block inside business hours, professional hours and free time.
 */

export interface DayWindow {
  /** Local wall clock "HH:MM" or "HH:MM:SS". */
  startsAt: string;
  endsAt: string;
}

export interface BusyInterval {
  /** ISO instants. */
  start: string;
  end: string;
}

export interface SlotInput {
  /** Local calendar day, "YYYY-MM-DD". */
  date: string;
  timeZone: string;
  /** Business opening window for that weekday; null/undefined = closed. */
  businessWindow?: DayWindow | null;
  /** Professional working window for that weekday; null/undefined = closed. */
  professionalWindow?: DayWindow | null;
  /** Optional recurring windows outside the standard window. */
  businessWindows?: DayWindow[];
  professionalWindows?: DayWindow[];
  /** Extra windows marked blocked become busy intervals. */
  blockedWindows?: DayWindow[];
  /** Lunch break window for that weekday; null/undefined = no break. */
  breakWindow?: DayWindow | null;
  /** Sum of selected service durations, in minutes. */
  durationMinutes: number;
  slotIntervalMinutes: number;
  minNoticeMinutes: number;
  busy: BusyInterval[];
  /** "Now" as an ISO instant, injected for testability. */
  now: string;
}

export interface Slot {
  /** Local wall clock label, e.g. "14:30". */
  label: string;
  /** ISO instant of the slot start. */
  startsAt: string;
  /** ISO instant of the slot end (start + total duration). */
  endsAt: string;
}

export function totalDuration(services: { duration_minutes: number }[]): number {
  return services.reduce((sum, s) => sum + s.duration_minutes, 0);
}

export function totalPriceCents(services: { price_cents: number }[]): number {
  return services.reduce((sum, s) => sum + s.price_cents, 0);
}

export function blocksAgenda(services: { allows_parallel: boolean }[]): boolean {
  return !services.length || !services.every((service) => service.allows_parallel);
}

export function minutesFromTime(time: string): number {
  const [h = "0", m = "0"] = time.split(":");
  return Number(h) * 60 + Number(m);
}

export function timeFromMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Offset in minutes of `timeZone` at a given instant (positive = ahead of UTC). */
function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") === 24 ? 0 : get("hour"),
    get("minute"),
    get("second"),
  );
  return (asUtc - instant.getTime()) / 60000;
}

/** Converts a local wall clock (date + minutes since midnight) in `timeZone` to a UTC Date. */
export function zonedToUtc(date: string, minutesOfDay: number, timeZone: string): Date {
  const [y = "1970", m = "01", d = "01"] = date.split("-");
  const naive = Date.UTC(Number(y), Number(m) - 1, Number(d), 0, 0, 0) + minutesOfDay * 60000;
  // Two passes handle DST boundaries.
  let guess = new Date(naive - zoneOffsetMinutes(new Date(naive), timeZone) * 60000);
  guess = new Date(naive - zoneOffsetMinutes(guess, timeZone) * 60000);
  return guess;
}

/** Weekday (0=Sunday) of a "YYYY-MM-DD" local date. */
export function weekdayOf(date: string): number {
  const [y = "1970", m = "01", d = "01"] = date.split("-");
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))).getUTCDay();
}

/** The local "YYYY-MM-DD" calendar day of an instant in a timezone. */
export function localDateOf(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
  return parts;
}

export function computeSlots(input: SlotInput): Slot[] {
  const {
    date,
    timeZone,
    businessWindow,
    professionalWindow,
    breakWindow,
    durationMinutes,
    slotIntervalMinutes,
    minNoticeMinutes,
    busy,
    now,
  } = input;
  if (
    (!businessWindow || !professionalWindow) &&
    !(input.businessWindows?.length && input.professionalWindows?.length)
  )
    return [];
  if (durationMinutes <= 0) return [];
  const step = slotIntervalMinutes > 0 ? slotIntervalMinutes : 15;
  const businessWindows = [businessWindow, ...(input.businessWindows ?? [])].filter(
    Boolean,
  ) as DayWindow[];
  const professionalWindows = [professionalWindow, ...(input.professionalWindows ?? [])].filter(
    Boolean,
  ) as DayWindow[];
  const windows: DayWindow[] = [];
  for (const business of businessWindows)
    for (const professional of professionalWindows) {
      const startsAt = timeFromMinutes(
        Math.max(minutesFromTime(business.startsAt), minutesFromTime(professional.startsAt)),
      );
      const endsAt = timeFromMinutes(
        Math.min(minutesFromTime(business.endsAt), minutesFromTime(professional.endsAt)),
      );
      if (minutesFromTime(endsAt) - minutesFromTime(startsAt) >= durationMinutes)
        windows.push({ startsAt, endsAt });
    }
  if (!windows.length) return [];
  const earliest = new Date(new Date(now).getTime() + minNoticeMinutes * 60000).getTime();
  const busyRanges = busy.map((b) => ({
    start: new Date(b.start).getTime(),
    end: new Date(b.end).getTime(),
  }));
  const addBusy = (window: DayWindow | null | undefined) => {
    if (!window) return;
    const start = zonedToUtc(date, minutesFromTime(window.startsAt), timeZone);
    const end = zonedToUtc(date, minutesFromTime(window.endsAt), timeZone);
    if (end > start) busyRanges.push({ start: start.getTime(), end: end.getTime() });
  };
  addBusy(breakWindow);
  for (const blocked of input.blockedWindows ?? []) addBusy(blocked);
  const slots: Slot[] = [];
  for (const window of windows) {
    const startMinutes = minutesFromTime(window.startsAt);
    const endMinutes = minutesFromTime(window.endsAt);
    for (let m = startMinutes; m + durationMinutes <= endMinutes; m += step) {
      const start = zonedToUtc(date, m, timeZone);
      const end = new Date(start.getTime() + durationMinutes * 60000);
      if (start.getTime() < earliest) continue;
      if (busyRanges.some((r) => start.getTime() < r.end && end.getTime() > r.start)) continue;
      slots.push({
        label: timeFromMinutes(m),
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
      });
    }
  }
  return slots.filter(
    (slot, index, all) => all.findIndex((item) => item.startsAt === slot.startsAt) === index,
  );
}
