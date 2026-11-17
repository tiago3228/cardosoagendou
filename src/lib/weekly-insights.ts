import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export type WeeklyBooking = {
  created_at: string;
  starts_at: string;
  status: string;
  rescheduled_from_id: string | null;
  appointment_services: { service_id: string | null; service_name: string }[];
};

export function weeklyWindow(now: Date, timezone: string, offset = 0) {
  const localDate = formatInTimeZone(now, timezone, "yyyy-MM-dd");
  const day = new Date(`${localDate}T12:00:00Z`);
  const weekday = day.getUTCDay();
  day.setUTCDate(day.getUTCDate() - (weekday === 0 ? 6 : weekday - 1) + offset * 7);
  const startDate = day.toISOString().slice(0, 10);
  day.setUTCDate(day.getUTCDate() + 7);
  const endDate = day.toISOString().slice(0, 10);
  day.setUTCDate(day.getUTCDate() - 1);
  return {
    from: fromZonedTime(`${startDate}T00:00:00`, timezone).toISOString(),
    to: fromZonedTime(`${endDate}T00:00:00`, timezone).toISOString(),
    startDate,
    endDate: day.toISOString().slice(0, 10),
  };
}

export function aggregateWeeklyBookings(rows: WeeklyBooking[], from: string, to: string, timezone: string) {
  // Count genuinely new bookings by creation, not the date of the appointment.
  const bookings = rows.filter((row) => row.created_at >= from && row.created_at < to && !row.rescheduled_from_id);
  const canceled = bookings.filter((row) => row.status === "CANCELED").length;
  const hours = new Map<string, number>();
  const services = new Map<string, { name: string; count: number }>();
  for (const row of bookings) {
    if (["CANCELED", "RESCHEDULED"].includes(row.status)) continue;
    const hour = formatInTimeZone(row.starts_at, timezone, "HH:00");
    hours.set(hour, (hours.get(hour) ?? 0) + 1);
    const seen = new Set<string>();
    for (const service of row.appointment_services) {
      const key = service.service_id ?? service.service_name;
      if (seen.has(key)) continue;
      seen.add(key);
      const value = services.get(key) ?? { name: service.service_name, count: 0 };
      value.count++;
      services.set(key, value);
    }
  }
  return {
    total: bookings.length,
    canceled,
    rankedBookings: bookings.filter((row) => !["CANCELED", "RESCHEDULED"].includes(row.status)).length,
    peakHours: Array.from(hours, ([hour, count]) => ({ hour, count })).sort((a, b) => b.count - a.count || a.hour.localeCompare(b.hour)).slice(0, 3),
    topServices: Array.from(services.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 5),
  };
}

export type WeeklyStats = ReturnType<typeof aggregateWeeklyBookings>;