import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260907003000_complete_global_catalog.sql", import.meta.url),
  "utf8",
);

const templates = [...migration.matchAll(/^\s+\('([^']+)', '(.+)', (\d+)\)[,;]?$/gm)].map(
  ([, segment, name, duration]) => ({
    segment,
    name: name.replaceAll("''", "'"),
    duration: Number(duration),
  }),
);

test("canonical catalog contains 20 segments and 300 templates", () => {
  assert.equal(new Set(templates.map((template) => template.segment)).size, 20);
  assert.equal(templates.length, 300);
  for (const segment of new Set(templates.map((template) => template.segment))) {
    assert.equal(templates.filter((template) => template.segment === segment).length, 15, segment);
  }
});

test("canonical catalog has no duplicate names within a segment", () => {
  const keys = templates.map(
    (template) => `${template.segment}:${template.name.toLocaleLowerCase()}`,
  );
  assert.equal(new Set(keys).size, keys.length);
});

test("canonical catalog includes representative names and durations", () => {
  assert.deepEqual(
    templates.find((template) => template.name === "Corte + barba"),
    { segment: "barbearia", name: "Corte + barba", duration: 60 },
  );
  assert.deepEqual(
    templates.find((template) => template.name === "Psicoterapia individual"),
    { segment: "psicologia", name: "Psicoterapia individual", duration: 50 },
  );
  assert.deepEqual(
    templates.find((template) => template.name === "Detalhamento completo"),
    { segment: "estetica-automotiva", name: "Detalhamento completo", duration: 360 },
  );
});

test("new services no longer fall back to the legacy Geral bucket", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.assign_default_service_segment/);
  assert.doesNotMatch(migration, /INSERT INTO public\.business_segments[\s\S]*'Geral'/);
  assert.match(migration, /RETURN NEW;/);
});
