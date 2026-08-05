import { test } from "node:test";
import assert from "node:assert/strict";

import {
  appendPersonalityObservation,
  classifyPersonalityObservationWrite,
  extractPersonalityObservationUpdate,
  toProtectedCharacterSetPayload,
  validateInitialPersonalityObservations,
  withPersonalityObservationGuard,
  withParsedInitialPersonalityObservations,
  withParsedPersonalityObservation,
} from "../personality-observation-update.ts";

const observation = {
  id: "NOSB-S1E5:RODION:coercive-control",
  sessionId: "NOSB-S1E5",
  trait: "강압적 통제 성향",
  summary: "규정과 공포를 통제 수단으로 사용했다.",
  evidence: [{ kind: "action", text: "명령 거부자를 격리했다." }],
  sourceLabel: "작전 보고서 S1E5",
  confidence: "confirmed",
};

test("관찰 update는 단일 $addToSet만 허용하고 live candidate를 거부한다", () => {
  assert.deepEqual(
    extractPersonalityObservationUpdate({
      $addToSet: { "lore.personalityObservations": observation },
    }),
    observation,
  );
  assert.throws(() =>
    extractPersonalityObservationUpdate({
      $set: { "lore.personalityObservations": [observation] },
    }),
  );
  assert.throws(() =>
    extractPersonalityObservationUpdate({
      $addToSet: {
        "lore.personalityObservations": observation,
        "lore.appearsInEvents": observation.sessionId,
      },
    }),
  );
  assert.throws(() =>
    extractPersonalityObservationUpdate({
      $addToSet: { "lore.personalityObservations": observation },
      $set: { updatedAt: "2026-08-05T00:00:00.000Z" },
    }),
  );
  assert.throws(() =>
    extractPersonalityObservationUpdate({
      $addToSet: {
        "lore.personalityObservations": { $each: [observation] },
      },
    }),
  );
  assert.throws(() =>
    extractPersonalityObservationUpdate({
      $addToSet: {
        "lore.personalityObservations": {
          ...observation,
          confidence: "candidate",
        },
      },
    }),
  );
  for (const update of [
    { $unset: { "lore.personalityObservations": "" } },
    { $pull: { "lore.personalityObservations": { id: observation.id } } },
    { $pop: { "lore.personalityObservations": 1 } },
    { $rename: { "lore.other": "lore.personalityObservations" } },
    { $set: { "lore.personalityObservations.0.confidence": "candidate" } },
    { $set: { lore: { personality: "전체 lore 교체" } } },
    { lore: { personality: "replacement document" } },
  ]) {
    assert.throws(() => extractPersonalityObservationUpdate(update));
  }
  assert.throws(() =>
    extractPersonalityObservationUpdate([
      { $unset: "lore.personalityObservations" },
    ]),
  );
  assert.throws(() =>
    extractPersonalityObservationUpdate([
      { $replaceRoot: { newRoot: "$replacement" } },
    ]),
  );
  for (const update of [
    { $set: { role: "lore" } },
    { $set: { notes: "lore.personalityObservations" } },
    { $set: { "lore.notes": "lore" } },
    [{ $set: { role: "lore", "lore.notes": "lore.personalityObservations" } }],
  ]) {
    assert.equal(extractPersonalityObservationUpdate(update), null);
  }
});

test("schema transform 결과가 실제 update/create payload에 주입된다", () => {
  const raw = {
    ...observation,
    trait: `  ${observation.trait}  `,
    unexpected: "drop",
  };
  const parsed = extractPersonalityObservationUpdate({
    $addToSet: { "lore.personalityObservations": raw },
  });
  const update = withParsedPersonalityObservation(
    { $addToSet: { "lore.personalityObservations": raw } },
    parsed,
  );
  assert.equal(
    update.$addToSet["lore.personalityObservations"].trait,
    observation.trait,
  );
  assert.ok(
    !("unexpected" in update.$addToSet["lore.personalityObservations"]),
  );

  const create = withParsedInitialPersonalityObservations(
    { lore: { personalityObservations: [raw] } },
    [parsed],
  );
  assert.deepEqual(create.lore.personalityObservations, [parsed]);
  assert.throws(() =>
    withParsedInitialPersonalityObservations(
      {
        lore: { personalityObservations: [raw] },
        "lore.personalityObservations.0.confidence": "candidate",
      },
      [parsed],
    ),
  );
  assert.throws(() =>
    withParsedInitialPersonalityObservations(
      {
        lore: {
          personalityObservations: [raw],
          "personalityObservations.0.confidence": "candidate",
        },
      },
      [parsed],
    ),
  );
});

