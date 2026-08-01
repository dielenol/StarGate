import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const WEB_ROOT = new URL("../../../", import.meta.url);
const REPO_ROOT = new URL("../../../../", import.meta.url);

async function readWeb(relativePath) {
  return readFile(new URL(relativePath, WEB_ROOT), "utf8");
}

test("checkout은 활성 14일 창의 소다 판매량을 결제 transaction에 함께 기록한다", async () => {
  const [checkout, wrapper, database] = await Promise.all([
    readWeb("app/api/erp/shop/checkout/route.ts"),
    readWeb("lib/db/mrbeast-soda-stock-impact.ts"),
    readFile(
      new URL("packages/shared-db/src/crud/stock-promotions.ts", REPO_ROOT),
      "utf8",
    ),
  ]);

  assert.match(checkout, /resolveMrBeastSodaStockImpactWindow/);
  assert.match(checkout, /isMrBeastSodaStockImpactPurchaseEligible/);
  const prepareIndex = checkout.indexOf(
    "prepareMrBeastSodaStockImpactDemand(sodaStockImpactKey)",
  );
  const operationIndex = checkout.indexOf("executeEconomicOperation({");
  const incrementIndex = checkout.indexOf(
    "incrementMrBeastSodaStockImpactDemand({",
  );
  const stockIndex = checkout.indexOf("reduceStock(");
  assert.ok(prepareIndex >= 0 && prepareIndex < operationIndex);
  assert.ok(incrementIndex > operationIndex && incrementIndex < stockIndex);
  assert.match(
    checkout.slice(incrementIndex, stockIndex),
    /quantity: sodaDailyPurchaseQuantity[\s\S]*session: mongoSession/,
  );
  assert.match(checkout, /lotteryEventUnchanged/);
  assert.match(checkout, /err instanceof MrBeastSodaStockImpactDemandError/);
  assert.match(wrapper, /from "@stargate\/shared-db"/);
  assert.match(database, /\$inc: \{ soldQuantity: input\.quantity \}/);
  assert.match(database, /session: input\.session/);
});

test("STM 정기 tick은 미적용 판매량을 같은 transaction에서 한 번만 소비한다", async () => {
  const [tick, stocks, database] = await Promise.all([
    readFile(
      new URL("packages/core/src/operations/stocks-tick.ts", REPO_ROOT),
      "utf8",
    ),
    readFile(
      new URL("packages/shared-db/src/crud/stocks.ts", REPO_ROOT),
      "utf8",
    ),
    readFile(
      new URL("packages/shared-db/src/crud/stock-promotions.ts", REPO_ROOT),
      "utf8",
    ),
  ]);

  assert.match(
    tick,
    /meta\.ticker === MRBEAST_SODA_STOCK_IMPACT_TICKER[\s\S]*consumeStockImpact\([\s\S]*operationKey[\s\S]*session/,
  );
  assert.match(tick, /calculateMrBeastSodaStockImpactPercent/);
  assert.match(tick, /stockImpactPercent \* 100/);
  assert.match(
    stocks,
    /existingHistory[\s\S]*loadContext\(session\)[\s\S]*input\.calculate\(current, context\)[\s\S]*history\.insertOne/,
  );
  assert.doesNotMatch(stocks, /requireExisting/);
  assert.match(
    database,
    /\$expr: \{ \$gt: \["\$soldQuantity", "\$appliedQuantity"\] \}/,
  );
  assert.match(database, /appliedQuantity: demand\.soldQuantity/);
  assert.match(database, /lastAppliedOperationKey: input\.operationKey/);
  assert.doesNotMatch(database, /FINAL_TICK_GRACE|endAt: \{/);
  assert.doesNotMatch(database, /updateStockPrice\(/);
});

test("기존 판매량 backfill은 tick을 잠그고 경계·버전·DB를 fail-closed 검증한다", async () => {
  const script = await readWeb(
    "scripts/backfill-mrbeast-soda-stock-impact.ts",
  );

  assert.match(script, /const execute = args\.has\("--execute"\)/);
  assert.match(script, /args\.has\("--tick-paused"\)/);
  assert.match(script, /DB_NAME과 MONGODB_DB_NAME이 일치/);
  assert.match(script, /MRBEAST_SODA_STOCK_IMPACT_TICK_ENABLED/);
  assert.match(script, /startBoundaryCount/);
  assert.match(script, /endBoundaryCount/);
  assert.match(script, /upperBoundaryCount/);
  assert.match(script, /기간이 겹치는 다른 이벤트 또는 config version demand/);
  assert.match(script, /session\.withTransaction/);
  assert.match(script, /verified\.soldQuantity !== appliedPlan\.quantity/);
  assert.doesNotMatch(script, /deleteMany|dropDatabase/);
});
