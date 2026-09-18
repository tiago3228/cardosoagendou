import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260918000000_add_coquetelaria_catalog.sql", import.meta.url),
  "utf8",
);

test("Coquetelaria catalog defines the segment and seven requested services", () => {
  assert.match(migration, /'Coquetelaria',\s*'coquetelaria'/);
  for (const service of [
    "Consultoria de Bar",
    "Criação e Padronização de Coquetéis",
    "Desenvolvimento de Carta e Fichas Técnicas",
    "Precificação Estratégica",
    "Organização e Otimização de Operação",
    "Treinamento de Equipe e Atendimento",
    "Aumento de Lucratividade e Identidade do Bar",
  ]) {
    assert.match(migration, new RegExp(`'${service}'`));
  }
});

test("Coquetelaria catalog is idempotent and creates global templates", () => {
  assert.match(migration, /ON CONFLICT \(slug\) DO UPDATE/);
  assert.match(migration, /existing\.business_id IS NULL/);
  assert.match(migration, /existing\.segment_id = s\.id/);
});
