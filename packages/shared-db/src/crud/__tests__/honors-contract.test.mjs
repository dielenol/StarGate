import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";

import { ObjectId } from "mongodb";

import {
  HONOR_INDEX_DEFINITIONS,
  assertHonorRecordInvariants,
  buildHonorPublicKey,
  buildNovexHonorLogicalKey,
  buildNovexHonorRecords,
  buildOperationHonorSourceMaterial,
  close,
  connect,
  ensureHonorIndexes,
  getDb,
  queueHonorReview,
  shouldForceHonorReviewAfterSourceRecovery,
  shouldSupersedeHonorsWhenQueueing,
  skipHonorReviewSource,
} from "../../../dist/index.js";

const HAS_DB =
  process.env.RUN_DB_INTEGRATION_TESTS === "1" &&
  typeof process.env.MONGODB_TEST_URI === "string" &&
  process.env.MONGODB_TEST_URI.length > 0;
const DB_NAME = "stargate_test_honor_contracts";

before(async () => {
  if (!HAS_DB) return;
  await connect({
    uri: process.env.MONGODB_TEST_URI,
    dbName: DB_NAME,
    maxPoolSize: 5,
  });
  await ensureHonorIndexes(await getDb());
});

after(async () => {
  if (!HAS_DB) return;
  await (await getDb()).dropDatabase();
  await close();
});

test("NOVEX TOP3 materialization은 season+character 논리키와 publicKey가 결정적이다", () => {
  const season = {
    _id: "season-1",
    startsAt: new Date("2026-08-01T00:00:00.000Z"),
    endsAt: new Date("2026-08-25T00:00:00.000Z"),
    status: "FINALIZED",
    finalizedAt: new Date("2026-08-25T00:00:00.000Z"),
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
  };
  const performances = Array.from({ length: 4 }, (_, index) => ({
    _id: `performance-${index}`,
    seasonId: season._id,
    characterId: `character-${index + 1}`,
    codename: `AGENT-${index + 1}`,
    linkedReturn: 0.2 - index * 0.01,
    investedValue: 100,
    buyCount: 2,
    exposureSlots: 10,
    eligible: true,
    rank: index + 1,
    updatedAt: season.endsAt,
  }));
  const records = buildNovexHonorRecords({ season, performances });
  assert.equal(records.length, 3);
  const logicalKey = buildNovexHonorLogicalKey("season-1", "character-1");
  assert.equal(records[0].logicalKey, logicalKey);
  assert.equal(records[0].publicKey, buildHonorPublicKey(logicalKey));
  assert.equal(records[0].rank, 1);
  assert.equal(records[0].status, "ACTIVE");
  assert.doesNotThrow(() => assertHonorRecordInvariants(records[0]));
  assert.throws(
    () => assertHonorRecordInvariants({ ...records[0], status: "WITHDRAWN" }),
    /HONOR_RECORD_INVARIANT_INVALID/,
  );
  const duplicateRank = buildNovexHonorRecords({
    season,
    performances: [
      ...performances,
      {
        ...performances[0],
        _id: "performance-duplicate",
        characterId: "character-duplicate",
        codename: "AAA-DUPLICATE",
      },
    ],
  });
  assert.deepEqual(duplicateRank.map((record) => record.rank), [1, 2, 3]);
  assert.equal(duplicateRank.length, 3);
  assert.equal(duplicateRank[0].codenameSnapshot, "AAA-DUPLICATE");
});

test("revision 재검토는 기존 공적을 유지하고 source hash 변경만 즉시 숨긴다", () => {
  assert.equal(
    shouldSupersedeHonorsWhenQueueing({
      existingSourceHash: "same",
      nextSourceHash: "same",
    }),
    false,
  );
  assert.equal(
    shouldSupersedeHonorsWhenQueueing({
      existingSourceHash: "before",
      nextSourceHash: "after",
    }),
    true,
  );
  assert.equal(
    shouldSupersedeHonorsWhenQueueing({
      nextSourceHash: "same",
      activeSourceHashes: ["same", "same"],
    }),
    false,
  );
  assert.equal(
    shouldSupersedeHonorsWhenQueueing({
      nextSourceHash: "next",
      activeSourceHashes: ["before"],
    }),
    true,
  );
  assert.equal(
    shouldForceHonorReviewAfterSourceRecovery({
      status: "SKIPPED",
      lastError: "SOURCE_NOT_ANALYZABLE",
    }),
    true,
  );
  assert.equal(
    shouldForceHonorReviewAfterSourceRecovery({
      status: "SKIPPED",
      lastError: "upstream exhausted",
    }),
    false,
  );
});

