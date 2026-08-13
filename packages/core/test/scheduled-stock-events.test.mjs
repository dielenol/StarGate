import assert from "node:assert/strict";
import test from "node:test";

import { findScheduledStockMarketEvent } from "../dist/domain/stock-events.js";

test("STM 식약처 적발 이벤트는 2026-08-14 정기 틱에만 예약된다", () => {
  assert.deepEqual(
    findScheduledStockMarketEvent(
      "2026-08-14",
      "STM",
      new Date("2026-08-14T03:00:00.000Z"),
    ),
    {
      date: "2026-08-14",
      executeAt: new Date("2026-08-14T03:00:00.000Z"),
      ticker: "STM",
      priceMultiplier: 0.5,
      tier: "shock",
      text: "노부스오르도 감사팀·미국 식약청, 미스터비스트 소다 함량 미달·불법 원료 적발",
    },
  );
  assert.equal(
    findScheduledStockMarketEvent(
      "2026-08-14",
      "STM",
      new Date("2026-08-14T02:59:59.999Z"),
    ),
    undefined,
  );
  assert.equal(
    findScheduledStockMarketEvent(
      "2026-08-13",
      "STM",
      new Date("2026-08-14T03:00:00.000Z"),
    ),
    undefined,
  );
  assert.equal(
    findScheduledStockMarketEvent(
      "2026-08-15",
      "STM",
      new Date("2026-08-15T03:00:00.000Z"),
    ),
    undefined,
  );
  assert.equal(
    findScheduledStockMarketEvent(
      "2026-08-14",
      "TWS",
      new Date("2026-08-14T03:00:00.000Z"),
    ),
    undefined,
  );
});
