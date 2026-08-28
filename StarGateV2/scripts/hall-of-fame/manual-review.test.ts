import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildOperationHonorRecords,
  type OperationHonorReviewSource,
} from "@stargate/core";
import type { HonorRecord } from "@stargate/shared-db";

import {
  buildManualReviewContentHash,
  parseManualOperationHonorReviewPlan,
  resolveManualEvidenceQuote,
  validateManualReviewItems,
} from "./manual-review.ts";
import { inspectHonorIndexContract } from "./index-contract.ts";
import {
  operationHonorLedgerMatches,
  resolveReviewStatusDatabaseName,
} from "./review-status.ts";

const contentHash = "a".repeat(64);

function sourceFixture(): OperationHonorReviewSource {
  return {
    sourceKey: "REPORT-1",
    sourceRecordId: "report-record-1",
    sourceLabel: "작전 보고서",
    sourceHash: "a".repeat(64),
    occurredAt: new Date("2026-08-01T00:00:00.000Z"),
    candidates: [{ characterId: "character-1", codename: "AGENT-1" }],
    segments: [
      {
        section: "SUMMARY",
        text: "AGENT-1은 첫 번째 위험을 분석했다. AGENT-1은 두 번째 위협을 격리했다.",
      },
      { section: "HIGHLIGHT", text: "AGENT-1은 현장 분석을 완수했다." },
      { section: "HIGHLIGHT", text: "AGENT-1은 위협을 안전하게 격리했다." },
    ],
    text: "[SUMMARY 1]\nAGENT-1은 첫 번째 위험을 분석했다. AGENT-1은 두 번째 위협을 격리했다.\n\n[HIGHLIGHT 2]\nAGENT-1은 현장 분석을 완수했다.\n\n[HIGHLIGHT 3]\nAGENT-1은 위협을 안전하게 격리했다.",
  };
}

test("lore review는 정해진 부문·보고서당 최대 3건·중복 논리키를 검증한다", () => {
  const valid = parseManualOperationHonorReviewPlan({
    schemaVersion: 1,
    reviewedSources: [
      { sourceKey: "REPORT-1", contentHash, outcome: "AWARDED" },
    ],
    items: [
      {
        sourceKey: "REPORT-1",
        codename: "AGENT-1",
        category: "RESEARCH_TECH",
        title: "현장 분석 공적",
        citation: "위협을 분석하고 안전하게 격리했습니다.",
        evidence: [
          { section: "HIGHLIGHT", index: 0 },
          { section: "HIGHLIGHT", index: 1 },
        ],
      },
    ],
  });
  assert.equal(valid.items.length, 1);
  assert.throws(
    () =>
      parseManualOperationHonorReviewPlan({
        schemaVersion: 1,
        reviewedSources: valid.reviewedSources,
        items: [...valid.items, ...valid.items],
      }),
    /MANUAL_REVIEW_ITEM_DUPLICATE/,
  );
});

test("summary selector는 정확히 한 문장만 고르고 모호하거나 없는 근거를 거부한다", () => {
  const source = sourceFixture();
  assert.equal(
    resolveManualEvidenceQuote(source, {
      section: "SUMMARY",
      contains: "첫 번째 위험",
    }),
    "AGENT-1은 첫 번째 위험을 분석했다.",
  );
  assert.throws(
    () =>
      resolveManualEvidenceQuote(source, {
        section: "SUMMARY",
        contains: "AGENT-1은",
      }),
    /MANUAL_REVIEW_EVIDENCE_AMBIGUOUS/,
  );
});

test("lore review도 허용 AGENT·exact quote·공개 문구 gate를 그대로 통과해야 한다", () => {
  const source = sourceFixture();
  const [item] = parseManualOperationHonorReviewPlan({
    schemaVersion: 1,
    reviewedSources: [
      { sourceKey: "REPORT-1", contentHash, outcome: "AWARDED" },
    ],
    items: [
      {
        sourceKey: "REPORT-1",
        codename: "AGENT-1",
        category: "RESEARCH_TECH",
        title: "현장 분석 공적",
        citation: "위협을 분석하고 안전하게 격리했습니다.",
        evidence: [
          { section: "HIGHLIGHT", index: 0 },
          { section: "HIGHLIGHT", index: 1 },
        ],
      },
    ],
  }).items;
  const honors = validateManualReviewItems({ source, items: [item!] });
  assert.equal(honors.length, 1);
  assert.equal(honors[0]?.codename, "AGENT-1");
  assert.equal(honors[0]?.evidenceAudit.length, 2);
  assert.throws(
    () =>
      validateManualReviewItems({
        source,
        items: [{ ...item!, codename: "UNKNOWN" }],
      }),
    /MANUAL_REVIEW_ITEM_REJECTED/,
  );
});

