import assert from "node:assert/strict";
import test from "node:test";

const TEST_URI = process.env.TEST_MONGODB_URI?.trim();
const TEST_DB_NAME = `stargate-stock-impact-test-${process.pid}`;

test(
  "소다 판매량 소비와 STM 시세·history는 rollback/replay까지 원자적이다",
  { skip: !TEST_URI && "TEST_MONGODB_URI 없음 (격리 replica-set 전용)" },
  async (t) => {
    const {
      applyScheduledStockPriceMutation,
      close,
      consumeMrBeastSodaStockImpactDemand,
      getClient,
      getDb,
      incrementMrBeastSodaStockImpactDemand,
      initServerless,
      prepareMrBeastSodaStockImpactDemand,
    } = await import("../../../dist/index.js");

    initServerless({ uri: TEST_URI, dbName: TEST_DB_NAME });
    const db = await getDb();
    t.after(async () => {
      await Promise.all([
        db.collection("stock_prices").deleteMany({}),
        db.collection("stock_price_history").deleteMany({}),
        db.collection("mrbeast_soda_stock_impact_demand").deleteMany({}),
      ]);
      await close();
    });
    await Promise.all([
      db.collection("stock_prices").deleteMany({}),
      db.collection("stock_price_history").deleteMany({}),
      db.collection("mrbeast_soda_stock_impact_demand").deleteMany({}),
    ]);
    await db.collection("stock_price_history").createIndex(
      { operationKey: 1 },
      {
        unique: true,
        partialFilterExpression: { operationKey: { $type: "string" } },
      },
    );
    await db.collection("stock_prices").insertOne({
      ticker: "STM",
      price: 10,
      prevPrice: 10,
      eventText: "seed",
      lastUpdate: "2026-08-01 12:00",
    });

    const key = {
      eventId: "mrbeast-test",
      configVersion: 1,
      startAt: new Date("2026-08-01T00:00:00.000Z"),
      endAt: new Date("2026-08-15T00:00:00.000Z"),
    };
    await prepareMrBeastSodaStockImpactDemand(key);
    const client = await getClient();
    const saleSession = client.startSession();
    try {
      await saleSession.withTransaction(() =>
        incrementMrBeastSodaStockImpactDemand({
          key,
          quantity: 36,
          purchasedAt: new Date("2026-08-01T01:00:00.000Z"),
          session: saleSession,
        }),
      );
    } finally {
      await saleSession.endSession();
    }

    await assert.rejects(
      applyScheduledStockPriceMutation({
        ticker: "STM",
        operationKey: "stocks.tick:2026-08-01:STM:failure",
        initialPrice: 10,
        initialLastUpdateKst: "2026-08-01 12:00",
        loadContext: (session) =>
          consumeMrBeastSodaStockImpactDemand({
            operationKey: "stocks.tick:2026-08-01:STM:failure",
            now: new Date("2026-09-01T03:00:00.000Z"),
            session,
          }),
        calculate() {
          throw new Error("fault injection");
        },
      }),
      /fault injection/,
    );
    const demandAfterRollback = await db
      .collection("mrbeast_soda_stock_impact_demand")
      .findOne({ eventId: key.eventId });
    assert.equal(demandAfterRollback.soldQuantity, 36);
    assert.equal(demandAfterRollback.appliedQuantity, 0);

    const operationKey = "stocks.tick:2026-08-01:STM";
    const first = await applyScheduledStockPriceMutation({
      ticker: "STM",
      operationKey,
      initialPrice: 10,
      initialLastUpdateKst: "2026-08-01 12:00",
      loadContext: (session) =>
        consumeMrBeastSodaStockImpactDemand({
          operationKey,
          now: new Date("2026-09-01T03:00:00.000Z"),
          session,
        }),
      calculate(current, demand) {
        return {
          price: current.price + demand.soldQuantity / 100,
          eventText: `판매 ${demand.soldQuantity}`,
          eventTier: "routine",
        };
      },
    });
    const replay = await applyScheduledStockPriceMutation({
      ticker: "STM",
      operationKey,
      initialPrice: 10,
      initialLastUpdateKst: "2026-08-01 12:00",
      loadContext: (session) =>
        consumeMrBeastSodaStockImpactDemand({
          operationKey,
          now: new Date("2026-09-01T03:00:00.000Z"),
          session,
        }),
      calculate() {
        throw new Error("replay에서 calculate 호출 금지");
      },
    });

    assert.equal(first.applied, true);
    assert.equal(replay.applied, false);
    assert.equal(
      await db.collection("stock_price_history").countDocuments({ operationKey }),
      1,
    );
    const demandAfterCommit = await db
      .collection("mrbeast_soda_stock_impact_demand")
      .findOne({ eventId: key.eventId });
    assert.equal(demandAfterCommit.appliedQuantity, 36);
    assert.equal(demandAfterCommit.lastAppliedOperationKey, operationKey);

  },
);
