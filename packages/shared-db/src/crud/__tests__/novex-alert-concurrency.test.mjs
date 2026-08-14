import assert from "node:assert/strict";
import test from "node:test";

const TEST_URI = process.env.MONGODB_TEST_URI?.trim();
const HAS_DB = process.env.RUN_DB_INTEGRATION_TESTS === "1" && Boolean(TEST_URI);
const TEST_DB_NAME = `stargate-novex-alert-concurrency-${process.pid}`;

test("설정 저장과 INFO 공시 알림 경쟁은 설정 state와 dedupe 알림을 모두 보존한다", {
  skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI replica-set 필요",
}, async (t) => {
  const {
    close,
    createStockDisclosure,
    createStockCorporateAction,
    getClient,
    getDb,
    getStockMarketPreference,
    getLatestStockClosingPrice,
    initServerless,
    upsertStockMarketPreference,
    updateStockDisclosure,
  } = await import("../../../dist/index.js");
  initServerless({ uri: TEST_URI, dbName: TEST_DB_NAME });
  const db = await getDb();
  const client = await getClient();
  await db.collection("notifications").createIndex(
    { dedupeKey: 1 },
    { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } },
  );
  await db.collection("stock_prices").insertOne({
    ticker: "NVS",
    price: 130,
    prevPrice: 120,
    eventText: "intraday",
    lastUpdate: "2026-08-14 18:00",
  });
  await db.collection("stock_price_history").insertMany([
    { ticker: "NVS", price: 100, prevPrice: 99, source: "scheduled", slotKey: "2026-08-13 23:00", createdAt: new Date("2026-08-13T14:00:00Z") },
    { ticker: "NVS", price: 130, prevPrice: 120, source: "scheduled", slotKey: "2026-08-14 18:00", createdAt: new Date("2026-08-14T09:00:00Z") },
  ]);
  const closingSession = client.startSession();
  try {
    await closingSession.withTransaction(async () => {
      assert.equal((await getLatestStockClosingPrice("NVS", {
        before: new Date("2026-08-14T10:00:00Z"),
        session: closingSession,
      })).price, 100);
      await assert.rejects(
        createStockCorporateAction({
          _id: "dividend-over-cap",
          type: "DIVIDEND",
          ticker: "NVS",
          amountPerShare: 25.01,
          recordSlotKey: "2099-08-15 23:00",
          exDateSlotKey: "2099-08-16 09:00",
          status: "SCHEDULED",
          createdById: "gm",
          createdAt: new Date("2026-08-14T10:00:00Z"),
          updatedAt: new Date("2026-08-14T10:00:00Z"),
        }, closingSession),
        /exceeds 25%/,
      );
      const baseAction = {
        type: "DIVIDEND",
        ticker: "NVS",
        amountPerShare: 25,
        recordSlotKey: "2099-08-15 23:00",
        exDateSlotKey: "2099-08-16 09:00",
        status: "SCHEDULED",
        createdById: "gm",
        createdAt: new Date("2026-08-14T10:00:00Z"),
        updatedAt: new Date("2026-08-14T10:00:00Z"),
      };
      await createStockCorporateAction({ ...baseAction, _id: "dividend-valid" }, closingSession);
      await assert.rejects(
        createStockCorporateAction({ ...baseAction, _id: "dividend-conflict" }, closingSession),
        /STOCK_CORPORATE_ACTION_SLOT_CONFLICT/,
      );
    });
  } finally {
    await closingSession.endSession();
  }
  await db.collection("stock_market_preferences").insertOne({
    _id: "update-user",
    userId: "update-user",
    watchlist: [],
    alerts: [{ id: "news", kind: "DISCLOSURE", enabled: true }],
    createdAt: new Date(1),
    updatedAt: new Date(1),
  });
  const updateSession = client.startSession();
  try {
    await updateSession.withTransaction(async () => {
      await createStockDisclosure({
        id: "draft-to-published",
        title: "수정 즉시 공시",
        body: "초안에서 공개",
        kind: "INFO",
        status: "DRAFT",
        source: "GM",
        effects: [{ scope: "MARKET", structural: false }],
        createdById: "gm",
        now: new Date(3),
      }, updateSession);
      const published = await updateStockDisclosure(
        "draft-to-published",
        { status: "PUBLISHED" },
        new Date(4),
        updateSession,
      );
      assert.equal(published.status, "PUBLISHED");
      assert.equal(published.publishedAt.getTime(), 4);
    });
  } finally {
    await updateSession.endSession();
  }
  assert.equal(await db.collection("notifications").countDocuments({
    dedupeKey: "stock:disclosure:update-user:news:draft-to-published",
  }), 1);
  t.after(async () => {
    await db.dropDatabase();
    await close();
  });

  for (let index = 0; index < 10; index += 1) {
    const userId = `user-${index}`;
    const disclosureId = `info-${index}`;
    await db.collection("stock_market_preferences").insertOne({
      _id: userId,
      userId,
      watchlist: [],
      alerts: [{ id: "news", kind: "DISCLOSURE", enabled: true }],
      createdAt: new Date(1),
      updatedAt: new Date(1),
    });
    const alertSession = client.startSession();
    const preferenceSession = client.startSession();
    try {
      await Promise.all([
        alertSession.withTransaction(async () => {
          await createStockDisclosure({
            id: disclosureId,
            title: "즉시 공시",
            body: "알림 경쟁 검증",
            kind: "INFO",
            status: "PUBLISHED",
            source: "GM",
            effects: [{ scope: "MARKET", structural: false }],
            createdById: "gm",
            now: new Date(2),
          }, alertSession);
        }),
        preferenceSession.withTransaction(async () => {
          const current = await getStockMarketPreference(userId, { session: preferenceSession });
          await upsertStockMarketPreference(userId, {
            watchlist: ["NVS"],
            alerts: current.alerts,
            migratedLocalStorageAt: current.migratedLocalStorageAt,
          }, { session: preferenceSession });
        }),
      ]);
    } finally {
      await alertSession.endSession();
      await preferenceSession.endSession();
    }
    const preference = await getStockMarketPreference(userId);
    assert.deepEqual(preference.watchlist, ["NVS"]);
    assert.equal(preference.alerts[0].lastTriggeredDisclosureId, disclosureId);
    assert.equal(await db.collection("notifications").countDocuments({
      dedupeKey: `stock:disclosure:${userId}:news:${disclosureId}`,
    }), 1);
  }
});
