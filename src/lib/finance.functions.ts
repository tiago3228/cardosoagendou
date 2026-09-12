import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const dayInput = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida") });

export const financeEntrySchema = z.object({
  kind: z.enum(["INCOME", "EXPENSE"]),
  amount: z.number().int().positive("Informe um valor maior que zero"),
  description: z.string().trim().min(2, "Descreva o lançamento").max(200),
  category: z.string().trim().max(60).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
});

/** Local-day and local-week ISO bounds for the business day being inspected. */
function bounds(date: string) {
  const dayStart = new Date(`${date}T00:00:00`);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const weekStart = new Date(dayStart);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return {
    dayStart: dayStart.toISOString(),
    dayEnd: dayEnd.toISOString(),
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
  };
}

/** Resolves the caller's business and guards a plan feature server-side. */
async function requireBusiness(
  supabase: SupabaseClient<Database>,
  userId: string,
  feature?: string,
): Promise<string> {
  const roles = await supabase.from("user_roles").select("role, business_id").eq("user_id", userId);
  const businessId = roles.data?.find((r) => r.business_id)?.business_id ?? null;
  if (!businessId) throw new Error("NO_BUSINESS: usuário sem negócio vinculado");
  if (feature) {
    const { data, error } = await supabase.rpc("business_has_feature", {
      _business_id: businessId,
      _feature: feature,
    });
    if (error) throw new Error(`FEATURE_CHECK_FAILED: ${error.message}`);
    if (data !== true) {
      throw new Error("FEATURE_LOCKED_FINANCE: o Faturamento é exclusivo do plano Ilimitado");
    }
  }
  return businessId as string;
}

/**
 * Appointment revenue for a day and the surrounding week.
 * Read straight from appointments (never from `transactions`) so manual
 * financial entries and appointment revenue are never counted twice.
 */
export const getAppointmentRevenue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => dayInput.parse(input))
  .handler(async ({ data, context }) => {
    const { dayStart, dayEnd, weekStart, weekEnd } = bounds(data.date);
    const query = (from: string, to: string) =>
      context.supabase
        .from("appointments")
        .select("status, total_price_cents")
        .gte("starts_at", from)
        .lt("starts_at", to);

    const [day, week] = await Promise.all([query(dayStart, dayEnd), query(weekStart, weekEnd)]);
    if (day.error) throw new Error(day.error.message);
    if (week.error) throw new Error(week.error.message);

    const sum = (rows: { status: string; total_price_cents: number }[], statuses: string[]) =>
      rows
        .filter((r) => statuses.includes(r.status))
        .reduce((total, r) => total + r.total_price_cents, 0);

    const dayRows = day.data ?? [];
    const weekRows = week.data ?? [];
    const ACTIVE = ["PENDING", "CONFIRMED", "IN_PROGRESS", "COMPLETED"];

    return {
      date: data.date,
      day: {
        appointments: dayRows.filter((r) => !["CANCELED", "NO_SHOW"].includes(r.status)).length,
        expectedCents: sum(dayRows, ACTIVE),
        completedCents: sum(dayRows, ["COMPLETED"]),
      },
      week: {
        appointments: weekRows.filter((r) => !["CANCELED", "NO_SHOW"].includes(r.status)).length,
        expectedCents: sum(weekRows, ACTIVE),
        completedCents: sum(weekRows, ["COMPLETED"]),
      },
    };
  });