test("일반 character payload는 lore root를 교체하지 않고 기존 관찰을 보존한다", () => {
  const setPayload = toProtectedCharacterSetPayload({
    codename: "RODION",
    lore: { name: "로드리온", personality: "강압적" },
  });
  assert.equal("lore" in setPayload, false);
  assert.equal(setPayload["lore.name"], "로드리온");
  assert.equal(setPayload["lore.personality"], "강압적");
  assert.equal("lore.personalityObservations" in setPayload, false);
  assert.throws(() =>
    toProtectedCharacterSetPayload({
      lore: { personalityObservations: [observation] },
    }),
  );
  assert.throws(() =>
    toProtectedCharacterSetPayload({
      "lore.personalityObservations": [observation],
    }),
  );
  assert.throws(() =>
    toProtectedCharacterSetPayload({
      "lore.personalityObservations.0.confidence": "candidate",
    }),
  );
  assert.throws(() =>
    toProtectedCharacterSetPayload({
      lore: { "personalityObservations.0.confidence": "candidate" },
    }),
  );
  for (const invalidLore of [null, [], "replace"]) {
    assert.throws(() =>
      toProtectedCharacterSetPayload({ lore: invalidLore }),
    );
  }
});

test("동일 ID 재실행은 no-op이고 내용 변경 및 대소문자 변형은 충돌한다", () => {
  assert.equal(
    classifyPersonalityObservationWrite(
      { lore: { personalityObservations: [observation] } },
      observation,
    ),
    "unchanged",
  );
  assert.throws(() =>
    classifyPersonalityObservationWrite(
      { lore: { personalityObservations: [observation] } },
      { ...observation, summary: "변조" },
    ),
  );
  assert.throws(() =>
    classifyPersonalityObservationWrite(
      { lore: { personalityObservations: [observation] } },
      { ...observation, id: observation.id.toLowerCase(), summary: "변조" },
    ),
  );
});

test("신규 ID는 append이고 CAS 필터는 case-insensitive ID 부재를 요구한다", () => {
  const next = { ...observation, id: "NOSB-S1E5:RODION:restraint" };
  assert.equal(
    classifyPersonalityObservationWrite(
      { lore: { personalityObservations: [observation] } },
      next,
    ),
    "append",
  );
  const guard = withPersonalityObservationGuard({ codename: "RODION" }, next.id);
  assert.deepEqual(guard.$and[0], { codename: "RODION" });
  assert.equal(
    guard.$and[1]["lore.personalityObservations"].$not.$elemMatch.id.$options,
    "i",
  );
});

test("최초 create 배열도 candidate와 case-insensitive 중복 ID를 거부한다", () => {
  assert.deepEqual(
    validateInitialPersonalityObservations({
      lore: { personalityObservations: [observation] },
    }),
    [observation],
  );
  assert.throws(() =>
    validateInitialPersonalityObservations({
      lore: {
        personalityObservations: [
          observation,
          { ...observation, id: observation.id.toLowerCase() },
        ],
      },
    }),
  );
});

test("동시 동일 append는 재조회 후 idempotent no-op으로 수렴한다", async () => {
  let readCount = 0;
  const collection = {
    findOne: async () => {
      readCount += 1;
      return readCount === 1
        ? { _id: "character-1", lore: { personalityObservations: [] } }
        : {
            _id: "character-1",
            lore: { personalityObservations: [observation] },
          };
    },
    updateOne: async () => ({ matchedCount: 0 }),
  };
  const result = await appendPersonalityObservation(
    collection,
    { codename: "RODION" },
    { $addToSet: { "lore.personalityObservations": observation } },
    observation,
  );
  assert.deepEqual(result, { status: "unchanged", id: "character-1" });
  assert.equal(readCount, 2);
});

test("동시 동일 ID의 다른 내용은 충돌로 중단한다", async () => {
  let readCount = 0;
  const collection = {
    findOne: async () => {
      readCount += 1;
      return readCount === 1
        ? { _id: "character-1", lore: { personalityObservations: [] } }
        : {
            _id: "character-1",
            lore: {
              personalityObservations: [
                { ...observation, summary: "다른 동시 기록" },
              ],
            },
          };
    },
    updateOne: async () => ({ matchedCount: 0 }),
  };
  await assert.rejects(() =>
    appendPersonalityObservation(
      collection,
      { codename: "RODION" },
      { $addToSet: { "lore.personalityObservations": observation } },
      observation,
    ),
  );
});
