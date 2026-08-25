import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildNovexHonorRecords,
  type StockInvestmentSeason,
  type StockSeasonPerformance,
} from "@stargate/shared-db";

import {
  buildNovexSourceFingerprint,
  buildSkippedOperationSourceFingerprint,
  createHallOfFameBackfillManifest,
  parseHallOfFameBackfillManifest,
  serializeHonorRecord,
} from "./manifest.ts";
import { sameLogicalSourceSet } from "./backfill.ts";

function fixture() {
  const finalizedAt = new Date("2026-08-25T12:00:00.000Z");
  const season: StockInvestmentSeason = {
    _id: "season-1",
    startsAt: new Date("2026-08-01T00:00:00.000Z"),
    endsAt: finalizedAt,
    finalizedAt,
    status: "FINALIZED",
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
  };
  const performances: StockSeasonPerformance[] = [1, 2, 3].map((rank) => ({
    _id: `performance-${rank}`,
    seasonId: season._id,
    characterId: `character-${rank}`,
    codename: `AGENT-${rank}`,
    linkedReturn: 0.2 - rank * 0.01,
    investedValue: 1_000,
    buyCount: 2,
    exposureSlots: 10,
    eligible: true,
    rank: rank as 1 | 2 | 3,
    updatedAt: finalizedAt,
  }));
  const records = buildNovexHonorRecords({
    season,
    performances,
    issuedAt: finalizedAt,
  });
  return { season, records };
}

test("backfill manifest는 결정적 hash와 날짜 직렬화를 검증한다", () => {
  const { season, records } = fixture();
  const manifest = createHallOfFameBackfillManifest({
    generatedAt: "2026-08-25T12:00:00.000Z",
    database: "stargate-test",
    novex: [
      {
        seasonId: season._id,
        sourceFingerprint: buildNovexSourceFingerprint(records),
        records: records.map(serializeHonorRecord),
      },
    ],
    operations: [],
    skipped: [],
    issues: [],
  });
  const parsed = parseHallOfFameBackfillManifest(
    JSON.parse(JSON.stringify(manifest)),
  );
  assert.equal(parsed.manifestHash, manifest.manifestHash);
  assert.equal(
    parsed.novex[0]?.records[0]?.occurredAt,
    "2026-08-25T12:00:00.000Z",
  );
});

test("manifest 내용 변조와 비ACTIVE record는 적용 전에 거부한다", () => {
  const { season, records } = fixture();
  const manifest = createHallOfFameBackfillManifest({
    generatedAt: "2026-08-25T12:00:00.000Z",
    database: "stargate-test",
    novex: [
      {
        seasonId: season._id,
        sourceFingerprint: buildNovexSourceFingerprint(records),
        records: records.map(serializeHonorRecord),
      },
    ],
    operations: [],
    skipped: [],
    issues: [],
  });
  assert.throws(
    () =>
      parseHallOfFameBackfillManifest({
        ...manifest,
        database: "another-db",
      }),
    /HALL_OF_FAME_MANIFEST_HASH_MISMATCH/,
  );
  const unsafe = structuredClone(manifest);
  unsafe.novex[0]!.records[0]!.status = "WITHDRAWN";
  assert.throws(
    () => parseHallOfFameBackfillManifest(unsafe),
    /HONOR_RECORD_INVARIANT_INVALID/,
  );
});

test("backfill no-op은 sourceHash뿐 아니라 공개 materialization 전체가 같아야 한다", () => {
  const { records } = fixture();
  assert.equal(sameLogicalSourceSet(records, records), true);
  assert.equal(
    sameLogicalSourceSet(records, [
      { ...records[0]!, citation: "같은 sourceHash의 다른 공적 문구" },
      ...records.slice(1),
    ]),
    false,
  );
  assert.equal(sameLogicalSourceSet(records, []), false);
  assert.equal(sameLogicalSourceSet([], []), true);
});

test("분석 불가 보고서도 비공개 fingerprint로 apply 직전 변경을 감지한다", () => {
  const report = {
    _id: undefined,
    sessionId: "REPORT-SKIP",
    summary: "",
    highlights: [],
    relatedPersonnelCodenames: [],
    updatedAt: new Date("2026-08-25T12:00:00.000Z"),
  };
  const first = buildSkippedOperationSourceFingerprint({
    report,
    characters: [],
  });
  const second = buildSkippedOperationSourceFingerprint({
    report: { ...report, summary: "새로운 분석 가능 본문" },
    characters: [],
  });
  assert.notEqual(first, second);
  const metadataChanged = buildSkippedOperationSourceFingerprint({
    report: {
      ...report,
      updatedAt: new Date("2026-08-25T12:00:01.000Z"),
    },
    characters: [],
  });
  assert.notEqual(first, metadataChanged);
});

test("manifest apply는 maintenance 전제를 밝히고 첫 mutation 전에 coverage를 검증한다", async () => {
  const backfill = await readFile(
    new URL("./backfill.ts", import.meta.url),
    "utf8",
  );
  const transaction = backfill.slice(
    backfill.indexOf("await session.withTransaction"),
    backfill.indexOf("for (let index = 0; index < manifest.novex.length"),
  );

  assert.match(backfill, /maintenance 구간에서만 실행/);
  assert.match(backfill, /project<BackfillOperationReportRef>/);
  assert.match(
    backfill,
    /loadBackfillOperationReportRevision[\s\S]*updatedAt: report\.updatedAt[\s\S]*sessionReportVisibilityFilter\("U"\)/,
  );
  assert.match(
    backfill,
    /const beforeEgress[\s\S]*currentSource\.sourceHash === source\.sourceHash[\s\S]*analyzer\.analyze\([\s\S]*beforeEgress/,
  );
  assert.doesNotMatch(backfill, /honor_source_fences|fenceHonorSources/);
  assert.match(transaction, /await assertManifestCoverageCurrent/);
  assert.match(transaction, /await loadCurrentNovex/);
  assert.match(transaction, /await loadCurrentOperation/);
  assert.match(transaction, /await loadCurrentSkipped/);
  assert.ok(
    transaction.indexOf("await assertManifestCoverageCurrent") <
      transaction.indexOf("await loadCurrentNovex"),
  );
});
