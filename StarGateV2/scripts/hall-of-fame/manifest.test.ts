import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

test("lore 검토 revision은 record와 manifest가 일치할 때만 허용한다", () => {
  const { records } = fixture();
  const operationRecord = {
    ...records[0]!,
    domain: "OPERATION" as const,
    category: "RESEARCH_TECH" as const,
    rank: undefined,
    logicalKey: "operation:REPORT-1:character-1",
    publicKey: "",
    source: {
      type: "SESSION_REPORT" as const,
      key: "REPORT-1",
      recordId: "report-record-1",
      label: "작전 보고서",
    },
    analyzerRevision: "operation-honor-manual-v1",
    minRole: "U" as const,
    evidenceAudit: [
      { hash: "a".repeat(64), section: "SUMMARY" as const },
      { hash: "b".repeat(64), section: "HIGHLIGHT" as const },
    ],
  };
  operationRecord.publicKey = `honor_${createHash("sha256")
    .update(operationRecord.logicalKey)
    .digest("hex")
    .slice(0, 24)}`;
  const manifest = createHallOfFameBackfillManifest({
    analyzerRevision: "operation-honor-manual-v1",
    generatedAt: "2026-08-27T00:00:00.000Z",
    database: "stargate-test",
    novex: [],
    operations: [
      {
        sourceKey: "REPORT-1",
        sourceRecordId: "report-record-1",
        sourceRevision: "2026-08-27T00:00:00.000Z",
        sourceHash: operationRecord.sourceHash,
        records: [serializeHonorRecord(operationRecord)],
      },
    ],
    skipped: [],
    issues: [],
  });
  assert.equal(
    parseHallOfFameBackfillManifest(manifest).analyzerRevision,
    "operation-honor-manual-v1",
  );
  const mismatched = structuredClone(manifest);
  mismatched.analyzerRevision = "operation-honor-v1";
  assert.throws(
    () => parseHallOfFameBackfillManifest(mismatched),
    /HALL_OF_FAME_MANIFEST_ANALYZER_REVISION_INVALID|HALL_OF_FAME_MANIFEST_OPERATION_HASH_MISMATCH|HALL_OF_FAME_MANIFEST_HASH_MISMATCH/,
  );
  assert.throws(
    () =>
      createHallOfFameBackfillManifest({
        analyzerRevision: "operation-honor-unreviewed-v99",
        generatedAt: "2026-08-27T00:00:00.000Z",
        database: "stargate-test",
        novex: [],
        operations: [],
        skipped: [],
        issues: [],
      }),
    /HALL_OF_FAME_MANIFEST_ANALYZER_REVISION_INVALID/,
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
    backfill.indexOf("return summary"),
  );

  assert.match(backfill, /maintenance 구간에서만 실행/);
  assert.match(
    backfill,
    /fenceOperationDependencies[\s\S]*__honorAnalysisLockAt/,
  );
  assert.match(backfill, /BACKFILL_NOVEX_SEASON_HONORS_UNSUPPORTED/);
  assert.doesNotMatch(backfill, /loadCurrentNovex|materializeNovexSeasonHonors/);
  assert.doesNotMatch(backfill, /Ollama|OLLAMA_API_KEY|analyzer\.analyze/);
  assert.match(backfill, /--notify-new/);
  assert.match(backfill, /previousLogicalKeys\.has\(record\.logicalKey\)/);
  assert.match(backfill, /\$setOnInsert:[\s\S]*type: "HONOR"/);
  assert.match(
    transaction,
    /withTransaction<ApplySummary>[\s\S]*const attemptSummary: ApplySummary/,
  );
  assert.match(transaction, /attemptSummary\.notificationsCreated/);
  assert.doesNotMatch(transaction, /summary\.notificationsCreated/);
  assert.match(transaction, /await assertManifestCoverageCurrent/);
  assert.match(transaction, /await loadCurrentOperation/);
  assert.match(transaction, /await loadCurrentSkipped/);
  assert.match(transaction, /await fenceOperationDependencies/);
  assert.ok(
    transaction.indexOf("await assertManifestCoverageCurrent") <
      transaction.indexOf("await loadCurrentOperation"),
  );
  assert.ok(
    transaction.indexOf("await loadCurrentSkipped") <
      transaction.indexOf("await fenceOperationDependencies"),
  );
  assert.ok(
    transaction.indexOf("await fenceOperationDependencies") <
      transaction.indexOf("await withdrawHonorRecordsBySource"),
  );
  assert.match(
    backfill,
    /charactersCol[\s\S]*resolution\.matchingCharacters[\s\S]*__honorAnalysisLockAt/,
  );
  assert.match(
    backfill,
    /usersCol[\s\S]*resolution\.ownerStates[\s\S]*__honorAnalysisLockAt/,
  );
});

test("lore review 적용 진입점은 core만 빌드하고 명시적 manifest를 요구한다", async () => {
  const [packageJsonSource, backfill] = await Promise.all([
    readFile(new URL("../../package.json", import.meta.url), "utf8"),
    readFile(new URL("./backfill.ts", import.meta.url), "utf8"),
  ]);
  const packageJson = JSON.parse(packageJsonSource) as {
    scripts?: Record<string, string>;
  };
  const command = packageJson.scripts?.["hall-of-fame:apply-review"] ?? "";

  assert.match(command, /@stargate\/shared-db build/);
  assert.match(command, /@stargate\/core build/);
  assert.doesNotMatch(command, /--env-file-if-exists/);
  assert.match(command, /scripts\/hall-of-fame\/backfill\.ts$/);
  assert.match(backfill, /pnpm hall-of-fame:apply-review -- --execute --manifest <path> --yes/);
});
