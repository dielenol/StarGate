import assert from "node:assert/strict";
import test from "node:test";

import { createStockMarketRecoveryOutboxHandler } from "../dist/outbox/stock-market-recovery-handler.js";

function recoveryEvent(slotKey) {
  return {
    kind: "STOCK_MARKET_RECOVERY_REQUEST",
    dedupeKey: `recovery:${slotKey}`,
    version: 1,
    payload: { slotKey },
    status: "PROCESSING",
    attempts: 1,
    availableAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

test("durable 복구 요청은 worker가 회차 확정 뒤 허용된 종가 wire만 요청한다", async () => {
  const applied = [];
  const wires = [];
  const handler = createStockMarketRecoveryOutboxHandler({
    mode: () => "enabled",
    now: () => new Date("2026-08-24T23:10:00+09:00"),
    async applyTick(input) {
      applied.push(input);
      return {
        date: "2026-08-24",
        slot: input.slotKey,
        results: [],
        skipDiscord: false,
      };
    },
    async requestWire(summary, now) {
      wires.push({ summary, now });
      return true;
    },
  });

  assert.deepEqual(
    await handler.deliver(recoveryEvent("2026-08-24 23:00")),
    { outcome: "SENT" },
  );
  assert.equal(applied.length, 1);
  assert.equal(wires.length, 1);
});

test("다음 09시 이후 복구된 종가는 Discord 브리핑을 만들지 않는다", async () => {
  let wireRequests = 0;
  const handler = createStockMarketRecoveryOutboxHandler({
    mode: () => "enabled",
    now: () => new Date("2026-08-25T09:00:00+09:00"),
    async applyTick(input) {
      return {
        date: "2026-08-24",
        slot: input.slotKey,
        results: [],
        skipDiscord: true,
      };
    },
    async requestWire() {
      wireRequests += 1;
      return true;
    },
  });

  await handler.deliver(recoveryEvent("2026-08-24 23:00"));
  assert.equal(wireRequests, 0);
});
