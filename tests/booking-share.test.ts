import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBookingShareText,
  generateBookingShareMessage,
  resolvePublicBookingOrigin,
} from "../src/lib/booking-share.ts";

test("gera uma frase por nicho e estilo usando o nome do negócio", () => {
  const message = generateBookingShareMessage("Studio Central", "NAIL_SALON", "warm");

  assert.match(message, /Studio Central/);
  assert.match(message, /prazer/i);
});

test("combina mensagem e link para compartilhamento", () => {
  assert.equal(
    buildBookingShareText("Agende seu horário", "https://agendou.app/studio"),
    "Agende seu horário\n\nAgende aqui: https://agendou.app/studio",
  );
});

test("sem mensagem personalizada copia apenas o link", () => {
  assert.equal(
    buildBookingShareText("", "https://agendou.app/studio"),
    "https://agendou.app/studio",
  );
});

test("ignora domínio técnico do Lovable ao resolver o link público", () => {
  assert.equal(
    resolvePublicBookingOrigin(
      "https://2386b466-0c1e-492f-beb7-e7eaf166fc97.lovableproject.com",
      "https://preview.lovableproject.com",
    ),
    "https://agendou-br.lovable.app",
  );
});

test("preserva domínio público configurado", () => {
  assert.equal(
    resolvePublicBookingOrigin("https://agendou-br.lovable.app", "https://preview.example.com"),
    "https://agendou-br.lovable.app",
  );
});
