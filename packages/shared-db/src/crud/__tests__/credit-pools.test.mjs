import assert from "node:assert/strict";
import test from "node:test";

const testApi = await import("node:test");
const HAS_MODULE_MOCK =
  testApi.mock && typeof testApi.mock.module === "function";

if (!HAS_MODULE_MOCK) {
  test("credit pool revision mock 테스트 — module mock 미지원", { skip: true }, () => {});
} else {
  const calls = [];
  let nextResult = null;
  let currentResult = null;

  const fakeCollection = {
    async findOneAndUpdate(filter, update, options) {
      calls.push({ filter, update, options });
      return nextResult;
    },
    async findOne() {
      return currentResult;
    },
  };

  testApi.mock.module(
    new URL("../../../dist/collections.js", import.meta.url).href,
    {
      namedExports: {
        creditPoolsCol: async () => fakeCollection,
      },
    },
  );

  const {
    CreditPoolVersionConflictError,
    addCreditPoolBalance,
    ensureCreditPool,
    setCreditPoolBalance,
  } = await import("../../../dist/crud/credit-pools.js");

  function resetState() {
    calls.length = 0;
    nextResult = {
      poolId: "OPERATION",
      name: "작전 크레딧 풀",
      balance: 400,
      revision: 0,
      createdAt: new Date("2026-08-09T00:00:00.000Z"),
      updatedAt: new Date("2026-08-09T00:00:00.000Z"),
    };
    currentResult = nextResult;
  }

  test("ensureCreditPool은 find/insert 경합 없이 atomic upsert한다", async () => {
    resetState();
    const session = { id: "ensure-session" };

    await ensureCreditPool("OPERATION", "작전 크레딧 풀", 400, { session });

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].filter, { poolId: "OPERATION" });
    assert.equal(calls[0].update.$setOnInsert.revision, 0);
    assert.equal(calls[0].update.$setOnInsert.balance, 400);
    assert.equal(calls[0].options.upsert, true);
    assert.equal(calls[0].options.returnDocument, "after");
    assert.equal(calls[0].options.session, session);
  });

  test("증감은 balance와 revision을 같은 atomic update에서 올린다", async () => {
    resetState();
    const session = { id: "adjust-session" };

    await addCreditPoolBalance("OPERATION", -25, { session });

    assert.deepEqual(calls[0].filter, {
      poolId: "OPERATION",
      balance: { $gte: 25 },
    });
    assert.deepEqual(calls[0].update.$inc, { balance: -25, revision: 1 });
    assert.equal(calls[0].options.session, session);
  });

  test("legacy revision 0 set은 필드 부재 문서까지 CAS하고 revision을 올린다", async () => {
    resetState();

    await setCreditPoolBalance("OPERATION", 350, { expectedRevision: 0 });

    assert.deepEqual(calls[0].filter, {
      poolId: "OPERATION",
      $or: [{ revision: 0 }, { revision: { $exists: false } }],
    });
    assert.equal(calls[0].update.$set.balance, 350);
    assert.deepEqual(calls[0].update.$inc, { revision: 1 });
  });

  test("revision이 바뀐 absolute set은 명시적 충돌로 실패한다", async () => {
    resetState();
    nextResult = null;
    currentResult = { _id: "existing-pool", revision: 8 };

    await assert.rejects(
      setCreditPoolBalance("OPERATION", 300, { expectedRevision: 7 }),
      (error) => error instanceof CreditPoolVersionConflictError,
    );

    assert.deepEqual(calls[0].filter, {
      poolId: "OPERATION",
      revision: 7,
    });
  });
}
