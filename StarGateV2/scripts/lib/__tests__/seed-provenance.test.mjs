import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  historicalReportSessionIds,
  seedManifestHash,
  seedPayloadSourceId,
} from "../seed-provenance.ts";

const PROJECT_ROOT = resolve(import.meta.dirname, "../../..");
const PAYLOAD_ROOT = resolve(PROJECT_ROOT, "scripts/seed-payloads");

test("seed source ID는 path와 immutable manifest hash에 대해 결정적이다", () => {
  const file = resolve(PAYLOAD_ROOT, "example.json");
  const hash = seedManifestHash("{}");
  assert.equal(
    seedPayloadSourceId(file, hash, PROJECT_ROOT),
    seedPayloadSourceId(file, hash, PROJECT_ROOT),
  );
  assert.notEqual(
    seedPayloadSourceId(file, hash, PROJECT_ROOT),
    seedPayloadSourceId(file, seedManifestHash('{"changed":true}'), PROJECT_ROOT),
  );
});

test("전체 corpus의 historical report provenance 계획은 12개 identity를 모두 덮는다", () => {
  const reportSources = new Map();
  for (const name of readdirSync(PAYLOAD_ROOT).filter((value) => value.endsWith(".json"))) {
    const file = resolve(PAYLOAD_ROOT, name);
    const sourceText = readFileSync(file, "utf8");
    const sourceId = seedPayloadSourceId(
      file,
      seedManifestHash(sourceText),
      PROJECT_ROOT,
    );
    for (const sessionId of historicalReportSessionIds(sourceText)) {
      const sources = reportSources.get(sessionId) ?? new Set();
      sources.add(sourceId);
      reportSources.set(sessionId, sources);
    }
  }

  assert.equal(reportSources.size, 12);
  assert.ok([...reportSources.values()].every((sources) => sources.size > 0));
  assert.ok([...reportSources.values()].some((sources) => sources.size > 1));
});
