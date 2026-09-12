import assert from "node:assert/strict";
import test from "node:test";
import { buildBookingShareText, generateBookingShareMessage } from "../src/lib/booking-share.ts";

test("gera uma frase por nicho e estilo usando o nome do negócio", () => {
  const message = generateBookingShareMessage("Studio Central", "NAIL_SALON", "warm");

  assert.match(message, /Studio Central/);
  assert.match(message, /prazer/i);
});

test("combina mensagem e link para compartilhamento", () => {
  assert.equal(
    buildBookingShareText("Agende seu horário", "https://agendou.app/studio"),
    "Agende seu horário\nhttps://agendou.app/studio",
  );
});

test("sem mensagem personalizada copia apenas o link", () => {
  assert.equal(
    buildBookingShareText("", "https://agendou.app/studio"),
    "https://agendou.app/studio",
  );
});