test("lore review는 0건 판정도 명시하고 검토한 서술 hash를 고정한다", () => {
  const plan = parseManualOperationHonorReviewPlan({
    schemaVersion: 1,
    reviewedSources: [
      { sourceKey: "REPORT-EMPTY", contentHash, outcome: "NO_AWARD" },
    ],
    items: [],
  });
  assert.equal(plan.reviewedSources[0]?.outcome, "NO_AWARD");
  assert.throws(
    () =>
      parseManualOperationHonorReviewPlan({
        schemaVersion: 1,
        reviewedSources: [
          { sourceKey: "REPORT-1", contentHash, outcome: "NO_AWARD" },
        ],
        items: [
          {
            sourceKey: "REPORT-1",
            codename: "AGENT-1",
            category: "RESEARCH_TECH",
            title: "현장 분석 공적",
            citation: "위협을 분석하고 안전하게 격리했습니다.",
            evidence: [
              { section: "HIGHLIGHT", index: 0 },
              { section: "HIGHLIGHT", index: 1 },
            ],
          },
        ],
      }),
    /MANUAL_REVIEW_OUTCOME_MISMATCH/,
  );

  const report = {
    sessionId: "REPORT-1",
    sessionTitle: "공적 검증 작전",
    summary: "본문",
    highlights: ["행동 기록"],
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
  };
  assert.notEqual(
    buildManualReviewContentHash(report),
    buildManualReviewContentHash({ ...report, summary: "수정된 본문" }),
  );
});

test("lore review CLI는 저장된 검토 계획을 안전한 기본 입력으로 사용한다", async () => {
  const source = await readFile(new URL("./manual-review.ts", import.meta.url), "utf8");
  assert.match(
    source,
    /defaultReviewPath[\s\S]*operation-honors-manual-review\.v1\.json/,
  );
  assert.match(source, /let reviewPath = defaultReviewPath/);
  assert.doesNotMatch(source, /--review 경로가 필요합니다/);
});

test("review status는 DB 대상 불일치와 공적 원장 materialization drift를 거부한다", async () => {
  assert.equal(
    resolveReviewStatusDatabaseName({ DB_NAME: "stargate" }),
    "stargate",
  );
  assert.throws(
    () =>
      resolveReviewStatusDatabaseName({
        DB_NAME: "stargate",
        MONGODB_DB_NAME: "another-db",
      }),
    /DB_NAME과 MONGODB_DB_NAME이 일치해야 합니다/,
  );

  const source = sourceFixture();
  const item = parseManualOperationHonorReviewPlan({
    schemaVersion: 1,
    reviewedSources: [
      { sourceKey: source.sourceKey, contentHash, outcome: "AWARDED" },
    ],
    items: [
      {
        sourceKey: source.sourceKey,
        codename: "AGENT-1",
        category: "RESEARCH_TECH",
        title: "현장 분석 공적",
        citation: "위협을 분석하고 안전하게 격리했습니다.",
        evidence: [
          { section: "HIGHLIGHT", index: 0 },
          { section: "HIGHLIGHT", index: 1 },
        ],
      },
    ],
  }).items[0]!;
  const expected = buildOperationHonorRecords({
    source,
    honors: validateManualReviewItems({ source, items: [item] }),
    issuedAt: new Date(0),
  });
  assert.equal(
    operationHonorLedgerMatches(expected as HonorRecord[], expected),
    true,
  );
  assert.equal(
    operationHonorLedgerMatches(
      [{ ...expected[0]!, citation: "변조된 공적 문구" }] as HonorRecord[],
      expected,
    ),
    false,
  );

  const statusSource = await readFile(
    new URL("./review-status.ts", import.meta.url),
    "utf8",
  );
  assert.match(statusSource, /LEDGER_DRIFT/);
  assert.match(statusSource, /orphanedActiveSources/);
  assert.match(statusSource, /!currentKeys\.has\(sourceKey\)/);
});

