import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createMrBeastSodaDailyPurchaseKey,
  isMrBeastSodaDailyPurchaseAllowed,
  MRBEAST_SODA_DAILY_LIMIT_ERROR_CODE,
  MRBEAST_SODA_DAILY_LIMIT_ERROR_MESSAGE,
  MRBEAST_SODA_DAILY_PURCHASE_LIMIT,
} from "../mrbeast-soda-daily-limit.ts";

const WEB_ROOT = new URL("../../../", import.meta.url);

async function readWeb(relativePath) {
  return readFile(new URL(relativePath, WEB_ROOT), "utf8");
}

test("KST 자정인 UTC 15:00를 기준으로 일일 구매 key가 바뀐다", () => {
  const beforeMidnight = createMrBeastSodaDailyPurchaseKey({
    userId: "user-1",
    slug: "mrbeast_soda",
    purchasedAt: new Date("2026-07-31T14:59:59.999Z"),
  });
  const atMidnight = createMrBeastSodaDailyPurchaseKey({
    userId: "user-1",
    slug: "mrbeast_soda",
    purchasedAt: new Date("2026-07-31T15:00:00.000Z"),
  });

  assert.equal(beforeMidnight.kstDate, "2026-07-31");
  assert.equal(atMidnight.kstDate, "2026-08-01");
});

test("여러 주문 누적량이 정확히 10이면 허용하고 11이면 거절한다", () => {
  assert.equal(MRBEAST_SODA_DAILY_PURCHASE_LIMIT, 10);
  assert.equal(isMrBeastSodaDailyPurchaseAllowed(0, 9), true);
  assert.equal(isMrBeastSodaDailyPurchaseAllowed(9, 1), true);
  assert.equal(isMrBeastSodaDailyPurchaseAllowed(9, 2), false);
  assert.equal(isMrBeastSodaDailyPurchaseAllowed(10, 1), false);
  assert.equal(
    MRBEAST_SODA_DAILY_LIMIT_ERROR_CODE,
    "MRBEAST_SODA_DAILY_LIMIT_EXCEEDED",
  );
  assert.match(MRBEAST_SODA_DAILY_LIMIT_ERROR_MESSAGE, /하루 최대 10개/);
});

test("checkout은 로그인 user의 counter를 준비하고 transaction 안에서 결제보다 먼저 증가한다", async () => {
  const [route, database] = await Promise.all([
    readWeb("app/api/erp/shop/checkout/route.ts"),
    readWeb("lib/db/mrbeast-soda-daily-limit.ts"),
  ]);

  assert.match(
    route,
    /createMrBeastSodaDailyPurchaseKey\(\{[\s\S]*userId: session\.user\.id[\s\S]*slug: MRBEAST_SODA_SLUG/,
  );
  const prepareIndex = route.indexOf(
    "prepareMrBeastSodaDailyPurchaseCounter(sodaDailyPurchaseKey)",
  );
  const operationIndex = route.indexOf("executeEconomicOperation({");
  const incrementIndex = route.indexOf(
    "incrementMrBeastSodaDailyPurchaseCounter({",
  );
  const stockIndex = route.indexOf("reduceStock(");
  assert.ok(prepareIndex >= 0 && prepareIndex < operationIndex);
  assert.ok(
    incrementIndex > operationIndex && incrementIndex < stockIndex,
    "counter increment는 checkout transaction 안에서 재고 차감보다 먼저 실행해야 한다",
  );
  assert.match(
    route.slice(incrementIndex, stockIndex),
    /session: mongoSession/,
  );
  assert.match(route, /err instanceof MrBeastSodaDailyLimitError/);
  assert.match(route, /code: err\.code/);

  assert.match(database, /shop_daily_purchase_counters/);
  assert.match(database, /shop-daily-purchase:/);
  assert.match(database, /\$setOnInsert:/);
  assert.match(
    database,
    /purchasedQuantity: \{ \$gte: 0, \$lte: remainingBeforePurchase \}/,
  );
  assert.match(database, /\$inc: \{ purchasedQuantity: input\.quantity \}/);
  assert.match(database, /\{ session: input\.session \}/);
  assert.doesNotMatch(database, /\.createIndex(?:es)?\(/);
});
