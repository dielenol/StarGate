import assert from "node:assert/strict";
import test from "node:test";

const TEST_URI = process.env.TEST_MONGODB_URI?.trim();
const TEST_DB_NAME = `stargate-stock-scheduled-events-test-${process.pid}`;

test(
  "예약 생성 fence와 tick claim은 충돌 시 재시도하고 가격·history·상태를 원자적으로 확정한다",
  { skip: !TEST_URI && "TEST_MONGODB_URI 없음 (격리 replica-set 전용)" },
  async (t) => {
    const {
      applyScheduledStockPriceMutation,
      claimPendingStockScheduledEvent,
      close,
      connect,
      createStockScheduledEvent,
      fenceStockScheduledEventCreation,
      getClient,
      getDb,
    } = await import("../../../dist/index.js");

    await connect({ uri: TEST_URI, dbName: TEST_DB_NAME });
    const db = await getDb();
    const prices = db.collection("stock_prices");
    const history = db.collection("stock_price_history");
    const events = db.collection("stock_scheduled_events");
    t.after(async () => {
      await Promise.all([
        prices.deleteMany({}),
        history.deleteMany({}),
        events.deleteMany({}),
      ]);
      await close();
    });
    await Promise.all([
      prices.deleteMany({}),
      history.deleteMany({}),
      events.deleteMany({}),
    ]);
    await history.createIndex(
      { operationKey: 1 },
      {
        unique: true,
        partialFilterExpression: { operationKey: { $type: "string" } },
      },
    );
    await prices.insertMany([
      {
        ticker: "RACE",
        price: 10,
        prevPrice: 10,
        eventText: "seed",
        lastUpdate: "2026-08-13 12:00",
      },
      {
        ticker: "ROLLBACK",
        price: 10,
        prevPrice: 10,
        eventText: "seed",
        lastUpdate: "2026-08-13 12:00",
      },
    ]);

    const client = await getClient();
    const executeAt = new Date("2026-08-14T03:00:00.000Z");
    let resolveFenceReady;
    const fenceReady = new Promise((resolve) => {
      resolveFenceReady = resolve;
    });
    let releaseCreation;
    const creationReleased = new Promise((resolve) => {
      releaseCreation = resolve;
    });
    const creationSession = client.startSession();
    const creation = creationSession
      .withTransaction(async () => {
        await fenceStockScheduledEventCreation({
          ticker: "RACE",
          executeAt,
          now: new Date("2026-08-14T02:59:59.999Z"),
          session: creationSession,
        });
        resolveFenceReady();
        await creationReleased;
        await createStockScheduledEvent(
          {
            ticker: "RACE",
            kstDate: "2026-08-14",
            executeAt,
            changePercent: -50,
            eventText: "경쟁 경계 검증",
            eventTier: "shock",
            actor: { id: "gm", displayName: "GM" },
            now: new Date("2026-08-14T02:59:59.999Z"),
          },
          creationSession,
        );
      })
      .finally(() => creationSession.endSession());

    await fenceReady;
    let firstMissingClaim;
    const firstMissingClaimObserved = new Promise((resolve) => {
      firstMissingClaim = resolve;
    });
    let contextRuns = 0;
    const operationKey = "stocks.tick:2026-08-14:RACE";
    const tick = applyScheduledStockPriceMutation({
      ticker: "RACE",
      operationKey,
      initialPrice: 10,
      initialLastUpdateKst: "2026-08-14 12:00",
      loadContext: async (session) => {
        contextRuns += 1;
        const event = await claimPendingStockScheduledEvent({
          ticker: "RACE",
          kstDate: "2026-08-14",
          operationKey,
          now: executeAt,
          session,
        });
        if (!event && contextRuns === 1) firstMissingClaim();
        return event;
      },
      calculate(current, event) {
        return {
          price: event ? current.price * (1 + event.changePercent / 100) : 11,
          eventText: event?.eventText ?? "routine",
          eventTier: event?.eventTier ?? "routine",
        };
      },
    });
    await firstMissingClaimObserved;
    releaseCreation();
    const [, tickResult] = await Promise.all([creation, tick]);

    assert.ok(contextRuns >= 2, "stock_prices fence 충돌 뒤 tick transaction 재시도");
    assert.equal(tickResult.price.price, 5);
    assert.equal(tickResult.history.eventText, "경쟁 경계 검증");
    assert.equal(
      (await events.findOne({ _id: "stock-event:2026-08-14:RACE" }))?.status,
      "APPLIED",
    );
    assert.equal(await history.countDocuments({ operationKey }), 1);

    const rollbackSession = client.startSession();
    try {
      await rollbackSession.withTransaction(async () => {
        await fenceStockScheduledEventCreation({
          ticker: "ROLLBACK",
          executeAt,
          now: new Date("2026-08-14T02:59:59.999Z"),
          session: rollbackSession,
        });
        await createStockScheduledEvent(
          {
            ticker: "ROLLBACK",
            kstDate: "2026-08-14",
            executeAt,
            changePercent: -25,
            eventText: "rollback 검증",
            eventTier: "shock",
            actor: { id: "gm", displayName: "GM" },
            now: new Date("2026-08-14T02:59:59.999Z"),
          },
          rollbackSession,
        );
      });
    } finally {
      await rollbackSession.endSession();
    }

    const rollbackKey = "stocks.tick:2026-08-14:ROLLBACK";
    await assert.rejects(
      applyScheduledStockPriceMutation({
        ticker: "ROLLBACK",
        operationKey: rollbackKey,
        initialPrice: 10,
        initialLastUpdateKst: "2026-08-14 12:00",
        loadContext: (session) =>
          claimPendingStockScheduledEvent({
            ticker: "ROLLBACK",
            kstDate: "2026-08-14",
            operationKey: rollbackKey,
            now: executeAt,
            session,
          }),
        calculate() {
          throw new Error("fault after event claim");
        },
      }),
      /fault after event claim/,
    );
    assert.equal(
      (await events.findOne({ _id: "stock-event:2026-08-14:ROLLBACK" }))
        ?.status,
      "PENDING",
    );
    assert.equal((await prices.findOne({ ticker: "ROLLBACK" }))?.price, 10);
    assert.equal(await history.countDocuments({ operationKey: rollbackKey }), 0);
  },
);
