import test from "node:test";
import assert from "node:assert/strict";
import { instagramHandle, normalizeInstagramUrl } from "../src/lib/format.ts";

test("normaliza um handle com arroba para URL canônica", () => {
  assert.equal(normalizeInstagramUrl("@barbearia"), "https://www.instagram.com/barbearia");
});

test("normaliza um nome de usuário sem protocolo", () => {
  assert.equal(
    normalizeInstagramUrl("barbearia.exemplo"),
    "https://www.instagram.com/barbearia.exemplo",
  );
});

test("aceita somente perfis HTTPS do Instagram", () => {
  assert.equal(
    normalizeInstagramUrl("https://instagram.com/barbearia"),
    "https://www.instagram.com/barbearia",
  );
  assert.equal(normalizeInstagramUrl("javascript:alert(1)"), null);
  assert.equal(normalizeInstagramUrl("https://example.com/barbearia"), null);
  assert.equal(normalizeInstagramUrl("https://www.instagram.com/barbearia/feed"), null);
});

test("extrai o handle para apresentação pública", () => {
  assert.equal(instagramHandle("https://www.instagram.com/barbearia"), "@barbearia");
  assert.equal(instagramHandle(null), null);
});
