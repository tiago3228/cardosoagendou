import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260919000000_crm_module_and_entitlement.sql", import.meta.url),
  "utf8",
);

test("CRM migration creates the relationship, pipeline and follow-up domains", () => {
  for (const table of ["crm_tags", "crm_client_tags", "crm_interactions", "crm_tasks", "crm_leads"]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`));
  }
  for (const stage of ["NEW", "CONTACTED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"]) {
    assert.match(migration, new RegExp(`'${stage}'`));
  }
  assert.match(migration, /jsonb_build_object\('crm', true\)/);
});

test("CRM migration protects every table with tenant-aware RLS", () => {
  for (const table of ["crm_tags", "crm_client_tags", "crm_interactions", "crm_tasks", "crm_leads"]) {
    assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
  }
  assert.match(migration, /is_business_owner\(auth\.uid\(\), business_id\)/);
  assert.match(migration, /is_business_member\(auth\.uid\(\), business_id\)/);
});
