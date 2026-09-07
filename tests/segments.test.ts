import assert from "node:assert/strict";
import test from "node:test";
import { segmentLimit, segmentSlug } from "../src/lib/segments.ts";

test("limita BASIC a um segmento ativo", () => {
  assert.equal(segmentLimit({ planCode: "BASIC", subscriptionStatus: "ACTIVE" }), 1);
});

test("limita MEDIUM a dois segmentos ativos", () => {
  assert.equal(segmentLimit({ planCode: "MEDIUM", subscriptionStatus: "ACTIVE" }), 2);
});

test("mantém UNLIMITED sem limite de segmentos", () => {
  assert.equal(segmentLimit({ planCode: "UNLIMITED", subscriptionStatus: "ACTIVE" }), null);
});

test("mantém o trial com acesso completo ao catálogo", () => {
  assert.equal(segmentLimit({ planCode: "BASIC", subscriptionStatus: "TRIALING" }), null);
});

test("normaliza slug de segmento", () => {
  assert.equal(segmentSlug(" Cabelo & Barba "), "cabelo-barba");
});
