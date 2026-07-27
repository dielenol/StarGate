import assert from "node:assert/strict";
import test from "node:test";

import { ObjectId } from "mongodb";

import { SharedDbIntegrationOutboxConsumer } from "../dist/outbox/active-consumer.js";
import { IntegrationOutboxHandlerRegistry } from "../dist/outbox/handler-registry.js";

function event(kind, dedupeKey) {
  return {
    _id: new ObjectId(),
    kind,
    dedupeKey,
    version: 1,
    payload: {},
    status: "PROCESSING",
    attempts: 1,
    availableAt: new Date(),
    leaseToken: `${dedupeKey}-lease`,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

test("active outbox consumer는 handler 성공을 complete하고 미연결 kind를 backoff한다", async () => {
  const queue = [
    event("GM_ADMIN_AUDIT", "audit:1"),
    event("PLAYER_TRADE_DM", "trade:1"),
  ];
  const completed = [];
  const failed = [];
  const persistence = {
    async claimDue() {
      return queue.shift() ?? null;
    },
    async complete(input) {
      completed.push(input);
      return true;
    },
    async fail(input) {
      failed.push(input);
      return "PENDING";
    },
  };
  const handlers = new IntegrationOutboxHandlerRegistry([
    {
      kind: "GM_ADMIN_AUDIT",
      async deliver(outboxEvent) {
        assert.equal(outboxEvent.dedupeKey, "audit:1");
      },
    },
  ]);
  const consumer = new SharedDbIntegrationOutboxConsumer(
    persistence,
    handlers,
  );

  const result = await consumer.tick({
    mode: "active",
    signal: new AbortController().signal,
  });
  assert.deepEqual(result, {
    observedDue: 2,
    claimed: 2,
    delivered: 1,
    failed: 1,
    dead: 0,
  });
  assert.equal(completed.length, 1);
  assert.equal(failed.length, 1);
  assert.match(
    String(failed[0].error),
    /integration_outbox handler가 연결되지 않았습니다/,
  );
});

test("handler가 하나도 없으면 outbox를 claim하기 전에 active 기동을 거부한다", async () => {
  let claimed = false;
  const consumer = new SharedDbIntegrationOutboxConsumer(
    {
      async claimDue() {
        claimed = true;
        return null;
      },
      async complete() {
        return true;
      },
      async fail() {
        return "PENDING";
      },
    },
    new IntegrationOutboxHandlerRegistry(),
  );

  await assert.rejects(
    consumer.tick({
      mode: "active",
      signal: new AbortController().signal,
    }),
    /delivery handler가 없습니다/,
  );
  assert.equal(claimed, false);
});

test("알 수 없는 payload version은 외부 전달 없이 backoff한다", async () => {
  const unsupported = event("GM_ADMIN_AUDIT", "audit:v2");
  unsupported.version = 2;
  let delivered = false;
  const failed = [];
  const consumer = new SharedDbIntegrationOutboxConsumer(
    {
      async claimDue() {
        return unsupported;
      },
      async complete() {
        assert.fail("unsupported version must not complete");
      },
      async fail(input) {
        failed.push(input);
        return "PENDING";
      },
    },
    new IntegrationOutboxHandlerRegistry([
      {
        kind: "GM_ADMIN_AUDIT",
        async deliver() {
          delivered = true;
        },
      },
    ]),
    1,
  );

  await consumer.tick({
    mode: "active",
    signal: new AbortController().signal,
  });
  assert.equal(delivered, false);
  assert.equal(failed.length, 1);
  assert.match(String(failed[0].error), /payload version/);
});
