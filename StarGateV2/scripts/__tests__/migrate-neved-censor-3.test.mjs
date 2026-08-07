import assert from "node:assert/strict";
import test from "node:test";

import {
  assertNevedCensorMigrationPlanUnchanged,
  parseMigrationMode,
  planNevedCensorMigration,
  verifyAppliedNevedCensorMigration,
} from "../migrate-neved-censor-3.ts";

const id = (value) => ({ toString: () => value });

function readyState(overrides = {}) {
  return {
    operation: null,
    characters: [
      { _id: id("character-neved"), codename: "네베드", type: "AGENT" },
    ],
    masters: [
      {
        _id: id("item-broken"),
        slug: "broken-syllable",
        name: "깨진 음절",
        category: "MATERIAL",
      },
      {
        _id: id("item-censor"),
        code: "ZULU_0028_CENSOR_3",
        slug: "zulu-0028-censor-3",
        name: "ZULU-0028 파쇄음절탄 「CENSOR-3」",
        category: "CONSUMABLE",
        isAvailable: false,
        isPublic: false,
      },
    ],
    sharedRows: [
      {
        _id: id("shared-broken"),
        scope: "GLOBAL",
        itemId: "item-broken",
        itemName: "깨진 음절",
        quantity: 3,
      },
    ],
    targetRows: [],
    ...overrides,
  };
}

test("CENSOR-3 레거시 migration은 진단 전용이며 직접 쓰기를 거부한다", () => {
  assert.deepEqual(parseMigrationMode([]), { execute: false, dryRun: true });
  assert.deepEqual(parseMigrationMode(["--yes"]), {
    execute: false,
    dryRun: true,
  });
  assert.throws(
    () => parseMigrationMode(["--execute"]),
    /직접 변환은 폐쇄/,
  );
  assert.throws(
    () => parseMigrationMode(["--execute", "--yes"]),
    /완료품 수령 절차/,
  );
});

test("깨진 음절 3개는 네베드 CENSOR-3 3발로만 계획된다", () => {
  assert.deepEqual(planNevedCensorMigration(readyState()), {
    status: "ready",
    characterId: "character-neved",
    sourceItemId: "item-broken",
    resultItemId: "item-censor",
    sourceBefore: 3,
    sourceAfter: 0,
    resultBefore: 0,
    resultAfter: 3,
  });
});

test("재료 부족·기존 CENSOR 보유·master 누락은 추정하지 않고 차단한다", () => {
  assert.throws(
    () =>
      planNevedCensorMigration(
        readyState({
          sharedRows: [
            {
              _id: id("shared-broken"),
              scope: "GLOBAL",
              itemId: "item-broken",
              itemName: "깨진 음절",
              quantity: 2,
            },
          ],
        }),
      ),
    /3개 이상 필요/,
  );
  assert.throws(
    () => planNevedCensorMigration(readyState({ targetRows: [{}] })),
    /이미 보유/,
  );
  assert.throws(
    () =>
      planNevedCensorMigration(
        readyState({
          masters: readyState().masters.filter(
            (item) => item.slug !== "zulu-0028-censor-3",
          ),
        }),
      ),
    /seed를 먼저 적용/,
  );
});

function completedState(overrides = {}) {
  const state = readyState({
    operation: {
      _id: "neved-censor-3-manufacture-2026-08-06-v1",
      requestId: "neved-censor-3-manufacture-2026-08-06-v1",
      domain: "neved-censor-3-manufacture",
      actorId: "system:neved-censor-3-migration",
      payloadHash:
        "e12fbfab3d0efcc38d1e9a62e06b09fa76ca0fbe46298659970259bfc7d99329",
      status: "completed",
      responseStatus: 200,
      responseBody: {
        characterCodename: "네베드",
        source: { slug: "broken-syllable", consumed: 3, remaining: 0 },
        result: { slug: "zulu-0028-censor-3", granted: 3 },
      },
    },
    sharedRows: [],
    targetRows: [
      {
        _id: id("target-censor"),
        characterId: "character-neved",
        characterCodename: "네베드",
        itemId: "item-censor",
        itemName: "ZULU-0028 파쇄음절탄 「CENSOR-3」",
        quantity: 3,
      },
    ],
  });
  return { ...state, ...overrides };
}

test("완료 원장은 immutable 계약만 검증하고 이후 정상적인 재료·탄환 변동을 허용한다", () => {
  assert.deepEqual(planNevedCensorMigration(completedState()), {
    status: "replay",
    operationId: "neved-censor-3-manufacture-2026-08-06-v1",
  });
  assert.deepEqual(
    planNevedCensorMigration(
      completedState({
        sharedRows: [{ ...readyState().sharedRows[0], quantity: 7 }],
        targetRows: [
          {
            ...completedState().targetRows[0],
            quantity: 2,
          },
        ],
      }),
    ),
    {
      status: "replay",
      operationId: "neved-censor-3-manufacture-2026-08-06-v1",
    },
  );
  assert.throws(
    () =>
      planNevedCensorMigration(
        completedState({
          operation: {
            ...completedState().operation,
            responseBody: {
              ...completedState().operation.responseBody,
              result: { slug: "zulu-0028-censor-3", granted: 2 },
            },
          },
        }),
      ),
    /완료 원장의 CENSOR-3 변환 결과/,
  );
  assert.throws(
    () =>
      planNevedCensorMigration(
        readyState({
          masters: readyState().masters.map((item) =>
            item.slug === "zulu-0028-censor-3"
              ? { ...item, isPublic: true }
              : item,
          ),
        }),
      ),
    /비공개·비판매 seed 계약/,
  );
});

test("실제 실행 직후 검증은 계획된 source 잔량과 CENSOR-3 3발을 정확히 재조회한다", () => {
  const initialPlan = planNevedCensorMigration(readyState());
  assert.equal(initialPlan.status, "ready");
  assert.doesNotThrow(() =>
    verifyAppliedNevedCensorMigration(completedState(), initialPlan),
  );
  assert.throws(
    () =>
      verifyAppliedNevedCensorMigration(
        completedState({
          targetRows: [
            {
              ...completedState().targetRows[0],
              quantity: 2,
            },
          ],
        }),
        initialPlan,
      ),
    /쓰기 직후 네베드 CENSOR-3 실제 지급 수량/,
  );
});

test("dry-run 뒤 source 수량이 달라지면 transaction 쓰기 전에 중단한다", () => {
  const initialPlan = planNevedCensorMigration(readyState());
  const transactionalPlan = planNevedCensorMigration(
    readyState({
      sharedRows: [
        {
          ...readyState().sharedRows[0],
          quantity: 4,
        },
      ],
    }),
  );
  assert.equal(initialPlan.status, "ready");
  assert.equal(transactionalPlan.status, "ready");
  assert.throws(
    () =>
      assertNevedCensorMigrationPlanUnchanged(
        initialPlan,
        transactionalPlan,
      ),
    /대상 또는 수량이 dry-run 이후 변경/,
  );
});
