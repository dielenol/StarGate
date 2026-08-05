import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { strict as assert } from "node:assert";

import * as sharedDb from "../../../dist/index.js";

test("root export는 lore 지식모델 타입 런타임 상수·collection·CRUD 계약을 노출한다", () => {
  assert.deepEqual(sharedDb.LORE_VISIBILITIES, [
    "public",
    "authenticated",
    "restricted",
    "gm-only",
  ]);
  assert.equal(typeof sharedDb.loreSourcesCol, "function");
  assert.equal(typeof sharedDb.loreAliasesCol, "function");
  assert.equal(typeof sharedDb.loreEdgesCol, "function");
  assert.equal(typeof sharedDb.loreClaimsCol, "function");
  assert.equal(typeof sharedDb.loreSearchDocumentsCol, "function");
  assert.equal(typeof sharedDb.loreIngestionRunsCol, "function");
  assert.equal(typeof sharedDb.createLoreClaim, "function");
  assert.equal(typeof sharedDb.putLoreSearchDocument, "function");
  assert.equal(typeof sharedDb.searchLoreDocuments, "function");
  assert.equal(typeof sharedDb.transitionLoreIngestionRun, "function");
});

test("ensureAllIndexes 정의는 6개 auxiliary collection의 안정 identity를 보장한다", async () => {
  const source = await readFile(
    new URL("../../indexes.ts", import.meta.url),
    "utf8",
  );
  for (const [collection, uniqueIndex] of [
    ["lore_sources", "lore_sources_sourceId_unique"],
    ["lore_aliases", "lore_aliases_aliasId_unique"],
    ["lore_edges", "lore_edges_edgeId_unique"],
    ["lore_claims", "lore_claims_claimId_unique"],
    ["lore_search_documents", "lore_search_documents_entityRef_unique"],
    ["lore_ingestion_runs", "lore_ingestion_runs_runId_unique"],
  ]) {
    assert.match(source, new RegExp(`${collection}: \\[`));
    assert.match(source, new RegExp(`name: \\"${uniqueIndex}\\"`));
  }
  assert.match(source, /export async function ensureLoreIndexes/);
  assert.match(source, /ensureLoreIndexes\(db\)/);
  assert.match(source, /name: "lore_search_documents_text"/);
});

test("session_reports는 호환·unique identity와 구조화 역참조 index를 함께 선언한다", () => {
  const definitions = sharedDb.SESSION_REPORT_INDEX_DEFINITIONS;
  assert.ok(Array.isArray(definitions));
  assert.equal(typeof sharedDb.ensureSessionReportIndexes, "function");
  assert.ok(
    definitions.some(
      (index) => index.name === "session_reports_sessionId",
    ),
  );
  assert.equal(
    definitions.find(
      (index) => index.name === "session_reports_sessionId_unique",
    )?.unique,
    true,
  );
  for (const name of [
    "session_reports_relatedWikiSlugs",
    "session_reports_relatedPersonnelCodenames",
    "session_reports_relatedCatalogSlugs",
  ]) {
    assert.ok(definitions.some((index) => index.name === name), name);
  }
});
