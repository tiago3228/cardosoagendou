export type AppointmentStatus = "PENDING" | "CONFIRMED" | "CANCELED" | "COMPLETED" | "NO_SHOW";

export function messageDedupeKey(event: string, appointmentId: string) {
  return `${event.toLowerCase()}:${appointmentId}`;
}

export function isReminderDue(
  status: AppointmentStatus,
  startsAt: Date,
  now: Date,
  enabled: boolean,
  reminderMinutes: number,
) {
  if (!enabled || status !== "CONFIRMED") return false;
  const minutes = (startsAt.getTime() - now.getTime()) / 60_000;
  return minutes > 5 && minutes <= reminderMinutes;
}

export function canClientManage(
  status: AppointmentStatus,
  startsAt: Date,
  now: Date,
  action: "cancel" | "reschedule",
) {
  if (["CANCELED", "COMPLETED", "NO_SHOW"].includes(status)) return false;
  const hours = (startsAt.getTime() - now.getTime()) / 3_600_000;
  return action === "cancel" ? hours >= 1 : hours >= 2;
}

export function isValidManageToken(token: string) {
  return /^[a-f0-9-]{32,100}$/i.test(token);
}
