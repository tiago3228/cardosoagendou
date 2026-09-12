import assert from "node:assert/strict";
import test from "node:test";
import {
  canClientManage,
  isReminderDue,
  isValidManageToken,
  messageDedupeKey,
} from "../src/lib/whatsapp.ts";
import { normalizeBrWhatsapp, whatsappLink, whatsappWebLink } from "../src/lib/format.ts";

test("normalizes accepted Brazilian WhatsApp formats to E.164", () => {
  const expected = "+5531999999999";
  assert.equal(normalizeBrWhatsapp("(31) 99999-9999"), expected);
  assert.equal(normalizeBrWhatsapp("31 99999-9999"), expected);
  assert.equal(normalizeBrWhatsapp("31999999999"), expected);
  assert.equal(normalizeBrWhatsapp("+55 31 99999-9999"), expected);
  assert.equal(normalizeBrWhatsapp("31 8888-8888"), "+553188888888");
  assert.equal(normalizeBrWhatsapp("31 1234-5678"), "+553112345678");
  assert.equal(normalizeBrWhatsapp("31 123"), null);
});

test("generates an official wa.me link and URL-encodes the message", () => {
  const link = whatsappLink("(31) 99999-9999", "Olá! Seu horário está confirmado.");
  assert.equal(
    link,
    "https://wa.me/5531999999999?text=Ol%C3%A1!%20Seu%20hor%C3%A1rio%20est%C3%A1%20confirmado.",
  );
  assert.equal(whatsappLink("número inválido", "teste"), "");
});

test("generates a direct WhatsApp Web link without the blocked API redirect", () => {
  const link = whatsappWebLink("(31) 99999-9999", "Confirmar presença");
  assert.equal(
    link,
    "https://web.whatsapp.com/send?phone=5531999999999&text=Confirmar%20presen%C3%A7a",
  );
  assert.equal(link.includes("api.whatsapp.com"), false);
});

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
