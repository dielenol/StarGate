import assert from "node:assert/strict";
import test from "node:test";

process.env.DISCORD_TOKEN ??= "test-token";
process.env.DISCORD_CLIENT_ID ??= "test-client";
process.env.MONGODB_URI ??= "mongodb://127.0.0.1:27017/test";

const { createCloseCheckerTickRunner } = await import(
  "../src/scheduler/close-checker.js"
);

function nextTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

test("진행 중인 close-checker tick은 겹쳐 실행하지 않는다", async () => {
  let callCount = 0;
  let finishFirst: (() => void) | undefined;
  const firstTick = new Promise<void>((resolve) => {
    finishFirst = resolve;
  });

  const runner = createCloseCheckerTickRunner(
    async () => {
      callCount += 1;
      if (callCount === 1) await firstTick;
    },
    () => {
      assert.fail("tick should not fail");
    }
  );

  runner();
  runner();
  assert.equal(callCount, 1);

  finishFirst?.();
  await nextTurn();
  runner();
  await nextTurn();
  assert.equal(callCount, 2);
});

test("실패한 tick이 끝난 뒤 mutex가 해제된다", async () => {
  let callCount = 0;
  let errorCount = 0;
  const runner = createCloseCheckerTickRunner(
    async () => {
      callCount += 1;
      if (callCount === 1) throw new Error("expected");
    },
    () => {
      errorCount += 1;
    }
  );

  runner();
  await nextTurn();
  runner();
  await nextTurn();

  assert.equal(callCount, 2);
  assert.equal(errorCount, 1);
});
