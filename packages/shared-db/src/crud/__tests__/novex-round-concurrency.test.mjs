import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";

const TEST_URI = process.env.MONGODB_TEST_URI?.trim();
const HAS_DB =
  process.env.RUN_DB_INTEGRATION_TESTS === "1" && Boolean(TEST_URI);
const TEST_DB_NAME = `stargate-novex-round-concurrency-${process.pid}`;
const TICKERS = Array.from({ length: 9 }, (_, index) => `NV${index}`);

function slotsThrough(target, previous) {
  const all = [
    "2026-08-24 09:00",
    "2026-08-24 13:00",
    "2026-08-24 18:00",
    "2026-08-24 23:00",
    "2026-08-25 09:00",
    "2026-08-25 13:00",
    "2026-08-25 18:00",
  ];
  return all.filter((slot) => (!previous || slot > previous) && slot <= target);
}

test("13·18시 역순 commit과 동시 실행은 시장 상태와 가격을 과거 회차로 되돌리지 않는다", {
  skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI replica-set 필요",
}, async (t) => {
  const {
    applyStockMarketRoundTransaction,
    applyStockDividendExDate,
    closeStockMarketWithoutRound,
    cancelStockScheduledEvent,
    claimPendingStockScheduledEvent,
    close,
    getClient,
    getDb,
    initServerless,
    legacyPendingEventContentHash,
    migrateLegacyPendingStockDisclosures,
    payNextPendingStockDividendEntitlement,
    createStockScheduledEvent,
    fenceStockScheduledEventCreation,
  } = await import("../../../dist/index.js");
  initServerless({ uri: TEST_URI, dbName: TEST_DB_NAME });
  const db = await getDb();
  t.after(async () => {
    await db.dropDatabase();
    await close();
  });

  await db.collection("notifications").createIndex(
    { dedupeKey: 1 },
    {
      unique: true,
      partialFilterExpression: { dedupeKey: { $type: "string" } },
    },
  );
  await db.collection("stock_market_migration_readiness").insertOne({
    _id: "novex-2",
    version: 2,
    status: "READY",
    attemptId: "test-ready",
    sourcePlanFingerprint: "test-source-plan",
    readyPlanFingerprint: "test-ready-plan",
    startedAt: new Date("2026-08-23T09:00:00+09:00"),
    completedAt: new Date("2026-08-23T10:00:00+09:00"),
    updatedAt: new Date("2026-08-23T10:00:00+09:00"),
  });

  await t.test("오래된 ERROR entitlement 100건보다 정상 PENDING 배당을 먼저 지급한다", async (subtest) => {
    const ownerId = new ObjectId();
    const characterId = new ObjectId();
    const actionId = "dividend-pending-priority";
    const entitlementIds = [
      ...Array.from({ length: 100 }, (_, index) => `dividend-error-${index}`),
      "dividend-pending-after-errors",
    ];
    subtest.after(async () => {
      await Promise.all([
        db.collection("stock_dividend_entitlements").deleteMany({ _id: { $in: entitlementIds } }),
        db.collection("stock_corporate_actions").deleteOne({ _id: actionId }),
        db.collection("notifications").deleteMany({ userId: ownerId.toString() }),
        db.collection("credit_transactions").deleteMany({ characterId: characterId.toString() }),
        db.collection("credit_balances").deleteOne({ characterId: characterId.toString() }),
        db.collection("characters").deleteOne({ _id: characterId }),
        db.collection("users").deleteOne({ _id: ownerId }),
      ]);
    });
    await db.collection("users").insertOne({
      _id: ownerId,
      displayName: "배당 테스트 소유자",
    });
    await db.collection("characters").insertOne({
      _id: characterId,
      ownerId: ownerId.toString(),
      codename: "DIVIDEND-READY",
    });
    await db.collection("stock_corporate_actions").insertOne({
      _id: actionId,
      type: "DIVIDEND",
      ticker: "NV0",
      status: "PROCESSING",
      amountPerShare: 1,
      recordSlotKey: "2099-01-01 23:00",
      exDateSlotKey: "2099-01-02 09:00",
      createdById: "gm",
      createdAt: new Date("2099-01-01T09:00:00+09:00"),
      updatedAt: new Date("2099-01-01T09:00:00+09:00"),
    });
    await db.collection("stock_dividend_entitlements").insertMany([
      ...Array.from({ length: 100 }, (_, index) => ({
        _id: `dividend-error-${index}`,
        actionId,
        characterId: `invalid-${index}`,
        shares: 1,
        amount: 1,
        creditRequestId: `dividend-error-credit-${index}`,
        status: "ERROR",
        failureReason: "INVALID_CHARACTER_ID",
        createdAt: new Date(index),
      })),
      {
        _id: "dividend-pending-after-errors",
        actionId,
        characterId: characterId.toString(),
        shares: 1,
        amount: 1,
        creditRequestId: "dividend-pending-priority-credit",
        status: "PENDING",
        createdAt: new Date("2099-01-01T10:00:00+09:00"),
      },
    ]);

    assert.deepEqual(await payNextPendingStockDividendEntitlement(), {
      status: "PAID",
      entitlementId: "dividend-pending-after-errors",
      amount: 1,
    });
  });

  await t.test("migration은 fence 획득 시점에 지난 공시 slot을 거부한다", async (subtest) => {
    const event = {
      _id: "stock-event:migration-cutoff-after-fence",
      ticker: "NV0",
      kstDate: "2099-01-03",
      executeAt: new Date("2099-01-03T13:00:00+09:00"),
      changePercent: 5,
      eventText: "cutoff 경쟁",
      eventTier: "scenario",
      status: "PENDING",
      createdBy: { id: "gm", displayName: "GM" },
      createdAt: new Date("2099-01-03T12:00:00+09:00"),
      updatedAt: new Date("2099-01-03T12:00:00+09:00"),
    };
    subtest.after(async () => {
      await Promise.all([
        db.collection("stock_scheduled_events").deleteOne({ _id: event._id }),
        db.collection("stock_disclosures").deleteOne({
          _id: `stock-disclosure:legacy:${event._id}`,
        }),
        db.collection("stock_disclosure_effect_fences").deleteOne({
          _id: "2099-01-03 13:00",
        }),
      ]);
    });
    await db.collection("stock_scheduled_events").insertOne(event);

    await assert.rejects(
      migrateLegacyPendingStockDisclosures(
        db,
        [{
          id: event._id,
          contentHash: legacyPendingEventContentHash(event),
          ticker: event.ticker,
          targetSlotKey: "2099-01-03 13:00",
        }],
        new Date("2099-01-03T12:59:59+09:00"),
        { now: () => new Date("2099-01-03T13:00:01+09:00") },
      ),
      /NOVEX_MIGRATION_LEGACY_SLOT_CUTOFF_PASSED:2099-01-03 13:00/,
    );
    assert.equal(
      await db.collection("stock_disclosures").countDocuments({
        _id: `stock-disclosure:legacy:${event._id}`,
      }),
      0,
    );
    assert.equal(
      (await db.collection("stock_scheduled_events").findOne({ _id: event._id }))?.status,
      "PENDING",
    );
  });

  await t.test("동시 배당 worker는 transaction 재시도마다 실제 다음 entitlement를 다시 선택한다", async (subtest) => {
    const ownerId = new ObjectId();
    const characterId = new ObjectId();
    const actionId = "dividend-retry-reselection";
    const entitlementIds = ["dividend-retry-a", "dividend-retry-b"];
    subtest.after(async () => {
      await Promise.all([
        db.collection("stock_dividend_entitlements").deleteMany({ _id: { $in: entitlementIds } }),
        db.collection("stock_corporate_actions").deleteOne({ _id: actionId }),
        db.collection("notifications").deleteMany({ userId: ownerId.toString() }),
        db.collection("credit_transactions").deleteMany({ characterId: characterId.toString() }),
        db.collection("credit_balances").deleteOne({ characterId: characterId.toString() }),
        db.collection("characters").deleteOne({ _id: characterId }),
        db.collection("users").deleteOne({ _id: ownerId }),
      ]);
    });
    await db.collection("users").insertOne({
      _id: ownerId,
      displayName: "배당 동시성 소유자",
    });
    await db.collection("characters").insertOne({
      _id: characterId,
      ownerId: ownerId.toString(),
      codename: "DIVIDEND-RACE",
    });
    await db.collection("stock_corporate_actions").insertOne({
      _id: actionId,
      type: "DIVIDEND",
      ticker: "NV0",
      status: "PROCESSING",
      amountPerShare: 1,
      recordSlotKey: "2099-01-01 23:00",
      exDateSlotKey: "2099-01-02 09:00",
      createdById: "gm",
      createdAt: new Date("2099-01-01T09:00:00+09:00"),
      updatedAt: new Date("2099-01-01T09:00:00+09:00"),
    });
    await db.collection("stock_dividend_entitlements").insertMany(
      entitlementIds.map((id, index) => ({
        _id: id,
        actionId,
        characterId: characterId.toString(),
        shares: 1,
        amount: index + 1,
        creditRequestId: `${id}-credit`,
        status: "PENDING",
        createdAt: new Date(index),
      })),
    );

    const outcomes = await Promise.all([
      payNextPendingStockDividendEntitlement(),
      payNextPendingStockDividendEntitlement(),
    ]);
    assert.deepEqual(
      outcomes.map((outcome) => outcome.status).sort(),
      ["PAID", "PAID"],
    );
    assert.deepEqual(
      outcomes.map((outcome) => outcome.entitlementId).sort(),
      entitlementIds,
    );
    assert.equal(
      await db.collection("credit_transactions").countDocuments({
        characterId: characterId.toString(),
        type: "STOCK_DIVIDEND",
      }),
      2,
    );
  });

  function runRound(slotKey) {
    const date = slotKey.slice(0, 10);
    return applyStockMarketRoundTransaction({
      slotKey,
      resolveMergedSlotKeys: (previous) => slotsThrough(slotKey, previous),
      delayed: false,
      now: new Date(`${slotKey.replace(" ", "T")}:30+09:00`),
      tradingDate: date,
      opensAt: new Date(`${date}T09:00:00+09:00`),
      closesAt: new Date(`${date}T23:00:00+09:00`),
      nextSlotAt: new Date(`${date}T23:00:00+09:00`),
      closeAfterRound: false,
      seeds: TICKERS.map((ticker) => ({ ticker, price: 100 })),
      calculate(current) {
        return {
          price: current.price + 1,
          referencePrice: current.referencePrice ?? current.price,
          eventText: "경쟁 테스트",
          eventTier: "routine",
          basePercent: 0.01,
          flowPercent: 0,
          disclosurePercent: 0,
          pendingBasePercent: 0,
          consumeFlow: false,
        };
      },
    });
  }

  const first18 = await runRound("2026-08-24 18:00");
  assert.equal(first18.applied, true);
  const stale13 = await runRound("2026-08-24 13:00");
  assert.equal(stale13.applied, false);
  assert.equal(stale13.state.lastCompletedSlotKey, "2026-08-24 18:00");
  assert.equal(
    await db.collection("stock_price_history").countDocuments({
      slotKey: "2026-08-24 13:00",
      source: "scheduled",
    }),
    0,
  );

  await Promise.all([
    runRound("2026-08-25 13:00"),
    runRound("2026-08-25 18:00"),
  ]);
  const state = await db.collection("stock_market_state").findOne({
    _id: "novex",
  });
  assert.equal(state.lastCompletedSlotKey, "2026-08-25 18:00");
  const prices = await db.collection("stock_prices").find().toArray();
  assert.equal(prices.length, 9);
  assert.ok(prices.every((price) => price.lastUpdate === "2026-08-25 18:00"));

  const season = {
    _id: "novex-season:2026-09-07",
    startsAt: new Date("2026-09-07T09:00:00+09:00"),
    endsAt: new Date("2026-09-20T18:00:00+09:00"),
    status: "ACTIVE",
    createdAt: new Date("2026-09-07T13:00:00+09:00"),
  };
  await applyStockMarketRoundTransaction({
    slotKey: "2026-09-07 13:00",
    resolveMergedSlotKeys: () => [
      "2026-09-07 09:00",
      "2026-09-07 13:00",
    ],
    delayed: true,
    now: new Date("2026-09-07T13:05:00+09:00"),
    tradingDate: "2026-09-07",
    opensAt: new Date("2026-09-07T09:00:00+09:00"),
    closesAt: new Date("2026-09-07T23:00:00+09:00"),
    nextSlotAt: new Date("2026-09-07T18:00:00+09:00"),
    closeAfterRound: false,
    season: {
      resolveActivation: (mergedSlotKeys) =>
        mergedSlotKeys.includes("2026-09-07 09:00") ? season : undefined,
    },
    seeds: TICKERS.map((ticker) => ({ ticker, price: 100 })),
    calculate(current) {
      return {
        price: current.price,
        referencePrice: current.referencePrice ?? current.price,
        eventText: "시즌 병합 테스트",
        eventTier: "routine",
        basePercent: 0,
        flowPercent: 0,
        disclosurePercent: 0,
        consumeFlow: false,
      };
    },
  });
  assert.equal(
    (await db.collection("stock_investment_seasons").findOne({
      _id: season._id,
    }))?.status,
    "ACTIVE",
  );

  const legacyNow = new Date("2026-09-08T13:05:00+09:00");
  const legacyEvent = {
    _id: "stock-event:2026-09-08:NV0",
    ticker: "NV0",
    kstDate: "2026-09-08",
    executeAt: new Date("2026-09-08T13:00:00+09:00"),
    changePercent: 5,
    eventText: "legacy 경쟁",
    eventTier: "scenario",
    status: "PENDING",
    createdBy: { id: "gm", displayName: "GM" },
    createdAt: new Date("2026-09-08T09:00:00+09:00"),
    updatedAt: new Date("2026-09-08T09:00:00+09:00"),
  };
  await db.collection("stock_scheduled_events").insertOne(legacyEvent);
  const client = await getClient();
  const claimSession = client.startSession();
  try {
    await Promise.all([
      migrateLegacyPendingStockDisclosures(
        db,
        [{
          id: legacyEvent._id,
          contentHash: legacyPendingEventContentHash(legacyEvent),
          ticker: legacyEvent.ticker,
          targetSlotKey: "2026-09-08 18:00",
        }],
        legacyNow,
      ),
      claimSession.withTransaction(() =>
        claimPendingStockScheduledEvent({
          ticker: "NV0",
          kstDate: "2026-09-08",
          operationKey: "legacy-race",
          now: legacyNow,
          session: claimSession,
        }),
      ),
    ]);
  } finally {
    await claimSession.endSession();
  }
  const legacy = await db.collection("stock_scheduled_events").findOne({
    _id: "stock-event:2026-09-08:NV0",
  });
  assert.equal(legacy?.status, "APPLIED");
  const migratedDisclosure = await db.collection("stock_disclosures").findOne({
    _id: "stock-disclosure:legacy:stock-event:2026-09-08:NV0",
  });
  assert.notEqual(migratedDisclosure?.status, "SCHEDULED");

  await t.test("migration 연결 예약은 취소·재활성화와 회차 경쟁에서 함께 수렴한다", async () => {
    const executeAt = new Date("2027-01-10T12:00:00+09:00");
    const migratedAt = new Date("2027-01-10T10:00:00+09:00");
    const event = {
      _id: "stock-event:2027-01-10:NV1",
      ticker: "NV1",
      kstDate: "2027-01-10",
      executeAt,
      changePercent: 5,
      eventText: "legacy 취소 연결",
      eventTier: "scenario",
      status: "PENDING",
      createdBy: { id: "gm", displayName: "GM" },
      createdAt: migratedAt,
      updatedAt: migratedAt,
    };
    await db.collection("stock_scheduled_events").insertOne(event);
    await migrateLegacyPendingStockDisclosures(
      db,
      [{
        id: event._id,
        contentHash: legacyPendingEventContentHash(event),
        ticker: event.ticker,
        targetSlotKey: "2027-01-10 13:00",
      }],
      migratedAt,
    );

    const cancelSession = client.startSession();
    try {
      await cancelSession.withTransaction(() =>
        cancelStockScheduledEvent({
          eventId: event._id,
          actor: { id: "gm", displayName: "GM" },
          now: new Date("2027-01-10T11:00:00+09:00"),
          session: cancelSession,
        }),
      );
    } finally {
      await cancelSession.endSession();
    }
    assert.equal(
      (await db.collection("stock_scheduled_events").findOne({ _id: event._id }))?.status,
      "CANCELLED",
    );
    assert.equal(
      (await db.collection("stock_disclosures").findOne({
        _id: `stock-disclosure:legacy:${event._id}`,
      }))?.status,
      "CANCELLED",
    );

    const reactivateSession = client.startSession();
    try {
      await reactivateSession.withTransaction(async () => {
        const now = new Date("2027-01-10T11:30:00+09:00");
        await fenceStockScheduledEventCreation({
          ticker: "NV1",
          executeAt,
          now,
          session: reactivateSession,
        });
        await createStockScheduledEvent(
          {
            ticker: "NV1",
            kstDate: "2027-01-10",
            executeAt,
            changePercent: -7,
            eventText: "legacy 재활성화 반영",
            eventTier: "shock",
            actor: { id: "gm", displayName: "GM" },
            now,
          },
          reactivateSession,
        );
      });
    } finally {
      await reactivateSession.endSession();
    }
    const reactivatedDisclosure = await db.collection("stock_disclosures").findOne({
      _id: `stock-disclosure:legacy:${event._id}`,
    });
    assert.equal(reactivatedDisclosure?.status, "SCHEDULED");
    assert.equal(reactivatedDisclosure?.body, "legacy 재활성화 반영");
    assert.equal(reactivatedDisclosure?.effects?.[0]?.changePercent, -7);

    const racingCancelSession = client.startSession();
    const cancel = racingCancelSession
      .withTransaction(() =>
        cancelStockScheduledEvent({
          eventId: event._id,
          actor: { id: "gm", displayName: "GM" },
          now: new Date("2027-01-10T12:59:59+09:00"),
          session: racingCancelSession,
        }),
      )
      .finally(() => racingCancelSession.endSession());
    const round = applyStockMarketRoundTransaction({
      slotKey: "2027-01-10 13:00",
      resolveMergedSlotKeys: () => ["2027-01-10 13:00"],
      delayed: false,
      now: new Date("2027-01-10T13:00:00+09:00"),
      tradingDate: "2027-01-10",
      opensAt: new Date("2027-01-10T09:00:00+09:00"),
      closesAt: new Date("2027-01-10T23:00:00+09:00"),
      nextSlotAt: new Date("2027-01-10T18:00:00+09:00"),
      closeAfterRound: false,
      seeds: TICKERS.map((ticker) => ({ ticker, price: 100 })),
      calculate(current) {
        return {
          price: current.price,
          referencePrice: current.referencePrice ?? current.price,
          eventText: "legacy cancel race",
          eventTier: "routine",
          basePercent: 0,
          flowPercent: 0,
          disclosurePercent: 0,
          consumeFlow: false,
        };
      },
    });
    await Promise.allSettled([cancel, round]);
    const finalLegacy = await db.collection("stock_scheduled_events").findOne({
      _id: event._id,
    });
    const finalDisclosure = await db.collection("stock_disclosures").findOne({
      _id: `stock-disclosure:legacy:${event._id}`,
    });
    assert.ok(
      (finalLegacy?.status === "CANCELLED" && finalDisclosure?.status === "CANCELLED") ||
        (finalLegacy?.status === "APPLIED" && finalDisclosure?.status === "PUBLISHED"),
    );
  });

  await t.test("병합 기업행동은 split→record와 ex-date→later split 시간순을 보존한다", async () => {
    await Promise.all([
      db.collection("stock_market_state").deleteMany({}),
      db.collection("stock_prices").deleteMany({}),
      db.collection("stock_price_history").deleteMany({}),
      db.collection("stock_holdings").deleteMany({}),
      db.collection("stock_corporate_actions").deleteMany({}),
      db.collection("stock_dividend_entitlements").deleteMany({}),
      db.collection("stock_investment_seasons").deleteMany({}),
      db.collection("stock_season_performance").deleteMany({}),
      db.collection("stock_season_flows").deleteMany({}),
      db.collection("stock_disclosures").deleteMany({}),
    ]);
    await db.collection("stock_prices").insertMany(
      TICKERS.map((ticker) => ({
        ticker,
        price: 100,
        prevPrice: 100,
        referencePrice: 100,
        tradeRevision: 0,
      })),
    );
    await db.collection("stock_holdings").insertOne({
      characterId: "corporate-order",
      characterCodename: "ORDER",
      ticker: "NV0",
      shares: 10,
      avgPrice: 100,
      updatedAt: new Date("2027-02-01T09:00:00+09:00"),
    });
    await db.collection("stock_corporate_actions").insertMany([
      {
        _id: "split-before-record",
        type: "SPLIT",
        ticker: "NV0",
        factor: 2,
        executeSlotKey: "2027-02-01 09:00",
        status: "SCHEDULED",
        createdById: "gm",
        createdAt: new Date("2027-01-01T09:00:00+09:00"),
        updatedAt: new Date("2027-01-01T09:00:00+09:00"),
      },
      {
        _id: "dividend-after-split",
        type: "DIVIDEND",
        ticker: "NV0",
        amountPerShare: 1,
        recordSlotKey: "2027-02-01 23:00",
        exDateSlotKey: "2027-02-02 09:00",
        status: "SCHEDULED",
        createdById: "gm",
        createdAt: new Date("2027-01-01T09:00:00+09:00"),
        updatedAt: new Date("2027-01-01T09:00:00+09:00"),
      },
    ]);

    const runMergedRound = (slotKey, mergedSlotKeys) =>
      applyStockMarketRoundTransaction({
        slotKey,
        resolveMergedSlotKeys: () => mergedSlotKeys,
        delayed: true,
        now: new Date(`${slotKey.replace(" ", "T")}:10+09:00`),
        tradingDate: slotKey.slice(0, 10),
        opensAt: new Date(`${slotKey.slice(0, 10)}T09:00:00+09:00`),
        closesAt: new Date(`${slotKey.slice(0, 10)}T23:00:00+09:00`),
        nextSlotAt: new Date(`${slotKey.slice(0, 10)}T13:00:00+09:00`),
        closeAfterRound: false,
        seeds: TICKERS.map((ticker) => ({ ticker, price: 100 })),
        calculate(current) {
          return {
            price: current.price,
            referencePrice: current.referencePrice ?? current.price,
            eventText: "기업행동 병합",
            eventTier: "routine",
            basePercent: 0,
            flowPercent: 0,
            disclosurePercent: 0,
            consumeFlow: false,
          };
        },
      });

    await runMergedRound("2027-02-02 09:00", [
      "2027-02-01 09:00",
      "2027-02-01 13:00",
      "2027-02-01 18:00",
      "2027-02-01 23:00",
      "2027-02-02 09:00",
    ]);
    const entitlement = await db.collection("stock_dividend_entitlements").findOne({
      actionId: "dividend-after-split",
    });
    assert.equal(entitlement?.shares, 20);
    assert.equal(entitlement?.amount, 20);
    assert.equal(
      (await db.collection("stock_prices").findOne({ ticker: "NV0" }))?.price,
      49,
    );

    await Promise.all([
      db.collection("stock_market_state").deleteMany({}),
      db.collection("stock_price_history").deleteMany({}),
      db.collection("stock_corporate_actions").deleteMany({}),
      db.collection("stock_dividend_entitlements").deleteMany({}),
      db.collection("stock_season_flows").deleteMany({}),
    ]);
    await db.collection("stock_prices").updateMany({}, {
      $set: { price: 100, prevPrice: 100, referencePrice: 100 },
    });
    await db.collection("stock_holdings").updateOne(
      { characterId: "corporate-order", ticker: "NV0" },
      { $set: { shares: 10, avgPrice: 100 } },
    );
    await db.collection("stock_corporate_actions").insertMany([
      {
        _id: "earlier-ex-date",
        type: "DIVIDEND",
        ticker: "NV0",
        amountPerShare: 10,
        recordSlotKey: "2027-02-02 23:00",
        exDateSlotKey: "2027-02-03 09:00",
        status: "SNAPSHOTTED",
        payoutCompletedAt: new Date("2027-02-03T00:00:00+09:00"),
        createdById: "gm",
        createdAt: new Date("2027-01-01T09:00:00+09:00"),
        updatedAt: new Date("2027-02-02T23:00:00+09:00"),
      },
      {
        _id: "later-split",
        type: "SPLIT",
        ticker: "NV0",
        factor: 2,
        executeSlotKey: "2027-02-04 09:00",
        status: "SCHEDULED",
        createdById: "gm",
        createdAt: new Date("2027-01-01T09:00:00+09:00"),
        updatedAt: new Date("2027-01-01T09:00:00+09:00"),
      },
    ]);
    await runMergedRound("2027-02-04 09:00", [
      "2027-02-03 09:00",
      "2027-02-03 13:00",
      "2027-02-03 18:00",
      "2027-02-03 23:00",
      "2027-02-04 09:00",
    ]);
    assert.equal(
      (await db.collection("stock_prices").findOne({ ticker: "NV0" }))?.price,
      45,
    );
  });

  await t.test("병합 batch에서 배당 기준일 cap 거절은 ex-date를 건너뛰고 회차를 완료한다", async () => {
    await Promise.all([
      db.collection("stock_market_state").deleteMany({}),
      db.collection("stock_prices").deleteMany({}),
      db.collection("stock_price_history").deleteMany({}),
      db.collection("stock_holdings").deleteMany({}),
      db.collection("stock_corporate_actions").deleteMany({}),
      db.collection("stock_dividend_entitlements").deleteMany({}),
      db.collection("stock_disclosures").deleteMany({}),
    ]);
    await db.collection("stock_prices").insertMany(
      TICKERS.map((ticker) => ({
        ticker,
        price: ticker === "NV0" ? 60 : 100,
        prevPrice: 100,
        referencePrice: 100,
        tradeRevision: 0,
      })),
    );
    await db.collection("stock_holdings").insertOne({
      characterId: "rejected-dividend-holder",
      ticker: "NV0",
      shares: 10,
      avgPrice: 100,
      updatedAt: new Date("2027-02-10T23:00:00+09:00"),
    });
    await db.collection("stock_corporate_actions").insertOne({
      _id: "dividend-cap-rejected-in-merged-batch",
      type: "DIVIDEND",
      ticker: "NV0",
      amountPerShare: 20,
      recordSlotKey: "2027-02-10 23:00",
      exDateSlotKey: "2027-02-11 09:00",
      status: "SCHEDULED",
      createdById: "gm",
      createdAt: new Date("2027-02-01T09:00:00+09:00"),
      updatedAt: new Date("2027-02-01T09:00:00+09:00"),
    });

    const result = await applyStockMarketRoundTransaction({
      slotKey: "2027-02-11 09:00",
      resolveMergedSlotKeys: () => [
        "2027-02-10 23:00",
        "2027-02-11 09:00",
      ],
      delayed: true,
      now: new Date("2027-02-11T09:05:00+09:00"),
      tradingDate: "2027-02-11",
      opensAt: new Date("2027-02-11T09:00:00+09:00"),
      closesAt: new Date("2027-02-11T23:00:00+09:00"),
      nextSlotAt: new Date("2027-02-11T13:00:00+09:00"),
      closeAfterRound: false,
      seeds: TICKERS.map((ticker) => ({ ticker, price: 100 })),
      calculate(current) {
        return {
          price: current.price,
          referencePrice: current.referencePrice ?? current.price,
          eventText: "배당 cap 거절 뒤 정상 회차",
          eventTier: "routine",
          basePercent: 0,
          flowPercent: 0,
          disclosurePercent: 0,
          consumeFlow: false,
        };
      },
    });
    assert.equal(result.applied, true);
    assert.equal(result.state.lastCompletedSlotKey, "2027-02-11 09:00");
    assert.equal(
      (await db.collection("stock_corporate_actions").findOne({
        _id: "dividend-cap-rejected-in-merged-batch",
      }))?.status,
      "ERROR",
    );
    assert.equal(
      await db.collection("stock_dividend_entitlements").countDocuments({
        actionId: "dividend-cap-rejected-in-merged-batch",
      }),
      0,
    );
    assert.equal(
      await db.collection("stock_price_history").countDocuments({
        source: "dividend",
        slotKey: "2027-02-11 09:00",
      }),
      0,
    );
    assert.equal(
      (await db.collection("stock_prices").findOne({ ticker: "NV0" }))?.price,
      60,
    );
  });

  await t.test("지연 조기폐장은 cutoff 가격·보유량으로 시즌을 종결한다", async () => {
    await Promise.all([
      db.collection("stock_market_state").deleteMany({}),
      db.collection("stock_prices").deleteMany({}),
      db.collection("stock_price_history").deleteMany({}),
      db.collection("stock_holdings").deleteMany({}),
      db.collection("stock_investment_seasons").deleteMany({}),
      db.collection("stock_season_performance").deleteMany({}),
      db.collection("stock_season_flows").deleteMany({}),
    ]);
    const cutoff = new Date("2027-02-07T15:00:00+09:00");
    await db.collection("stock_prices").insertOne({
      ticker: "NV0",
      price: 200,
      prevPrice: 100,
      referencePrice: 100,
      tradeRevision: 0,
    });
    await db.collection("stock_price_history").insertOne({
      ticker: "NV0",
      price: 100,
      prevPrice: 100,
      source: "scheduled",
      slotKey: "2027-02-07 13:00",
      effectiveAt: new Date("2027-02-07T13:00:00+09:00"),
      effectiveSequence: 30,
      createdAt: new Date("2027-02-07T16:00:00+09:00"),
    });
    await db.collection("stock_holdings").insertOne({
      characterId: "season-cutoff",
      characterCodename: "CUTOFF",
      ticker: "NV0",
      shares: 2,
      avgPrice: 100,
      updatedAt: new Date("2027-02-07T16:00:00+09:00"),
    });
    await db.collection("stock_investment_seasons").insertOne({
      _id: "season-cutoff-test",
      startsAt: new Date("2027-01-25T09:00:00+09:00"),
      endsAt: cutoff,
      status: "ACTIVE",
      createdAt: new Date("2027-01-25T09:00:00+09:00"),
    });
    await db.collection("stock_season_performance").insertOne({
      _id: "stock-season-performance:season-cutoff-test:season-cutoff",
      seasonId: "season-cutoff-test",
      characterId: "season-cutoff",
      codename: "CUTOFF",
      linkedReturn: 0,
      investedValue: 50,
      buyCount: 1,
      exposureSlots: 7,
      eligible: false,
      currentPortfolioValue: 100,
      lastValuedAt: new Date("2027-02-07T13:00:00+09:00"),
      lastValuedSlotKey: "2027-02-07 13:00",
      updatedAt: new Date("2027-02-07T13:00:00+09:00"),
    });
    await db.collection("stock_season_flows").insertOne({
      operationKey: "post-close-grant",
      characterId: "season-cutoff",
      ticker: "NV0",
      kind: "GM_GRANT",
      shares: 1,
      marketPrice: 100,
      externalAmount: 100,
      returnAmount: 0,
      // close 호출의 now 캡처 직후 transaction snapshot 전에 commit된 지급을 모사한다.
      occurredAt: new Date("2027-02-07T18:00:00.001+09:00"),
    });

    await closeStockMarketWithoutRound({
      tradingDate: "2027-02-07",
      opensAt: new Date("2027-02-07T09:00:00+09:00"),
      closesAt: cutoff,
      nextOpenAt: new Date("2027-02-08T09:00:00+09:00"),
      closureReason: "REGULAR_SESSION",
      finalizeSeason: true,
      now: new Date("2027-02-07T18:00:00+09:00"),
    });
    const performance = await db.collection("stock_season_performance").findOne({
      seasonId: "season-cutoff-test",
      characterId: "season-cutoff",
    });
    assert.equal(performance?.currentPortfolioValue, 100);
    assert.equal(performance?.linkedReturn, 0);
    assert.equal(performance?.exposureSlots, 8);
    assert.equal(performance?.eligible, true);
    assert.equal(performance?.lastValuedAt?.getTime(), cutoff.getTime());
    const season = await db.collection("stock_investment_seasons").findOne({
      _id: "season-cutoff-test",
    });
    assert.equal(season?.finalizedAt?.getTime(), cutoff.getTime());
  });

  await t.test("지연 배당락은 가격과 배당 수익을 같은 폐장 전 경제 시각에 반영한다", async () => {
    await Promise.all([
      db.collection("stock_market_state").deleteMany({}),
      db.collection("stock_prices").deleteMany({}),
      db.collection("stock_price_history").deleteMany({}),
      db.collection("stock_holdings").deleteMany({}),
      db.collection("stock_corporate_actions").deleteMany({}),
      db.collection("stock_dividend_entitlements").deleteMany({}),
      db.collection("stock_investment_seasons").deleteMany({}),
      db.collection("stock_season_performance").deleteMany({}),
      db.collection("stock_season_flows").deleteMany({}),
    ]);
    const cutoff = new Date("2027-02-21T15:00:00+09:00");
    await db.collection("stock_prices").insertOne({
      ticker: "NV0",
      price: 100,
      prevPrice: 100,
      referencePrice: 100,
      tradeRevision: 0,
    });
    await db.collection("stock_price_history").insertOne({
      ticker: "NV0",
      price: 100,
      prevPrice: 100,
      source: "scheduled",
      slotKey: "2027-02-20 23:00",
      effectiveAt: new Date("2027-02-20T23:00:00+09:00"),
      effectiveSequence: 30,
      createdAt: new Date("2027-02-20T23:00:00+09:00"),
    });
    await db.collection("stock_holdings").insertOne({
      characterId: "delayed-dividend-season",
      ticker: "NV0",
      shares: 1,
      avgPrice: 100,
      updatedAt: new Date("2027-02-20T23:00:00+09:00"),
    });
    await db.collection("stock_corporate_actions").insertOne({
      _id: "delayed-dividend-before-cutoff",
      type: "DIVIDEND",
      ticker: "NV0",
      amountPerShare: 10,
      recordSlotKey: "2027-02-20 23:00",
      exDateSlotKey: "2027-02-21 09:00",
      status: "SNAPSHOTTED",
      payoutCompletedAt: new Date("2027-02-21T08:00:00+09:00"),
      createdById: "gm",
      createdAt: new Date("2027-02-01T09:00:00+09:00"),
      updatedAt: new Date("2027-02-20T23:00:00+09:00"),
    });
    await db.collection("stock_dividend_entitlements").insertOne({
      _id: "stock-dividend:delayed-dividend-before-cutoff:delayed-dividend-season",
      actionId: "delayed-dividend-before-cutoff",
      characterId: "delayed-dividend-season",
      shares: 1,
      amount: 10,
      status: "PAID",
      creditRequestId: "delayed-dividend-credit",
      createdAt: new Date("2027-02-20T23:00:00+09:00"),
      paidAt: new Date("2027-02-21T08:00:00+09:00"),
    });
    await db.collection("stock_investment_seasons").insertOne({
      _id: "season-delayed-dividend",
      startsAt: new Date("2027-02-08T09:00:00+09:00"),
      endsAt: cutoff,
      status: "ACTIVE",
      createdAt: new Date("2027-02-08T09:00:00+09:00"),
    });
    await db.collection("stock_season_performance").insertOne({
      _id: "stock-season-performance:season-delayed-dividend:delayed-dividend-season",
      seasonId: "season-delayed-dividend",
      characterId: "delayed-dividend-season",
      codename: "DIVIDEND",
      linkedReturn: 0,
      investedValue: 50,
      buyCount: 1,
      exposureSlots: 7,
      eligible: false,
      currentPortfolioValue: 100,
      lastValuedAt: new Date("2027-02-20T23:00:00+09:00"),
      lastValuedSlotKey: "2027-02-20 23:00",
      updatedAt: new Date("2027-02-20T23:00:00+09:00"),
    });

    const dividendSession = client.startSession();
    try {
      await dividendSession.withTransaction(async () => {
        assert.equal(
          await applyStockDividendExDate(
            "delayed-dividend-before-cutoff",
            new Date("2027-02-21T16:00:00+09:00"),
            dividendSession,
          ),
          true,
        );
      });
    } finally {
      await dividendSession.endSession();
    }
    await closeStockMarketWithoutRound({
      tradingDate: "2027-02-21",
      opensAt: new Date("2027-02-21T09:00:00+09:00"),
      closesAt: cutoff,
      nextOpenAt: new Date("2027-02-22T09:00:00+09:00"),
      closureReason: "REGULAR_SESSION",
      finalizeSeason: true,
      now: new Date("2027-02-21T18:00:00+09:00"),
    });
    const dividendFlow = await db.collection("stock_season_flows").findOne({
      operationKey: "season:dividend:stock-dividend:delayed-dividend-before-cutoff:delayed-dividend-season",
    });
    assert.equal(
      dividendFlow?.occurredAt?.getTime(),
      new Date("2027-02-21T09:00:00+09:00").getTime(),
    );
    const performance = await db.collection("stock_season_performance").findOne({
      seasonId: "season-delayed-dividend",
      characterId: "delayed-dividend-season",
    });
    assert.equal(performance?.currentPortfolioValue, 90);
    assert.equal(performance?.linkedReturn, 0);
  });
});
