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
      cancelStockScheduledEvent,
      claimPendingStockScheduledEvent,
      claimNovex2MigrationReadiness,
      close,
      connect,
      createStockScheduledEvent,
      fenceStockScheduledEventCreation,
      getClient,
      getDb,
      listStockScheduledEvents,
      StockScheduledEventCutoverError,
    } = await import("../../../dist/index.js");

    await connect({ uri: TEST_URI, dbName: TEST_DB_NAME });
    const db = await getDb();
    const prices = db.collection("stock_prices");
    const history = db.collection("stock_price_history");
    const events = db.collection("stock_scheduled_events");
    const disclosures = db.collection("stock_disclosures");
    const readiness = db.collection("stock_market_migration_readiness");
    t.after(async () => {
      await Promise.all([
        prices.deleteMany({}),
        history.deleteMany({}),
        events.deleteMany({}),
        disclosures.deleteMany({}),
        readiness.deleteMany({}),
      ]);
      await close();
    });
    await Promise.all([
      prices.deleteMany({}),
      history.deleteMany({}),
      events.deleteMany({}),
      disclosures.deleteMany({}),
      readiness.deleteMany({}),
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

    await t.test("100건을 넘어도 모든 PENDING 예약과 최신 종료 이력을 반환한다", async () => {
      await events.deleteMany({});
      const actor = { id: "gm", displayName: "GM" };
      const pendingBase = new Date("2027-01-01T03:00:00.000Z");
      const pending = Array.from({ length: 105 }, (_, index) => {
        const executeAt = new Date(
          pendingBase.getTime() + index * 24 * 60 * 60 * 1000,
        );
        const kstDate = executeAt.toISOString().slice(0, 10);
        return {
          _id: `pending-${index}`,
          ticker: `P${index}`,
          kstDate,
          executeAt,
          changePercent: -10,
          eventText: `pending ${index}`,
          eventTier: "shock",
          status: "PENDING",
          createdBy: actor,
          createdAt: executeAt,
          updatedAt: executeAt,
        };
      });
      const historyBase = new Date("2026-08-01T03:00:00.000Z");
      const terminal = Array.from({ length: 120 }, (_, index) => {
        const executeAt = new Date(
          historyBase.getTime() + index * 60 * 60 * 1000,
        );
        return {
          _id: `history-${index}`,
          ticker: `H${index}`,
          kstDate: executeAt.toISOString().slice(0, 10),
          executeAt,
          changePercent: 5,
          eventText: `history ${index}`,
          eventTier: "scenario",
          status: index % 2 === 0 ? "APPLIED" : "CANCELLED",
          createdBy: actor,
          createdAt: executeAt,
          updatedAt: executeAt,
        };
      });
      await events.insertMany([...pending, ...terminal]);

      const listed = await listStockScheduledEvents({
        from: new Date("2026-08-01T00:00:00.000Z"),
      });
      assert.equal(
        listed.filter((event) => event.status === "PENDING").length,
        pending.length,
      );
      assert.equal(
        listed.filter((event) => event.status !== "PENDING").length,
        100,
      );
      assert.ok(listed.some((event) => event._id === "history-119"));
      assert.ok(!listed.some((event) => event._id === "history-0"));
    });

    await t.test("cutover marker는 CREATE와 migration을 직렬화하고 READY cancel만 허용한다", async () => {
      await claimNovex2MigrationReadiness(db, {
        sourcePlanFingerprint: "approved-test-plan",
        attemptId: "cutover-test-attempt",
      });

      const rejectedCreateSession = client.startSession();
      try {
        await assert.rejects(
          rejectedCreateSession.withTransaction(() =>
            createStockScheduledEvent(
              {
                ticker: "LATE",
                kstDate: "2099-12-01",
                executeAt: new Date("2099-12-01T03:00:00.000Z"),
                changePercent: 10,
                eventText: "cutover 이후 생성 차단",
                eventTier: "scenario",
                actor: { id: "gm", displayName: "GM" },
                now: new Date("2099-12-01T02:00:00.000Z"),
              },
              rejectedCreateSession,
            ),
          ),
          (error) => error instanceof StockScheduledEventCutoverError,
        );
      } finally {
        await rejectedCreateSession.endSession();
      }
      assert.equal(await events.countDocuments({ ticker: "LATE" }), 0);

      const readyAt = new Date("2099-12-01T02:10:00.000Z");
      await readiness.updateOne(
        { _id: "novex-2", status: "APPLYING" },
        { $set: { status: "READY", updatedAt: readyAt } },
      );
      const eventId = "stock-event:2099-12-02:READY";
      const disclosureId = `stock-disclosure:legacy:${eventId}`;
      await events.insertOne({
        _id: eventId,
        ticker: "READY",
        kstDate: "2099-12-02",
        executeAt: new Date("2099-12-02T03:00:00.000Z"),
        changePercent: 10,
        eventText: "READY 취소",
        eventTier: "scenario",
        status: "PENDING",
        createdBy: { id: "gm", displayName: "GM" },
        createdAt: readyAt,
        updatedAt: readyAt,
        migratedDisclosureId: disclosureId,
      });
      await disclosures.insertOne({
        _id: disclosureId,
        title: "READY 예약 공시",
        body: "READY 취소",
        kind: "PRICE",
        status: "SCHEDULED",
        source: "GM",
        effects: [{
          scope: "TICKER",
          ticker: "READY",
          changePercent: 10,
          structural: false,
        }],
        publishAt: new Date("2099-12-02T03:00:00.000Z"),
        slotKey: "2099-12-02 12:00",
        shock: false,
        createdById: "gm",
        createdAt: readyAt,
        updatedAt: readyAt,
      });

      const cancelSession = client.startSession();
      try {
        await cancelSession.withTransaction(() =>
          cancelStockScheduledEvent({
            eventId,
            actor: { id: "gm", displayName: "GM" },
            now: readyAt,
            session: cancelSession,
          }),
        );
      } finally {
        await cancelSession.endSession();
      }
      assert.equal((await events.findOne({ _id: eventId }))?.status, "CANCELLED");
      assert.equal(
        (await disclosures.findOne({ _id: disclosureId }))?.status,
        "CANCELLED",
      );

      await readiness.updateOne(
        { _id: "novex-2", status: "READY" },
        { $set: { status: "BLOCKED", updatedAt: new Date() } },
      );
      const blockedCancelSession = client.startSession();
      try {
        await assert.rejects(
          blockedCancelSession.withTransaction(() =>
            cancelStockScheduledEvent({
              eventId: "pending-0",
              actor: { id: "gm", displayName: "GM" },
              now: new Date(),
              session: blockedCancelSession,
            }),
          ),
          (error) => error instanceof StockScheduledEventCutoverError,
        );
      } finally {
        await blockedCancelSession.endSession();
      }
      assert.equal(
        (await events.findOne({ _id: "pending-0" }))?.status,
        "PENDING",
      );
    });
  },
);
