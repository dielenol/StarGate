import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const STOCKS = new URL("../stocks.ts", import.meta.url);
const SHOP = new URL("../shop.ts", import.meta.url);
const NOTIFICATIONS = new URL("../notifications.ts", import.meta.url);
const INDEXES = new URL("../../indexes.ts", import.meta.url);

test("scheduled stock mutation wraps price and history in one transaction", async () => {
  const source = await readFile(STOCKS, "utf8");
  assert.match(source, /session\.withTransaction/);
  assert.match(source, /operationKey: input\.operationKey/);
  assert.match(source, /prices\.findOneAndUpdate\([\s\S]*history\.insertOne/);
  assert.match(source, /history\.findOne\([\s\S]*input\.operationKey/);
});

test("shop refresh uses item/date conditional update and unique-race fallback", async () => {
  const source = await readFile(SHOP, "utf8");
  // 날짜 단조성(96ad1a22): `$ne` 대신 과거/미존재 슬롯만 갱신해 오래된 worker 슬롯이
  // 최신 재고를 되돌리지 못하게 한다.
  assert.match(source, /\{ lastRefresh: \{ \$lt: todayKst \} \}/);
  assert.match(source, /\{ lastRefresh: \{ \$exists: false \} \}/);
  assert.match(source, /insertOne\(\{ itemId, stock, lastRefresh: todayKst \}\)/);
  assert.match(source, /error\.code === 11_000/);
});

test("notification and scheduled stock idempotency indexes are partial unique", async () => {
  const [notifications, indexes] = await Promise.all([
    readFile(NOTIFICATIONS, "utf8"),
    readFile(INDEXES, "utf8"),
  ]);
  assert.match(notifications, /createNotificationOnce/);
  assert.match(notifications, /\.project<Notification>\(\{ dedupeKey: 0 \}\)/);
  assert.match(indexes, /notifications_dedupeKey_partial_unique/);
  assert.match(indexes, /stock_price_history_operationKey_partial_unique/);
  assert.match(
    indexes,
    /partialFilterExpression: \{ dedupeKey: \{ \$type: "string" \} \}/,
  );
  assert.match(
    indexes,
    /partialFilterExpression: \{ operationKey: \{ \$type: "string" \} \}/,
  );
});
