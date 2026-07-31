/**
 * Validator 검증 — S5-3 createNotificationsBulk (Phase 1 성능 최적화)
 *
 * 검증 대상: src/crud/notifications.ts:createNotificationsBulk (dist 실행)
 *
 * 시나리오:
 *   N-1: 빈 배열 → 0 조기 반환 (collection 접근 없음)
 *   N-2: happy path — insertMany 1회, ordered:false, doc shape 가
 *        createNotification 과 동일 ({...input, isRead:false, createdAt:Date})
 *   N-3: MongoBulkWriteError(부분 실패) 흡수 — 성공 건수 반환 + throw 없음
 *   N-4: 비-bulk 에러(연결 실패 등)는 호출자에게 전파
 *   N-5: writeErrors 가 단일 객체(OneOrMore)여도 안전
 *
 * DB 미사용 — collections.js 를 mock.module 로 대체 (upsert-race/update-character 선례).
 * MongoBulkWriteError 는 프로토타입 재구성으로 instanceof + getter 경로를 재현한다
 * (실 드라이버 BulkWriteResult 조립 없이 흡수 분기 로직만 검증).
 *
 * 실행:
 *   cd packages/shared-db && npm run build &&
 *   node --test --experimental-test-module-mocks src/crud/__tests__/notifications-bulk.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { MongoBulkWriteError, ObjectId } from "mongodb";

const testApi = await import("node:test");

/* ── fake collection ── */

const state = {
  insertManyCalls: [],
  insertOneCalls: [],
  colAccessCount: 0,
  insertManyImpl: null,
};

const fakeCol = {
  insertMany: async (docs, options) => {
    state.insertManyCalls.push({ docs, options });
    if (state.insertManyImpl) return state.insertManyImpl(docs, options);
    return {
      acknowledged: true,
      insertedCount: docs.length,
      insertedIds: Object.fromEntries(
        docs.map((_, i) => [i, new ObjectId()]),
      ),
    };
  },
  insertOne: async (doc) => {
    state.insertOneCalls.push(doc);
    return { acknowledged: true, insertedId: new ObjectId() };
  },
};

testApi.mock.module(
  new URL("../../../dist/collections.js", import.meta.url).href,
  {
    namedExports: {
      notificationsCol: async () => {
        state.colAccessCount += 1;
        return fakeCol;
      },
    },
  },
);

const { createNotification, createNotificationsBulk } = await import(
  "../../../dist/crud/notifications.js"
);

function resetState() {
  state.insertManyCalls = [];
  state.insertOneCalls = [];
  state.colAccessCount = 0;
  state.insertManyImpl = null;
}

function makeBulkWriteError({ insertedCount, writeErrors }) {
  const err = Object.create(MongoBulkWriteError.prototype);
  err.message = "E11000 duplicate key error (dedupeKey partial unique)";
  err.result = { insertedCount };
  err.writeErrors = writeErrors;
  return err;
}

const INPUTS = [
  { userId: "u1", type: "SYSTEM", title: "t1", message: "m1" },
  { userId: "u2", type: "SYSTEM", title: "t2", message: "m2", link: "/erp" },
  { userId: "u3", type: "CREDIT", title: "t3", message: "m3" },
];

test("N-1: 빈 배열 → 0 조기 반환, collection 미접근", async () => {
  resetState();
  const inserted = await createNotificationsBulk([]);
  assert.equal(inserted, 0);
  assert.equal(state.colAccessCount, 0, "빈 입력에서 DB 왕복이 없어야 함");
  assert.equal(state.insertManyCalls.length, 0);
});

test("N-2: happy path — insertMany 1회 + ordered:false + doc shape 동일", async () => {
  resetState();
  const inserted = await createNotificationsBulk(INPUTS);
  assert.equal(inserted, INPUTS.length);
  assert.equal(state.insertManyCalls.length, 1, "단일 insertMany 왕복");
  const { docs, options } = state.insertManyCalls[0];
  assert.equal(options?.ordered, false, "ordered:false 로 개별 실패 격리");
  assert.equal(docs.length, INPUTS.length);

  // doc shape — createNotification 과 동일해야 함
  await createNotification(INPUTS[0]);
  const singleDoc = state.insertOneCalls[0];
  const bulkDoc = docs[0];

  const normalize = (doc) => {
    const { _id, createdAt, ...rest } = doc;
    return {
      ...rest,
      createdAtIsDate: createdAt instanceof Date,
    };
  };
  assert.deepEqual(
    normalize(bulkDoc),
    normalize(singleDoc),
    "bulk 와 단건의 doc shape 불일치 (isRead/createdAt 포함)",
  );
  assert.equal(bulkDoc.isRead, false);
  for (const doc of docs) {
    assert.ok(doc.createdAt instanceof Date);
    assert.equal(doc.isRead, false);
  }
  // 입력 필드 보존 (link 등 optional 포함)
  assert.equal(docs[1].link, "/erp");
});

test("N-3: MongoBulkWriteError 부분 실패 흡수 — 성공 건수 반환", async () => {
  resetState();
  state.insertManyImpl = () => {
    throw makeBulkWriteError({
      insertedCount: 2,
      writeErrors: [{ index: 1, code: 11000 }],
    });
  };
  const inserted = await createNotificationsBulk(INPUTS);
  assert.equal(inserted, 2, "부분 실패 시 실제 성공 건수 반환");
});

test("N-3-bis: insertedCount 부재(비정형 result) → 0 폴백", async () => {
  resetState();
  state.insertManyImpl = () => {
    throw makeBulkWriteError({
      insertedCount: undefined,
      writeErrors: [{ index: 0, code: 11000 }],
    });
  };
  const inserted = await createNotificationsBulk(INPUTS);
  assert.equal(inserted, 0);
});

test("N-4: 비-bulk 에러는 전파 (연결 실패 등)", async () => {
  resetState();
  state.insertManyImpl = () => {
    throw new Error("ECONNRESET: pool destroyed");
  };
  await assert.rejects(
    createNotificationsBulk(INPUTS),
    /ECONNRESET/,
    "MongoBulkWriteError 외 에러는 흡수하면 안 됨",
  );
});

test("N-5: writeErrors 단일 객체(OneOrMore)여도 안전", async () => {
  resetState();
  state.insertManyImpl = () => {
    throw makeBulkWriteError({
      insertedCount: 1,
      writeErrors: { index: 2, code: 11000 }, // 배열 아님
    });
  };
  const inserted = await createNotificationsBulk(INPUTS);
  assert.equal(inserted, 1);
});
