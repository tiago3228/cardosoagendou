import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260907004000_catalog_integrity_blockers.sql", import.meta.url),
  "utf8",
);

test("business segments reject missing or inactive global segments", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.validate_business_segment_global/);
  assert.match(migration, /IF NOT FOUND THEN\s+RAISE EXCEPTION 'SEGMENT_NOT_FOUND'/);
  assert.match(migration, /IF NOT global_segment_active/);
  assert.match(migration, /IF TG_OP = 'INSERT' OR NEW\.active/);
  assert.match(migration, /RAISE EXCEPTION 'SEGMENT_NOT_ACTIVE_FOR_BUSINESS'/);
  assert.match(migration, /business_segments_validate_global/);
});

test("business segment duplication remains protected", () => {
  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS business_segments_business_segment_uidx[\s\S]*?\(business_id, segment_id\)/,
  );
  assert.match(migration, /WHERE segment_id IS NOT NULL/);
});

test("professional services require professional, service, and link tenant to match", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.validate_professional_service_tenant/,
  );
  assert.match(migration, /professional_business_id <> NEW\.business_id/);
  assert.match(migration, /service_business_id <> NEW\.business_id/);
  assert.match(migration, /RAISE EXCEPTION 'PROFESSIONAL_SERVICE_TENANT_MISMATCH'/);
  assert.match(migration, /professional_services_validate_tenant/);
});

test("invalid referenced professional or service is rejected explicitly", () => {
  assert.match(migration, /RAISE EXCEPTION 'PROFESSIONAL_NOT_FOUND'/);
  assert.match(migration, /RAISE EXCEPTION 'SERVICE_NOT_FOUND'/);
  assert.doesNotMatch(migration, /DELETE FROM/);
  assert.doesNotMatch(migration, /DROP TABLE/);
});

test("integrity migration does not modify billing or appointment domains", () => {
  assert.doesNotMatch(migration, /billing|mercado pago|appointment|appointments|subscription/i);
  assert.doesNotMatch(migration, /price_cents|duration_minutes/);
});
