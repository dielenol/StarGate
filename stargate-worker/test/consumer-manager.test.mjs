import assert from "node:assert/strict";
import test from "node:test";

import { ConsumerManager } from "../dist/consumers/manager.js";

async function waitFor(predicate, timeoutMs = 500) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error("조건 대기 시간이 초과됐습니다.");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test("consumer 일시 오류는 readiness를 내리고 다음 poll 성공 때 복구한다", async () => {
  let attempts = 0;
  const readiness = [];
  const errors = [];
  const manager = new ConsumerManager(
    "active",
    5,
    [
      {
        name: "recovering-consumer",
        async tick() {
          attempts += 1;
          if (attempts === 1) throw new Error("temporary");
          return { observedDue: 0 };
        },
      },
    ],
    {
      info() {},
      warn() {},
      error(_event, error) {
        errors.push(error);
      },
    },
    (ready) => readiness.push(ready),
  );

  await manager.start();
  assert.equal(manager.isReady(), false);
  await waitFor(() => manager.isReady());
  assert.equal(errors.length, 1);
  assert.deepEqual(readiness, [true]);

  await manager.stop();
  assert.equal(manager.isReady(), false);
  assert.deepEqual(readiness, [true, false]);
});

test("consumer throw도 운영 알림에 실패와 복구로 전달한다", async () => {
  let attempts = 0;
  const observations = [];
  const manager = new ConsumerManager(
    "active",
    5,
    [
      {
        name: "alerted-consumer",
        async tick() {
          attempts += 1;
          if (attempts === 1) throw new Error("temporary");
          return { observedDue: 0 };
        },
      },
    ],
    { info() {}, warn() {}, error() {} },
    undefined,
    {
      async observe(consumer, result) {
        observations.push({ consumer, result });
      },
    },
  );

  await manager.start();
  await waitFor(() => observations.length >= 2);
  assert.equal(observations[0].consumer, "alerted-consumer");
  assert.equal(observations[0].result.failed, 1);
  assert.equal(observations[1].result.observedDue, 0);
  assert.equal(observations[1].result.operationalRecovery, true);
  await manager.stop();
});
