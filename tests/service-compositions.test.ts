import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { serviceSelectionIssue } from "../src/lib/service-compositions.ts";

const composite = "composite";
const componentA = "component-a";
const componentB = "component-b";
const different = "different";
const rules = [
  { composite_service_id: composite, component_service_id: componentA },
  { composite_service_id: composite, component_service_id: componentB },
];

test("bloqueia o mesmo serviço selecionado duas vezes por ID", () => {
  assert.equal(serviceSelectionIssue([componentA, componentA], rules), "duplicate");
});

test("bloqueia composto com qualquer componente", () => {
  assert.equal(serviceSelectionIssue([composite, componentA], rules), "composition");
  assert.equal(serviceSelectionIssue([composite, componentB], rules), "composition");
});

test("permite composto com serviço diferente", () => {
  assert.equal(serviceSelectionIssue([composite, different], rules), null);
});

test("permite componentes normais entre si quando não há composição entre eles", () => {
  assert.equal(serviceSelectionIssue([componentA, componentB], rules), null);
});

test("a migration isola leituras, rejeita cadeias e usa RPC transacional", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/20260907140000_service_compositions.sql", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(migration, /service_compositions_public_read[\s\S]*USING \(true\)/);
  assert.match(migration, /is_business_member\(auth\.uid\(\), business_id\)/);
  assert.match(migration, /component\.is_composite/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.save_service_composition/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.save_service_composition/);
  assert.match(migration, /CHECK \(composite_service_id <> component_service_id\)/);
});