/** Faturamento dashboard (Plano Ilimitado). Manual entries + appointment revenue. */
export const getFinanceOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => dayInput.parse(input))
  .handler(async ({ data, context }) => {
    const businessId = await requireBusiness(context.supabase, context.userId, "finance");
    const { dayStart, dayEnd, weekStart, weekEnd } = bounds(data.date);

    const [entries, appointmentsDay, appointmentsWeek] = await Promise.all([
      context.supabase
        .from("transactions")
        .select("id, type, amount_cents, description, category, occurred_at, appointment_id")
        .eq("business_id", businessId)
        .is("appointment_id", null)
        .gte("occurred_at", weekStart)
        .lt("occurred_at", weekEnd)
        .order("occurred_at", { ascending: false }),
      context.supabase
        .from("appointments")
        .select("status, total_price_cents")
        .eq("business_id", businessId)
        .gte("starts_at", dayStart)
        .lt("starts_at", dayEnd),
      context.supabase
        .from("appointments")
        .select("status, total_price_cents")
        .eq("business_id", businessId)
        .gte("starts_at", weekStart)
        .lt("starts_at", weekEnd),
    ]);
    if (entries.error) throw new Error(entries.error.message);

    const rows = entries.data ?? [];
    const isExpense = (t: string) => t === "EXPENSE" || t === "COMMISSION" || t === "SUBSCRIPTION";
    const inRange = (iso: string, from: string, to: string) => iso >= from && iso < to;

    const totals = (from: string, to: string) => {
      const scoped = rows.filter((r) => inRange(r.occurred_at, from, to));
      const income = scoped
        .filter((r) => !isExpense(r.type))
        .reduce((sum, r) => sum + r.amount_cents, 0);
      const expenses = scoped
        .filter((r) => isExpense(r.type))
        .reduce((sum, r) => sum + r.amount_cents, 0);
      return { income, expenses };
    };

    const completed = (rowsIn: { status: string; total_price_cents: number }[]) =>
      rowsIn
        .filter((r) => r.status === "COMPLETED")
        .reduce((sum, r) => sum + r.total_price_cents, 0);
    const expected = (rowsIn: { status: string; total_price_cents: number }[]) =>
      rowsIn
        .filter((r) => !["CANCELED", "NO_SHOW"].includes(r.status))
        .reduce((sum, r) => sum + r.total_price_cents, 0);

    const dayTotals = totals(dayStart, dayEnd);
    const weekTotals = totals(weekStart, weekEnd);
    const dayAppointments = appointmentsDay.data ?? [];
    const weekAppointments = appointmentsWeek.data ?? [];

    const day = {
      appointmentsCount: dayAppointments.filter((r) => !["CANCELED", "NO_SHOW"].includes(r.status))
        .length,
      appointmentRevenueCents: completed(dayAppointments),
      expectedRevenueCents: expected(dayAppointments),
      otherIncomeCents: dayTotals.income,
      expensesCents: dayTotals.expenses,
    };
    const week = {
      appointmentsCount: weekAppointments.filter((r) => !["CANCELED", "NO_SHOW"].includes(r.status))
        .length,
      appointmentRevenueCents: completed(weekAppointments),
      expectedRevenueCents: expected(weekAppointments),
      otherIncomeCents: weekTotals.income,
      expensesCents: weekTotals.expenses,
    };

    return {
      date: data.date,
      day: {
        ...day,
        balanceCents: day.appointmentRevenueCents + day.otherIncomeCents - day.expensesCents,
      },
      week: {
        ...week,
        balanceCents: week.appointmentRevenueCents + week.otherIncomeCents - week.expensesCents,
      },
      entries: rows.map((r) => ({
        id: r.id,
        type: r.type,
        kind: isExpense(r.type) ? ("EXPENSE" as const) : ("INCOME" as const),
        amountCents: r.amount_cents,
        description: r.description,
        category: r.category,
        occurredAt: r.occurred_at,
      })),
    };
  });

/** Manual entry: "outras entradas" or a business expense. */
export const addFinanceEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => financeEntrySchema.parse(input))
  .handler(async ({ data, context }) => {
    const businessId = await requireBusiness(context.supabase, context.userId, "finance");
    const { error } = await context.supabase.from("transactions").insert({
      business_id: businessId,
      // Manual income is booked as PRODUCT_INCOME ("outras entradas"); appointment
      // revenue keeps using SERVICE_INCOME with an appointment_id.
      type: data.kind === "EXPENSE" ? "EXPENSE" : "PRODUCT_INCOME",
      amount_cents: data.amount,
      description: data.description,
      category: data.category?.trim() || null,
      occurred_at: new Date(`${data.date}T12:00:00`).toISOString(),
    });
    if (error) throw new Error(`ENTRY_FAILED: ${error.message}`);
    return { ok: true as const };
  });
