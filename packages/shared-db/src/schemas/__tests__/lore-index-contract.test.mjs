import { strict as assert } from "node:assert";
import test from "node:test";

import {
  LORE_INDEX_DEFINITIONS,
  SESSION_REPORT_INDEX_DEFINITIONS,
  ensureLoreIndexes,
  ensureSessionReportIndexes,
  findLoreUniqueIndexConflicts,
} from "../../../dist/indexes.js";

test("모든 lore 논리 ID와 active generation은 DB unique 계약을 가진다", () => {
  const expected = [
    ["lore_sources", "lore_sources_sourceId_unique"],
    ["lore_aliases", "lore_aliases_aliasId_unique"],
    ["lore_aliases", "lore_aliases_active_logicalKey_unique"],
    ["lore_edges", "lore_edges_edgeId_unique"],
    ["lore_edges", "lore_edges_active_logicalKey_unique"],
    ["lore_claims", "lore_claims_claimId_unique"],
    ["lore_claims", "lore_claims_active_logicalKey_unique"],
    ["lore_search_documents", "lore_search_documents_entityRef_unique"],
    ["lore_ingestion_runs", "lore_ingestion_runs_runId_unique"],
    ["lore_ingestion_runs", "lore_ingestion_runs_mode_running_unique"],
  ];

  for (const [collection, name] of expected) {
    const definition = LORE_INDEX_DEFINITIONS[collection].find(
      (index) => index.name === name,
    );
    assert.ok(definition, `${collection}.${name} 누락`);
    assert.equal(definition.unique, true, `${collection}.${name} unique 누락`);
  }
  const activeRun = LORE_INDEX_DEFINITIONS.lore_ingestion_runs.find(
    (index) => index.name === "lore_ingestion_runs_mode_running_unique",
  );
  assert.deepEqual(activeRun.partialFilterExpression, { status: "running" });

  const ownerScopedSearch =
    LORE_INDEX_DEFINITIONS.lore_search_documents.find(
      (index) =>
        index.name ===
        "lore_search_documents_access_owner_kind_status_updatedAt",
    );
  assert.deepEqual(ownerScopedSearch?.key, {
    "access.visibility": 1,
    projectionOwner: 1,
    entityKind: 1,
    status: 1,
    updatedAt: -1,
  });
  assert.equal(
    LORE_INDEX_DEFINITIONS.lore_search_documents.some(
      (index) =>
        index.name === "lore_search_documents_access_kind_status_updatedAt" &&
        "projectionOwner" in index.key,
    ),
    false,
    "기존 이름에 새 key spec을 덮어써 MongoDB IndexKeySpecsConflict를 만들면 안 됨",
  );
  assert.equal(typeof findLoreUniqueIndexConflicts, "function");
});

test("구조화 report 역참조는 각 target identity의 multikey index를 가진다", () => {
  for (const [field, name] of [
    ["relatedWikiSlugs", "session_reports_relatedWikiSlugs"],
    ["relatedPersonnelCodenames", "session_reports_relatedPersonnelCodenames"],
    ["relatedCatalogSlugs", "session_reports_relatedCatalogSlugs"],
  ]) {
    const index = SESSION_REPORT_INDEX_DEFINITIONS.find(
      (candidate) => candidate.name === name,
    );
    assert.deepEqual(index?.key, { [field]: 1 });
  }
  assert.equal(
    SESSION_REPORT_INDEX_DEFINITIONS.find(
      (index) => index.name === "session_reports_sessionId_unique",
    )?.unique,
    true,
  );
});

test("sessionId unique DDL도 직전 duplicate preflight 후 순차 적용한다", async () => {
  const operations = [];
  const ensured = [];
  const fakeDb = {
    listCollections() {
      return { hasNext: async () => true };
    },
    collection(collection) {
      assert.equal(collection, "session_reports");
      return {
        aggregate() {
          operations.push("aggregate");
          return { hasNext: async () => false };
        },
        async createIndex(_key, options) {
          operations.push(`create:${options.name}`);
          return options.name;
        },
      };
    },
  };

  await ensureSessionReportIndexes(fakeDb, {
    onEnsured: (index) => ensured.push(index),
  });
  assert.equal(
    operations.filter((operation) => operation.startsWith("create:")).length,
    SESSION_REPORT_INDEX_DEFINITIONS.length,
  );
  const uniqueCreate = operations.indexOf(
    "create:session_reports_sessionId_unique",
  );
  assert.equal(operations[uniqueCreate - 1], "aggregate");
  assert.deepEqual(
    ensured.map((index) => index.name),
    SESSION_REPORT_INDEX_DEFINITIONS.map((index) => index.name),
  );
});

test("legacy logicalKey 누락 행은 backfill 전 generic duplicate group에서 제외한다", async () => {
  const pipelines = [];
  const fakeDb = {
    listCollections() {
      return { hasNext: async () => true };
    },
    collection(collection) {
      return {
        aggregate(pipeline) {
          pipelines.push({ collection, pipeline });
          return { hasNext: async () => false };
        },
      };
    },
  };

  assert.deepEqual(await findLoreUniqueIndexConflicts(fakeDb), []);
  const logicalKeyPipelines = pipelines.filter(({ pipeline }) =>
    pipeline.some(
      (stage) =>
        stage.$group?._id?.key0 === "$logicalKey",
    ),
  );
  assert.equal(logicalKeyPipelines.length, 3);
  for (const { pipeline } of logicalKeyPipelines) {
    assert.ok(
      pipeline.some(
        (stage) => stage.$match?.logicalKey?.$type === "string",
      ),
    );
  }
});

test("unique lore index는 각 createIndex 직전에 중복을 다시 검사하며 순차 재실행 가능하다", async () => {
  const operations = [];
  const ensured = [];
  const fakeDb = {
    listCollections() {
      return { hasNext: async () => true };
    },
    collection(collection) {
      return {
        aggregate(pipeline) {
          operations.push({ kind: "aggregate", collection, pipeline });
          return { hasNext: async () => false };
        },
        countDocuments: async () => 0,
        async createIndex(_key, options) {
          operations.push({
            kind: "createIndex",
            collection,
            name: options.name,
          });
          return options.name;
        },
      };
    },
  };

  await ensureLoreIndexes(fakeDb, {
    onEnsured: (index) => ensured.push(index),
  });

  const uniqueNames = new Set(
    Object.values(LORE_INDEX_DEFINITIONS)
      .flat()
      .filter((index) => index.unique === true)
      .map((index) => index.name),
  );
  const createOperations = operations.filter(
    (operation) => operation.kind === "createIndex",
  );
  assert.equal(
    createOperations.length,
    Object.values(LORE_INDEX_DEFINITIONS).flat().length,
  );
  assert.deepEqual(
    ensured,
    createOperations.map((operation) => ({
      collection: operation.collection,
      name: operation.name,
    })),
  );

  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index];
    if (
      operation.kind !== "createIndex" ||
      !uniqueNames.has(operation.name)
    ) {
      continue;
    }
    const preceding = operations[index - 1];
    assert.equal(preceding?.kind, "aggregate", operation.name);
    assert.equal(preceding?.collection, operation.collection, operation.name);
  }
});
