import assert from "node:assert/strict";
import test from "node:test";
import {
  canClientManage,
  isReminderDue,
  isValidManageToken,
  messageDedupeKey,
} from "../src/lib/whatsapp.ts";

test("confirmation uses a stable dedupe key", () => {
  assert.equal(messageDedupeKey("APPOINTMENT_CONFIRMED", "a1"), "appointment_confirmed:a1");
  assert.equal(
    messageDedupeKey("APPOINTMENT_CONFIRMED", "a1"),
    messageDedupeKey("APPOINTMENT_CONFIRMED", "a1"),
  );
});

test("reminder is only due for enabled confirmed appointments", () => {
  const now = new Date("2026-09-06T10:00:00Z");
  assert.equal(isReminderDue("CONFIRMED", new Date("2026-09-06T11:00:00Z"), now, true, 60), true);
  assert.equal(isReminderDue("PENDING", new Date("2026-09-06T11:00:00Z"), now, true, 60), false);
  assert.equal(isReminderDue("CANCELED", new Date("2026-09-06T11:00:00Z"), now, true, 60), false);
  assert.equal(isReminderDue("CONFIRMED", new Date("2026-09-06T11:00:00Z"), now, false, 60), false);
});

test("client policy windows protect cancellation and rescheduling", () => {
  const now = new Date("2026-09-06T10:00:00Z");
  assert.equal(canClientManage("CONFIRMED", new Date("2026-09-06T11:00:00Z"), now, "cancel"), true);
  assert.equal(
    canClientManage("CONFIRMED", new Date("2026-09-06T11:00:00Z"), now, "reschedule"),
    false,
  );
  assert.equal(canClientManage("CANCELED", new Date("2026-09-06T15:00:00Z"), now, "cancel"), false);
});

test("manage links only accept sufficiently long token-shaped values", () => {
  assert.equal(
    isValidManageToken("550e8400-e29b-41d4-a716-446655440000550e8400-e29b-41d4-a716-446655440000"),
    true,
  );
  assert.equal(isValidManageToken("short"), false);
  assert.equal(isValidManageToken("token with spaces"), false);
});
