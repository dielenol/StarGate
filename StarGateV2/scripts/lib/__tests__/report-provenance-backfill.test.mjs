import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReportProvenanceUpdate,
  currentProvenanceLedger,
  immutableLoreSourcePayload,
  parseStoredLoreSource,
} from "../report-provenance-backfill.ts";

const CAPTURED_AT = new Date("2026-08-05T00:00:00.000Z");

function validSource(overrides = {}) {
  return {
    sourceId: "seed-payload:example",
    kind: "repository-document",
    title: "example.json",
    locator: {
      kind: "repository-path",
      value: "scripts/seed-payloads/example.json",
      anchor: `git:${"a".repeat(40)}`,
    },
    contentHash: "b".repeat(64),
    access: { visibility: "gm-only" },
    capturedAt: CAPTURED_AT,
    createdAt: CAPTURED_AT,
    updatedAt: CAPTURED_AT,
    ...overrides,
  };
}

test("malformed legacy provenance는 삭제 후보가 아니라 blocker다", () => {
  assert.throws(
    () => currentProvenanceLedger({ provenanceSourceId: { bad: true } }),
    /legacy provenanceSourceId/,
  );
  assert.throws(
    () => currentProvenanceLedger({ provenanceSourceId: "" }),
    /legacy provenanceSourceId/,
  );
});

test("legacy-only 정규화도 pending mutation으로 표시한다", () => {
  const plan = buildReportProvenanceUpdate(
    {
      provenanceSourceId: "seed-payload:legacy",
      provenanceSourceIds: ["seed-payload:new"],
    },
    ["seed-payload:new"],
  );
  assert.equal(plan.missingCount, 0);
  assert.equal(plan.removesLegacy, true);
  assert.equal(plan.needsUpdate, true);
  assert.deepEqual(plan.desired, ["seed-payload:legacy", "seed-payload:new"]);
});

test("stored source는 전체 schema와 capturedAt immutable pairing을 검증한다", () => {
  const parsed = parseStoredLoreSource(validSource());
  assert.deepEqual(
    immutableLoreSourcePayload(parsed).capturedAt,
    CAPTURED_AT,
  );
  assert.throws(
    () => parseStoredLoreSource(validSource({ capturedAt: undefined })),
    /capturedAt/,
  );
  const changedCapturedAt = validSource({
    capturedAt: new Date("2026-08-06T00:00:00.000Z"),
  });
  assert.notDeepEqual(
    immutableLoreSourcePayload(changedCapturedAt),
    immutableLoreSourcePayload(validSource()),
  );
});
