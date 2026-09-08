import assert from "node:assert/strict";
import test from "node:test";

const TEST_URI = process.env.MONGODB_TEST_URI?.trim();
const HAS_DB = process.env.RUN_DB_INTEGRATION_TESTS === "1" && Boolean(TEST_URI);

test("즉시 공개 공시를 공개 시각 순으로 제한 이전에 정렬하고 미공개 상태는 숨긴다", {
  skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI 필요",
}, async (t) => {
  const { getClient, getDb, initServerless, listStockDisclosures } =
    await import("../../../dist/index.js");
  initServerless({ uri: TEST_URI, dbName: `stargate-disclosure-ordering-${process.pid}` });
  const db = await getDb();
  const client = await getClient();
  t.after(async () => {
    await db.dropDatabase();
    await client.close();
  });
  const oldAt = new Date("2026-09-01T14:00:00Z");
  const now = new Date("2026-09-08T09:00:03.446Z");
  const future = new Date("2026-09-09T09:00:00Z");
  const base = {
    kind: "PRICE", source: "GM", title: "공시", body: "내용",
    effects: [{ scope: "TICKER", ticker: "TWS", changePercent: -45, structural: true }],
    createdById: "test", status: "PUBLISHED", createdAt: oldAt, updatedAt: oldAt,
  };
  const shutdown = {
    ...base, _id: "stock-market-shutdown:novex", title: "파리 사태로 인한 쇼크",
    publishedAt: now, createdAt: now, updatedAt: now,
    imageUrl: "https://www.ordonet.co.kr/assets/world-view/us-national-defense-act-market-shutdown-news.webp",
  };
  await db.collection("stock_disclosures").insertMany([
    ...Array.from({ length: 110 }, (_, i) => ({ ...base, _id: `old-${i}`, publishAt: oldAt })),
    shutdown,
    { ...base, _id: "created-only", createdAt: new Date(now.getTime() - 1_000) },
    { ...base, _id: "null-schedule", publishAt: null, publishedAt: new Date(now.getTime() - 2_000) },
    { ...base, _id: "scheduled", status: "SCHEDULED", publishAt: future },
    { ...base, _id: "draft", status: "DRAFT", createdAt: future },
    { ...base, _id: "cancelled", status: "CANCELLED", publishAt: future },
  ]);

  const top = await listStockDisclosures({ now, publicOnly: true, limit: 1 });
  assert.deepEqual(top, [shutdown]);
  const page = await listStockDisclosures({ now, publicOnly: true, limit: 8 });
  assert.equal(page.length, 8);
  assert.deepEqual(page.slice(0, 3).map((row) => row._id), [
    shutdown._id, "created-only", "null-schedule",
  ]);
  assert.ok(page.every((row) => row.status === "PUBLISHED" && !("effectivePublishAt" in row)));
  assert.equal((await listStockDisclosures({ now, publicOnly: true }))[0]._id, shutdown._id);
  const scheduledPage = await listStockDisclosures({ now, limit: 2 });
  assert.deepEqual(scheduledPage.map((row) => row._id), ["scheduled", shutdown._id]);
  const adminPage = await listStockDisclosures({ now, includeDrafts: true, limit: 500 });
  assert.equal(adminPage.length, 116);
  assert.deepEqual(new Set(adminPage.map((row) => row.status)),
    new Set(["DRAFT", "SCHEDULED", "PUBLISHED", "CANCELLED"]));
  const publicWins = await listStockDisclosures({ now, publicOnly: true, includeDrafts: true });
  assert.ok(publicWins.every((row) => row.status === "PUBLISHED"));
});