test("원장 인덱스 rollout은 기본 dry-run이며 execute와 yes를 함께 요구한다", async () => {
  const source = await readFile(
    new URL("./ensure-indexes.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /const execute = args\.includes\("--execute"\)/);
  assert.match(source, /if \(execute !== yes\)/);
  assert.match(source, /if \(conflictingBefore > 0\)/);
  assert.match(source, /if \(execute && missingBefore > 0\)/);
  assert.match(source, /await ensureHonorIndexes\(await getDb\(\)\)/);
  assert.match(
    source,
    /실행 모드에는 DB_NAME 또는 MONGODB_DB_NAME이 필요합니다/,
  );
  assert.match(source, /DB_NAME과 MONGODB_DB_NAME이 일치해야 합니다/);
});

test("원장 인덱스 계약은 key 순서와 unique 옵션 불일치를 충돌로 분류한다", () => {
  const desired = [
    { key: { sourceType: 1, sourceKey: 1 }, name: "source_unique", unique: true },
  ];
  assert.deepEqual(
    inspectHonorIndexContract(
      [{ v: 2, key: { sourceType: 1, sourceKey: 1 }, name: "source_unique", unique: true }],
      desired,
    ),
    { missing: [], conflicting: [] },
  );
  assert.deepEqual(
    inspectHonorIndexContract(
      [{ v: 2, key: { sourceKey: 1, sourceType: 1 }, name: "source_unique" }],
      desired,
    ),
    { missing: [], conflicting: ["source_unique"] },
  );
  assert.deepEqual(
    inspectHonorIndexContract(
      [
        {
          v: 2,
          key: { sourceType: 1, sourceKey: 1 },
          name: "source_unique",
          unique: true,
          collation: { locale: "en", strength: 2 },
        },
      ],
      desired,
    ),
    { missing: [], conflicting: ["source_unique"] },
  );
});

test("운영 심사 계획은 U 보고서 18건과 13개 공적을 명시하고 linkage는 source revision을 고정한다", async () => {
  const [reviewSource, linkageSource] = await Promise.all([
    readFile(
      new URL("./operation-honors-manual-review.v1.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../seed-payloads/session-report-honor-candidate-linkage-2026-08-27.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  const plan = parseManualOperationHonorReviewPlan(JSON.parse(reviewSource));
  assert.equal(plan.reviewedSources.length, 18);
  assert.equal(plan.items.length, 13);
  assert.equal(
    plan.reviewedSources.filter((source) => source.outcome === "AWARDED")
      .length,
    10,
  );
  assert.deepEqual(
    plan.reviewedSources.filter((source) =>
      ["NOSB-MINI-ROMANTID", "NOSB-S1E2-CHOICE"].includes(source.sourceKey),
    ),
    [
      {
        sourceKey: "NOSB-MINI-ROMANTID",
        contentHash:
          "ca95a3e7d5e6d2583f1425d80d5ffa24633a7f4e2ef85e5899392c14338d1212",
        outcome: "AWARDED",
      },
      {
        sourceKey: "NOSB-S1E2-CHOICE",
        contentHash:
          "adf182e93900cdfad45863620c3e9c6bb9cc73d9a5a61999819301c9603a817d",
        outcome: "AWARDED",
      },
    ],
  );
  assert.deepEqual(
    plan.items.filter((item) =>
      ["NOSB-MINI-ROMANTID", "NOSB-S1E2-CHOICE"].includes(item.sourceKey),
    ),
    [
      {
        sourceKey: "NOSB-MINI-ROMANTID",
        codename: "OTILIA",
        category: "SUPPORT_TEAMWORK",
        title: "810번 도서 인원 회수 공적",
        citation:
          "해쉬를 대신하려는 존재의 전입을 거부하고, 자기혐오를 직시한 그에게 관계와 생존의 근거를 제시해 전원 귀환에 기여했습니다.",
        evidence: [
          {
            section: "SUMMARY",
            contains: "오틸리아는 해쉬를 대체할 수 없다고",
          },
          {
            section: "SUMMARY",
            contains: "오틸리아는 누구나 자기혐오를 지니며",
          },
        ],
      },
      {
        sourceKey: "NOSB-S1E2-CHOICE",
        codename: "INDEXER",
        category: "RESEARCH_TECH",
        title: "왕관 감염 격리 공적",
        citation:
          "오디세이 시설에서 광원화 관련 단서를 확보하고 붕괴한 ZULU-0040 본체를 회수해 감염 격리와 후속 연구 기반을 보존했습니다.",
        evidence: [
          {
            section: "SUMMARY",
            contains:
              "해쉬 테거는 시설 책임자 슈타이너 박사의 기록과 증언을 통해",
          },
          {
            section: "SUMMARY",
            contains: "해쉬 테거는 본체를 회수했다",
          },
        ],
      },
    ],
  );

  const linkage = JSON.parse(linkageSource) as Array<{
    filter?: { sessionId?: string; updatedAt?: string };
    postcondition?: { updatedAt?: { $ne?: string } };
  }>;
  assert.equal(linkage.length, 12);
  assert.equal(
    new Set(linkage.map((entry) => entry.filter?.sessionId)).size,
    linkage.length,
  );
  for (const entry of linkage) {
    const updatedAt = entry.filter?.updatedAt;
    assert.equal(typeof updatedAt, "string");
    assert.equal(new Date(updatedAt!).toISOString(), updatedAt);
    assert.equal(entry.postcondition?.updatedAt?.$ne, updatedAt);
  }
});

test("seed runner는 linkage CAS 성공 뒤 updatedAt을 전진시키고 postcondition을 재검증한다", async () => {
  const runner = await readFile(
    new URL("../upsert-seed-payload.ts", import.meta.url),
    "utf8",
  );
  const apply = runner.slice(
    runner.indexOf("let domainChanged = false"),
    runner.indexOf("const saved ="),
  );
  assert.match(apply, /if \(domainChanged && writtenId\)/);
  assert.match(apply, /\$currentDate: \{ updatedAt: true \}/);
  assert.ok(
    runner.indexOf("await verifyPostcondition") >
      runner.indexOf("$currentDate: { updatedAt: true }"),
  );
});
