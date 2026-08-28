import assert from "node:assert/strict";
import test from "node:test";

import {
  HONOR_LORE_REVIEW_REVISION,
  HONOR_REVIEW_SOURCE_MAX_CHARS,
  buildOperationHonorRecords,
  reduceOperationHonorSource,
  validateOperationHonorReview,
} from "../dist/index.js";

function fixture() {
  const report = {
    _id: "507f1f77bcf86cd799439099",
    sessionId: "REPORT-LORE-1",
    sessionTitle: "구조 작전",
    minRole: "U",
    summary:
      "ALPHA는 붕괴 구역에 재진입해 고립된 요원을 구조했다. ALPHA는 후퇴로를 확보해 부상자를 안전 지대로 이송했다.",
    highlights: [
      "ALPHA가 위험을 감수하고 차폐 장치를 재가동했다.",
      "BRAVO는 외곽 경계에 참여했다.",
    ],
    relatedPersonnelCodenames: ["ALPHA", "NPC-ONE"],
    createdAt: new Date("2026-08-20T00:00:00.000Z"),
    updatedAt: new Date("2026-08-25T00:00:00.000Z"),
  };
  const characters = [
    {
      _id: "507f1f77bcf86cd799439011",
      type: "AGENT",
      ownerId: "507f191e810c19729de860ea",
      codename: "ALPHA",
    },
    {
      _id: "507f1f77bcf86cd799439012",
      type: "NPC",
      ownerId: null,
      codename: "NPC-ONE",
    },
    {
      _id: "507f1f77bcf86cd799439013",
      type: "AGENT",
      ownerId: "507f191e810c19729de860eb",
      codename: "BRAVO",
    },
  ];
  const source = reduceOperationHonorSource({ report, characters });
  assert.ok(source);
  return { report, source };
}

test("lore 검토 source는 명시적으로 연결된 플레이어 AGENT와 안전한 본문만 포함한다", () => {
  const { source } = fixture();
  assert.deepEqual(source.candidates.map((candidate) => candidate.codename), [
    "ALPHA",
  ]);
  assert.ok(source.text.length <= HONOR_REVIEW_SOURCE_MAX_CHARS);
  assert.doesNotMatch(source.text, /NPC-ONE|https?:\/\//u);
});

test("서로 독립된 원문 근거 두 개를 가진 lore 판정만 공적 원장으로 변환한다", () => {
  const { source } = fixture();
  const honors = validateOperationHonorReview({
    source,
    items: [
      {
        codename: "ALPHA",
        category: "RESCUE_PROTECTION",
        title: "붕괴 구역 구조 공적",
        citation: "위험 구역 재진입과 후퇴로 확보로 고립 인원의 생환에 기여했다.",
        evidenceQuotes: [
          "ALPHA는 붕괴 구역에 재진입해 고립된 요원을 구조했다.",
          "ALPHA는 후퇴로를 확보해 부상자를 안전 지대로 이송했다.",
        ],
      },
    ],
  });
  const [record] = buildOperationHonorRecords({ source, honors });
  assert.equal(record.analyzerRevision, HONOR_LORE_REVIEW_REVISION);
  assert.equal(record.characterId, source.candidates[0].characterId);
  assert.equal(record.evidenceAudit.length, 2);
  assert.equal(record.minRole, "U");
  assert.equal(record.source.recordId, source.sourceRecordId);
});

test("허용되지 않은 인물·공개 내부정보·겹친 근거·보고서당 3건 초과는 거부한다", () => {
  const { source } = fixture();
  const base = {
    codename: "ALPHA",
    category: "RESCUE_PROTECTION",
    title: "구조 공적",
    citation: "고립 인원의 안전한 생환에 기여했다.",
    evidenceQuotes: [
      "ALPHA는 붕괴 구역에 재진입해 고립된 요원을 구조했다.",
      "ALPHA는 후퇴로를 확보해 부상자를 안전 지대로 이송했다.",
    ],
  };
  assert.throws(
    () =>
      validateOperationHonorReview({
        source,
        items: [{ ...base, codename: "BRAVO" }],
      }),
    /OPERATION_HONOR_REVIEW_ITEM_REJECTED/,
  );
  assert.throws(
    () =>
      validateOperationHonorReview({
        source,
        items: [{ ...base, citation: "model payload를 근거로 선정했다." }],
      }),
    /OPERATION_HONOR_REVIEW_ITEM_REJECTED/,
  );
  assert.throws(
    () =>
      validateOperationHonorReview({
        source,
        items: [
          {
            ...base,
            evidenceQuotes: [
              "ALPHA는 붕괴 구역에 재진입해 고립된 요원을 구조했다.",
              "붕괴 구역에 재진입해 고립된 요원을 구조했다.",
            ],
          },
        ],
      }),
    /OPERATION_HONOR_REVIEW_ITEM_REJECTED/,
  );
  assert.throws(
    () =>
      validateOperationHonorReview({
        source,
        items: [base, base, base, base],
      }),
    /OPERATION_HONOR_REVIEW_SOURCE_LIMIT_INVALID/,
  );
});