test("canonical operation source hash는 candidate 순서와 무관하고 본문/후보 변경을 감지한다", () => {
  const report = {
    sessionId: "REPORT-1",
    summary: "ALPHA가 구조를 수행했다.",
    highlights: ["BRAVO가 출구를 확보했다."],
    relatedPersonnelCodenames: ["ALPHA", "BRAVO"],
    updatedAt: new Date("2026-08-25T00:00:00.000Z"),
  };
  const alpha = {
    _id: new ObjectId("507f1f77bcf86cd799439011"),
    type: "AGENT",
    ownerId: "507f191e810c19729de860ea",
    codename: "ALPHA",
  };
  const bravo = {
    _id: new ObjectId("507f1f77bcf86cd799439012"),
    type: "AGENT",
    ownerId: "507f191e810c19729de860eb",
    codename: "BRAVO",
  };
  const first = buildOperationHonorSourceMaterial({
    report,
    characters: [bravo, alpha],
  });
  const second = buildOperationHonorSourceMaterial({
    report,
    characters: [alpha, bravo],
  });
  assert.ok(first);
  assert.equal(first.sourceHash, second.sourceHash);
  const changed = buildOperationHonorSourceMaterial({
    report: { ...report, highlights: ["BRAVO가 다른 경로를 확보했다."] },
    characters: [alpha, bravo],
  });
  assert.notEqual(first.sourceHash, changed.sourceHash);
  const metadataOnlyChange = buildOperationHonorSourceMaterial({
    report: {
      ...report,
      updatedAt: new Date("2026-08-25T00:00:01.000Z"),
    },
    characters: [alpha, bravo],
  });
  assert.notEqual(first.sourceHash, metadataOnlyChange.sourceHash);
});

test("동일 코드네임의 서로 다른 캐릭터는 분석 후보에서 fail-closed한다", () => {
  const report = {
    sessionId: "REPORT-AMBIGUOUS",
    summary: "ALPHA가 구조를 수행했다.",
    highlights: ["ALPHA가 출구를 확보했다."],
    relatedPersonnelCodenames: ["ALPHA"],
    updatedAt: new Date("2026-08-25T00:00:00.000Z"),
  };
  const first = {
    _id: new ObjectId("507f1f77bcf86cd799439011"),
    type: "AGENT",
    ownerId: "507f191e810c19729de860ea",
    codename: "ALPHA",
  };
  const ambiguousRows = [
    {
      ...first,
      _id: new ObjectId("507f1f77bcf86cd799439012"),
      ownerId: "507f191e810c19729de860eb",
    },
    {
      ...first,
      _id: new ObjectId("507f1f77bcf86cd799439013"),
      ownerId: null,
    },
    {
      ...first,
      _id: new ObjectId("507f1f77bcf86cd799439014"),
      type: "NPC",
      ownerId: null,
    },
  ];
  for (const ambiguous of ambiguousRows) {
    assert.equal(
      buildOperationHonorSourceMaterial({
        report,
        characters: [first, ambiguous],
      }),
      null,
    );
  }
});

test("원장 index는 논리키·공개키·공개등급 timeline과 legacy 상태 조회를 고정한다", () => {
  assert.ok(
    HONOR_INDEX_DEFINITIONS.honor_records.some(
      (index) => index.name === "honor_records_logicalKey_unique" && index.unique,
    ),
  );
  assert.ok(
    HONOR_INDEX_DEFINITIONS.honor_records.some(
      (index) => index.name === "honor_records_minRole_status_timeline",
    ),
  );
  assert.ok(
    HONOR_INDEX_DEFINITIONS.honor_analysis_states.some(
      (index) => index.name === "honor_analysis_states_due_lease",
    ),
  );
});

