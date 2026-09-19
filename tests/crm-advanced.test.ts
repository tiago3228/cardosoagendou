import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260919010000_crm_advanced.sql", import.meta.url),
  "utf8",
);

test("advanced CRM supports the Aura-style journey", () => {
  for (const stage of [
    "novo_lead",
    "primeiro_contato",
    "interessado",
    "orcamento_enviado",
    "aguardando_resposta",
    "agendou",
    "compareceu",
    "converteu",
    "fidelizado",
    "perdido",
  ]) {
    assert.match(migration, new RegExp(`'${stage}'`));
  }
  for (const table of [
    "crm_lead_sources",
    "crm_lead_stage_history",
    "crm_follow_ups",
    "crm_retention_settings",
    "crm_message_templates",
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`));
  }
});

test("advanced CRM includes safe conversion, retention and tenant policies", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.crm_convert_lead/);
  assert.match(migration, /regexp_replace\(COALESCE\(l\.whatsapp/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.crm_retention_snapshot/);
  assert.match(migration, /is_business_member\(auth\.uid\(\), business_id\)/);
  assert.match(migration, /CREATE TRIGGER crm_leads_record_stage/);
});
