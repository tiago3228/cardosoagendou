import test from "node:test";
import assert from "node:assert/strict";
import { blocksAgenda, computeSlots, zonedToUtc } from "../src/lib/availability.ts";

const base = {
  date: "2026-09-07",
  timeZone: "America/Sao_Paulo",
  businessWindow: { startsAt: "09:00", endsAt: "18:00" },
  professionalWindow: { startsAt: "09:00", endsAt: "18:00" },
  slotIntervalMinutes: 30,
  minNoticeMinutes: 0,
  busy: [],
  now: "2026-09-06T12:00:00.000Z",
};

test("calcula slots com duração de múltiplos serviços e mantém adjacência livre", () => {
  const slots = computeSlots({ ...base, durationMinutes: 60 });
  assert.equal(slots[0]?.label, "09:00");
  assert.equal(slots.at(-1)?.label, "17:00");
  assert.equal(slots.length, 17);
});

test("remove slots que atravessam o almoço", () => {
  const slots = computeSlots({
    ...base,
    durationMinutes: 60,
    breakWindow: { startsAt: "12:00", endsAt: "13:00" },
  });
  assert.equal(
    slots.some((slot) => slot.label === "11:30"),
    false,
  );
  assert.equal(
    slots.some((slot) => slot.label === "12:00"),
    false,
  );
  assert.equal(
    slots.some((slot) => slot.label === "13:00"),
    true,
  );
});

test("aplica antecedência mínima e sobreposição sem bloquear horários adjacentes", () => {
  const busyStart = zonedToUtc("2026-09-07", 11 * 60, "America/Sao_Paulo");
  const busyEnd = zonedToUtc("2026-09-07", 12 * 60, "America/Sao_Paulo");
  const slots = computeSlots({
    ...base,
    durationMinutes: 60,
    minNoticeMinutes: 120,
    now: "2026-09-07T12:00:00.000Z",
    busy: [{ start: busyStart.toISOString(), end: busyEnd.toISOString() }],
  });
  assert.equal(
    slots.some((slot) => slot.label === "09:00"),
    false,
  );
  assert.equal(
    slots.some((slot) => slot.label === "10:00"),
    false,
  );
  assert.equal(
    slots.some((slot) => slot.label === "12:00"),
    true,
  );
});

test("não oferece horário quando o profissional está fechado", () => {
  const slots = computeSlots({ ...base, durationMinutes: 30, professionalWindow: null });
  assert.deepEqual(slots, []);
});

test("só serviços totalmente paralelos deixam de bloquear a agenda", () => {
  assert.equal(blocksAgenda([{ allows_parallel: true }]), false);
  assert.equal(blocksAgenda([{ allows_parallel: true }, { allows_parallel: true }]), false);
  assert.equal(blocksAgenda([{ allows_parallel: true }, { allows_parallel: false }]), true);
  assert.equal(blocksAgenda([{ allows_parallel: false }]), true);
  assert.equal(blocksAgenda([]), true);
});

test("conversão de fuso usa a data civil do estabelecimento", () => {
  const saoPaulo = zonedToUtc("2026-09-07", 9 * 60, "America/Sao_Paulo");
  const tokyo = zonedToUtc("2026-09-07", 9 * 60, "Asia/Tokyo");
  assert.notEqual(saoPaulo.toISOString(), tokyo.toISOString());
  assert.equal(saoPaulo.toISOString().endsWith("T12:00:00.000Z"), true);
});