test("report CRUD는 lore 검토 대기를 생성하고 적용 도구만 확정 원장을 쓴다", async () => {
  const [reports, stocks, honors, backfill] = await Promise.all([
    readFile(new URL("../session-reports.ts", import.meta.url), "utf8"),
    readFile(new URL("../stock-market.ts", import.meta.url), "utf8"),
    readFile(new URL("../honors.ts", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../../../../../StarGateV2/scripts/hall-of-fame/backfill.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  assert.match(reports, /reconcileSessionReportHonorReview\(created, options\.session\)/);
  assert.match(reports, /await reconcileSessionReportHonorReview\(finalReport/);
  assert.match(reports, /reason: "SOURCE_DELETED"/);
  assert.match(reports, /analyzerRevision: HONOR_LORE_REVIEW_REVISION/);
  assert.doesNotMatch(reports, /isHallOfFameV2WritesEnabled/);
  assert.match(reports, /__honorAnalysisLockAt: _honorAnalysisLockAt/);
  assert.doesNotMatch(stocks, /materializeNovexSeasonHonors/);
  assert.doesNotMatch(stocks, /view=novex&season=/);
  assert.match(stocks, /link: "\/erp\/stock"/);
  assert.doesNotMatch(reports, /honor_source_fences|fenceHonorSources/);
  assert.doesNotMatch(stocks, /honor_source_fences|fenceHonorSources/);
  assert.match(backfill, /await assertManifestCoverageCurrent\(manifest, session\)/);
  assert.match(backfill, /BACKFILL_NOVEX_SEASON_HONORS_UNSUPPORTED/);
  assert.doesNotMatch(backfill, /buildNovexHonorRecords|materializeNovexSeasonHonors/);
  assert.match(backfill, /maintenance 구간에서만 실행/);
  assert.doesNotMatch(backfill, /Ollama|Cloud analysis|OLLAMA_API_KEY/);
  assert.doesNotMatch(honors, /claimDueHonorAnalysis|completeClaimedHonorAnalysis/);

  const candidateFinder = honors.slice(
    honors.indexOf("async function resolveHonorCandidateCharactersByCodenames"),
    honors.indexOf("export async function upsertHonorRecord"),
  );
  assert.match(
    candidateFinder,
    /\.find\(\s*\{ codename: \{ \$in: normalized \} \}/,
  );
  assert.match(candidateFinder, /codenameCounts\.get\(character\.codename\) === 1/);
  assert.match(candidateFinder, /character\.type === "AGENT"/);
  assert.match(candidateFinder, /activeOwnerIds\.has/);
  assert.match(
    backfill,
    /updatedAt: report\.updatedAt[\s\S]*\$currentDate: \{ __honorAnalysisLockAt: true \}/,
  );
  assert.match(
    backfill,
    /resolution\.matchingCharacters\.map[\s\S]*type: character\.type[\s\S]*ownerId: character\.ownerId[\s\S]*\$currentDate: \{ __honorAnalysisLockAt: true \}/,
  );
  assert.match(
    backfill,
    /resolution\.ownerStates\.map[\s\S]*status: owner\.status[\s\S]*\$currentDate: \{ __honorAnalysisLockAt: true \}/,
  );
  assert.match(
    honors,
    /characters\.flatMap[\s\S]*ownerStates[\s\S]*eligibleCharacters/,
  );
  assert.match(backfill, /if \(options\.notifyNew\)/);
  assert.match(backfill, /previousLogicalKeys\.has\(record\.logicalKey\)/);
  assert.match(backfill, /dedupeKey: `honor:\$\{record\.logicalKey\}`/);
  assert.doesNotMatch(backfill, /webhookUrl|fetch\(/);
  assert.ok(
    stocks.indexOf("if (!season) return false") <
      stocks.indexOf("await recalculateStockSeasonPerformance"),
  );
});

test(
  "동일 hash/revision 검토 대기와 SKIPPED는 불필요하게 갱신하지 않는다",
  { skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요" },
  async () => {
    const queuedAt = new Date("2026-08-25T00:00:00.000Z");
    const firstHash = "a".repeat(64);
    const nextHash = "b".repeat(64);
    const first = await queueHonorReview({
      sourceKey: "REPORT-LEASE",
      sourceRecordId: "507f1f77bcf86cd799439011",
      sourceHash: firstHash,
      analyzerRevision: "revision-1",
      now: queuedAt,
    });
    assert.equal(first.queued, true);
    const unchanged = await queueHonorReview({
      sourceKey: "REPORT-LEASE",
      sourceRecordId: "507f1f77bcf86cd799439011",
      sourceHash: firstHash,
      analyzerRevision: "revision-1",
      now: new Date(queuedAt.getTime() + 10_000),
    });
    assert.equal(unchanged.queued, false);
    assert.equal(unchanged.state.updatedAt.toISOString(), queuedAt.toISOString());

    const replaced = await queueHonorReview({
      sourceKey: "REPORT-LEASE",
      sourceRecordId: "507f1f77bcf86cd799439011",
      sourceHash: nextHash,
      analyzerRevision: "revision-1",
    });
    assert.equal(replaced.queued, true);
    const skippedAt = new Date("2026-08-25T00:01:00.000Z");
    await skipHonorReviewSource({
      sourceKey: "REPORT-LEASE",
      reason: "halted",
      now: skippedAt,
    });
    assert.equal(
      await skipHonorReviewSource({
        sourceKey: "REPORT-LEASE",
        reason: "halted",
        now: new Date("2026-08-25T00:02:00.000Z"),
      }),
      false,
    );
    const stableSkip = await (await getDb())
      .collection("honor_analysis_states")
      .findOne({ _id: "session-report:REPORT-LEASE" });
    assert.equal(stableSkip?.updatedAt.toISOString(), skippedAt.toISOString());
    const same = await queueHonorReview({
      sourceKey: "REPORT-LEASE",
      sourceRecordId: "507f1f77bcf86cd799439011",
      sourceHash: nextHash,
      analyzerRevision: "revision-1",
    });
    assert.equal(same.queued, false);
    assert.equal(same.state.status, "SKIPPED");
  },
);
