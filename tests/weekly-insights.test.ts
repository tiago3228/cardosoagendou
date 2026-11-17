import { describe, expect, it } from "vitest";
import { aggregateWeeklyBookings, weeklyWindow, type WeeklyBooking } from "../src/lib/weekly-insights";

const row = (values: Partial<WeeklyBooking> = {}): WeeklyBooking => ({
  created_at: "2026-11-17T12:00:00Z", starts_at: "2026-12-02T17:30:00Z", status: "CONFIRMED", rescheduled_from_id: null,
  appointment_services: [{ service_id: "cut", service_name: "Corte" }], ...values,
});
const bounds = weeklyWindow(new Date("2026-11-17T03:28:00Z"), "America/Sao_Paulo");
const aggregate = (rows: WeeklyBooking[]) => aggregateWeeklyBookings(rows, bounds.from, bounds.to, "America/Sao_Paulo");

describe("resumo semanal de novas reservas", () => {
  it("conta novas reservas pela criação mesmo com atendimento em outra semana", () => {
    expect(aggregate([row(), row({ created_at: "2026-11-15T12:00:00Z" })]).total).toBe(1);
  });
  it("agrupa horários de pico no fuso do negócio", () => {
    expect(aggregate([row(), row()]).peakHours).toEqual([{ hour: "14:00", count: 2 }]);
  });
  it("ordena serviços por reservas sem duplicar o mesmo serviço em um atendimento", () => {
    const combo = row({ appointment_services: [{ service_id: "cut", service_name: "Corte" }, { service_id: "cut", service_name: "Corte" }, { service_id: "beard", service_name: "Barba" }] });
    expect(aggregate([row(), combo]).topServices).toEqual([{ name: "Corte", count: 2 }, { name: "Barba", count: 1 }]);
  });
  it("separa cancelamentos e não os inclui nos rankings", () => {
    const stats = aggregate([row({ status: "CANCELED" }), row()]);
    expect(stats.total).toBe(2);
    expect(stats.canceled).toBe(1);
    expect(stats.topServices[0]?.count).toBe(1);
  });
  it("não conta reagendamentos como novas reservas", () => {
    expect(aggregate([row({ rescheduled_from_id: "original" })]).total).toBe(0);
  });
  it("usa segunda a domingo e exclui a próxima segunda", () => {
    expect(bounds.from).toBe("2026-11-16T03:00:00.000Z");
    expect(bounds.to).toBe("2026-11-23T03:00:00.000Z");
    expect(aggregate([row({ created_at: bounds.to })]).total).toBe(0);
  });
  it("respeita domingo local quando UTC já está na segunda", () => {
    expect(weeklyWindow(new Date("2026-11-16T01:00:00Z"), "America/Sao_Paulo").startDate).toBe("2026-11-09");
  });
});