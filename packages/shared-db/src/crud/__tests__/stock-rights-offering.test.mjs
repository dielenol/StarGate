import assert from "node:assert/strict";
import test from "node:test";

const TEST_URI = process.env.MONGODB_TEST_URI?.trim();
const HAS_DB =
  process.env.RUN_DB_INTEGRATION_TESTS === "1" && Boolean(TEST_URI);
const TEST_DB_NAME = `stargate-stock-rights-offering-${process.pid}`;
const TICKERS = Array.from({ length: 9 }, (_, index) => `RO${index}`);

function roundInput(slotKey, now, calculate) {
  return {
    slotKey,
    resolveMergedSlotKeys: () => [slotKey],
    delayed: false,
    now,
    tradingDate: slotKey.slice(0, 10),
    opensAt: new Date(`${slotKey.slice(0, 10)}T09:00:00+09:00`),
    closesAt: new Date(`${slotKey.slice(0, 10)}T23:00:00+09:00`),
    nextSlotAt: new Date(`${slotKey.slice(0, 10)}T23:00:00+09:00`),
    closeAfterRound: false,
    seeds: TICKERS.map((ticker) => ({ ticker, price: 100 })),
    calculate,
  };
}

test("유상증자 발표→동결→원자 실행·rollback·재시도", {
  skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI replica-set 필요",
}, async (t) => {
  const {
    announceStockRightsOffering,
    applyStockMarketRoundTransaction,
    cancelStockCorporateAction,
    claimTradableStockPrice,
    confirmPlayerTrade,
    createStockCorporateAction,
    createStockDisclosure,
    getClient,
    getDb,
    initServerless,
    listStockDisclosures,
    PlayerTradeError,
  } = await import("../../../dist/index.js");
  const { ObjectId } = await import("mongodb");
  initServerless({ uri: TEST_URI, dbName: TEST_DB_NAME });
  const db = await getDb();
  const client = await getClient();
  t.after(async () => {
    await db.dropDatabase();
    await client.close();
    delete globalThis.__sharedDbClientPromise;
  });

  await assert.rejects(
    applyStockMarketRoundTransaction(
      roundInput(
        "2098-12-31 23:00",
        new Date("2098-12-31T23:01:00+09:00"),
        (current) => ({
          price: current.price,
          referencePrice: current.referencePrice ?? current.price,
          eventText: "blocked before READY",
          eventTier: "routine",
          basePercent: 0,
          flowPercent: 0,
          disclosurePercent: 0,
          consumeFlow: false,
        }),
      ),
    ),
    /NOVEX_2_MIGRATION_NOT_READY/,
  );
  assert.equal(
    await db.collection("stock_market_state").countDocuments({}),
    0,
  );

  await db.collection("stock_market_migration_readiness").insertOne({
    _id: "novex-2",
    version: 2,
    status: "READY",
    attemptId: "test-ready",
    sourcePlanFingerprint: "test-source-plan",
    readyPlanFingerprint: "test-ready-plan",
    startedAt: new Date("2098-12-31T09:00:00+09:00"),
    completedAt: new Date("2098-12-31T10:00:00+09:00"),
    updatedAt: new Date("2098-12-31T10:00:00+09:00"),
  });

  await db.collection("stock_prices").insertMany(
    TICKERS.map((ticker) => ({
      ticker,
      price: 100,
      prevPrice: 100,
      referencePrice: 100,
      tradeRevision: 0,
      cumulativeSplitFactor: 1,
      cumulativeCapitalIncreaseFactor: 1,
    })),
  );
  await db.collection("stock_holdings").insertOne({
    characterId: "holder",
    ticker: "RO0",
    shares: 10,
    avgPrice: 100,
    updatedAt: new Date("2099-01-01T09:00:00+09:00"),
  });
  await db.collection("stock_order_flow").insertOne({
    operationKey: "rights-flow",
    characterId: "holder",
    ticker: "RO0",
    side: "BUY",
    shares: 10,
    price: 100,
    occurredAt: new Date("2099-01-01T12:00:00+09:00"),
  });

  await db.collection("stock_prices").insertOne({
    ticker: "LOW",
    price: 0.01,
    prevPrice: 0.01,
    referencePrice: 0.01,
    tradeRevision: 0,
    cumulativeSplitFactor: 1,
    cumulativeCapitalIncreaseFactor: 1,
  });
  await db.collection("stock_holdings").insertOne({
    characterId: "low-holder",
    ticker: "LOW",
    shares: 1,
    avgPrice: 0.01,
    updatedAt: new Date("2099-01-01T09:00:00+09:00"),
  });
  const unsafeSession = client.startSession();
  await assert.rejects(
    unsafeSession.withTransaction(() =>
      createStockCorporateAction({
        _id: "unsafe-rights-action",
        type: "RIGHTS_OFFERING",
        ticker: "LOW",
        factor: 2,
        reason: "정밀도 위험 검증",
        priceAdjustmentPercent: -35,
        announceSlotKey: "2099-01-01 13:00",
        executeSlotKey: "2099-01-01 18:00",
        status: "SCHEDULED",
        createdById: "gm",
        createdAt: new Date("2099-01-01T09:00:00+09:00"),
        updatedAt: new Date("2099-01-01T09:00:00+09:00"),
      }, unsafeSession),
    ),
    /RIGHTS_OFFERING_PRICE_PRECISION_UNSAFE/,
  );
  await unsafeSession.endSession();
  assert.equal(
    await db.collection("stock_corporate_actions").countDocuments({
      _id: "unsafe-rights-action",
    }),
    0,
  );
  assert.equal(
    (await db.collection("stock_prices").findOne({ ticker: "LOW" }))
      ?.corporateActionReservationId,
    undefined,
  );

  const unsafeAnnouncementCreateSession = client.startSession();
  await unsafeAnnouncementCreateSession.withTransaction(async () => {
    await createStockCorporateAction({
      _id: "unsafe-at-announcement",
      type: "RIGHTS_OFFERING",
      ticker: "RO8",
      factor: 2,
      reason: "발표 직전 정밀도 재검증",
      priceAdjustmentPercent: -35,
      announceSlotKey: "2099-01-01 13:00",
      executeSlotKey: "2099-01-01 18:00",
      status: "SCHEDULED",
      createdById: "gm",
      createdAt: new Date("2099-01-01T09:00:00+09:00"),
      updatedAt: new Date("2099-01-01T09:00:00+09:00"),
    }, unsafeAnnouncementCreateSession);
    await createStockDisclosure({
      id: "unsafe-at-announcement-followup",
      title: "실행 실패 시 취소될 후속 호재",
      body: "유상증자가 실행된 경우에만 공개됩니다.",
      kind: "PRICE",
      status: "SCHEDULED",
      source: "GM",
      effects: [{
        scope: "TICKER",
        ticker: "RO8",
        changePercent: 25,
        structural: true,
      }],
      slotKey: "2099-01-01 23:00",
      publishAt: new Date("2099-01-01T23:00:00+09:00"),
      ownerCorporateActionId: "unsafe-at-announcement",
      createdById: "gm",
      now: new Date("2099-01-01T09:00:00+09:00"),
    }, unsafeAnnouncementCreateSession);
  });
  await unsafeAnnouncementCreateSession.endSession();
  await db.collection("stock_prices").updateOne(
    { ticker: "RO8" },
    { $set: { price: 0.01, referencePrice: 0.01 } },
  );
  const unsafeAnnouncementSession = client.startSession();
  assert.equal(
    await unsafeAnnouncementSession.withTransaction(() =>
      announceStockRightsOffering(
        "unsafe-at-announcement",
        new Date("2099-01-01T13:01:00+09:00"),
        unsafeAnnouncementSession,
      ),
    ),
    true,
  );
  await unsafeAnnouncementSession.endSession();
  const rejectedAtAnnouncement = await db
    .collection("stock_corporate_actions")
    .findOne({ _id: "unsafe-at-announcement" });
  assert.equal(rejectedAtAnnouncement?.status, "ERROR");
  assert.match(
    rejectedAtAnnouncement?.failureReason ?? "",
    /RIGHTS_OFFERING_PRICE_PRECISION_UNSAFE/,
  );
  const releasedUnsafePrice = await db
    .collection("stock_prices")
    .findOne({ ticker: "RO8" });
  assert.equal(releasedUnsafePrice?.corporateActionReservationId, undefined);
  assert.equal(releasedUnsafePrice?.corporateActionHaltId, undefined);
  assert.notEqual(releasedUnsafePrice?.isTradingHalted, true);
  for (const suffix of ["announcement", "execution"]) {
    assert.equal(
      (
        await db.collection("stock_disclosures").findOne({
          _id: `stock-disclosure:corporate-action:unsafe-at-announcement:${suffix}`,
        })
      )?.status,
      "CANCELLED",
    );
  }
  assert.equal(
    (
      await db.collection("stock_disclosures").findOne({
        _id: "unsafe-at-announcement-followup",
      })
    )?.status,
    "CANCELLED",
  );
  assert.equal(
    await db.collection("integration_outbox").countDocuments({
      dedupeKey:
        "stock:rights-offering:unsafe-at-announcement:safety-rejected",
    }),
    1,
  );
  await db.collection("stock_prices").updateOne(
    { ticker: "RO8" },
    { $set: { price: 100, referencePrice: 100 } },
  );

  for (const [actionId, ticker, haltBeforeCancel, cancelAt] of [
    ["cancel-scheduled-rights", "RO7", false, "2099-01-01T10:00:00+09:00"],
    ["cancel-overdue-unannounced-rights", "RO5", false, "2099-01-01T14:00:00+09:00"],
    ["cancel-halted-rights", "RO6", true, "2099-01-01T13:02:00+09:00"],
  ]) {
    const setupCancelSession = client.startSession();
    await setupCancelSession.withTransaction(async () => {
      await createStockCorporateAction({
        _id: actionId,
        type: "RIGHTS_OFFERING",
        ticker,
        factor: 2,
        reason: "취소 연쇄 검증",
        priceAdjustmentPercent: 0,
        announceSlotKey: "2099-01-01 13:00",
        executeSlotKey: "2099-01-01 18:00",
        status: "SCHEDULED",
        createdById: "gm",
        createdAt: new Date("2099-01-01T09:00:00+09:00"),
        updatedAt: new Date("2099-01-01T09:00:00+09:00"),
      }, setupCancelSession);
      await createStockDisclosure({
        id: `${actionId}:followup`,
        title: "기업행동 연계 후속 공시",
        body: "기업행동 취소 시 함께 취소됩니다.",
        kind: "PRICE",
        status: "SCHEDULED",
        source: "GM",
        effects: [{
          scope: "TICKER",
          ticker,
          changePercent: 25,
          structural: true,
        }],
        slotKey: "2099-01-01 23:00",
        publishAt: new Date("2099-01-01T23:00:00+09:00"),
        ownerCorporateActionId: actionId,
        createdById: "gm",
        now: new Date("2099-01-01T09:00:00+09:00"),
      }, setupCancelSession);
    });
    await setupCancelSession.endSession();
    if (haltBeforeCancel) {
      const haltSession = client.startSession();
      await haltSession.withTransaction(() =>
        announceStockRightsOffering(
          actionId,
          new Date("2099-01-01T13:01:00+09:00"),
          haltSession,
        ),
      );
      await haltSession.endSession();
      // 실제 회차에서는 announce와 INFO 공개가 같은 transaction이다. 직접 helper를
      // 호출한 fixture도 같은 HALTED 공개 상태로 맞춘다.
      await db.collection("stock_disclosures").updateOne(
        {
          _id: `stock-disclosure:corporate-action:${actionId}:announcement`,
          status: "SCHEDULED",
        },
        {
          $set: {
            status: "PUBLISHED",
            publishedAt: new Date("2099-01-01T13:01:00+09:00"),
            updatedAt: new Date("2099-01-01T13:01:00+09:00"),
          },
        },
      );
    }
    const cancelSession = client.startSession();
    const cancelled = await cancelSession.withTransaction(() =>
      cancelStockCorporateAction(
        actionId,
        new Date(cancelAt),
        cancelSession,
      ),
    );
    await cancelSession.endSession();
    assert.equal(cancelled?.status, "CANCELLED");
    assert.equal(
      (
        await db.collection("stock_disclosures").findOne({
          _id: `${actionId}:followup`,
        })
      )?.status,
      "CANCELLED",
    );
    const releasedPrice = await db
      .collection("stock_prices")
      .findOne({ ticker });
    assert.equal(releasedPrice?.corporateActionReservationId, undefined);
    assert.equal(releasedPrice?.corporateActionHaltId, undefined);
    assert.notEqual(releasedPrice?.isTradingHalted, true);
    assert.equal(
      await db.collection("stock_disclosures").countDocuments({
        _id: `stock-disclosure:corporate-action:${actionId}:abort`,
        status: "PUBLISHED",
      }),
      haltBeforeCancel ? 1 : 0,
    );
  }

  const createSession = client.startSession();
  await createSession.withTransaction(async () => {
    await createStockCorporateAction({
      _id: "rights-action",
      type: "RIGHTS_OFFERING",
      ticker: "RO0",
      factor: 2,
      reason: "신규 시설 투자",
      priceAdjustmentPercent: 20,
      announceSlotKey: "2099-01-01 13:00",
      executeSlotKey: "2099-01-01 18:00",
      status: "SCHEDULED",
      createdById: "gm",
      createdAt: new Date("2099-01-01T09:00:00+09:00"),
      updatedAt: new Date("2099-01-01T09:00:00+09:00"),
    }, createSession);
    await createStockDisclosure({
      id: "gm-halted-ticker-price",
      title: "전략적 투자자 유치",
      body: "주요주주 구성이 변경됩니다.",
      kind: "PRICE",
      status: "SCHEDULED",
      source: "GM",
      effects: [{
        scope: "TICKER",
        ticker: "RO0",
        changePercent: 10,
        structural: true,
      }],
      companyProfileUpdate: {
        majorShareholders: [
          { name: "MrBeast", stakePercent: 35, note: "전략적 투자" },
        ],
      },
      ownerCorporateActionId: "rights-action",
      slotKey: "2099-01-01 13:00",
      publishAt: new Date("2099-01-01T13:00:00+09:00"),
      createdById: "gm",
      now: new Date("2099-01-01T09:00:00+09:00"),
    }, createSession);
    await createStockDisclosure({
      id: "gm-halted-market-price",
      title: "시장 전반 호재",
      body: "시장 전반의 투자 심리가 개선됩니다.",
      kind: "PRICE",
      status: "SCHEDULED",
      source: "GM",
      effects: [{ scope: "MARKET", changePercent: 5, structural: false }],
      slotKey: "2099-01-01 13:00",
      publishAt: new Date("2099-01-01T13:00:00+09:00"),
      createdById: "gm",
      now: new Date("2099-01-01T09:00:00+09:00"),
    }, createSession);
    await createStockDisclosure({
      id: "rights-action-future-followup",
      title: "완료 뒤 취소 가능한 연계 후속 공시",
      body: "유상증자는 유지하고 미공개 후속 공시만 취소합니다.",
      kind: "PRICE",
      status: "SCHEDULED",
      source: "GM",
      effects: [{
        scope: "TICKER",
        ticker: "RO0",
        changePercent: 25,
        structural: true,
      }],
      ownerCorporateActionId: "rights-action",
      slotKey: "2099-02-01 09:00",
      publishAt: new Date("2099-02-01T09:00:00+09:00"),
      createdById: "gm",
      now: new Date("2099-01-01T09:00:00+09:00"),
    }, createSession);
  });
  await createSession.endSession();

  const publicBeforeAnnouncement = await listStockDisclosures({
    now: new Date("2099-01-01T09:30:00+09:00"),
    publicOnly: true,
    limit: 100,
  });
  assert.equal(
    publicBeforeAnnouncement.some(
      (row) =>
        row._id.startsWith("stock-disclosure:corporate-action:rights-action") ||
        row._id.startsWith("gm-halted-"),
    ),
    false,
  );

  const tradeId = new ObjectId();
  await db.collection("player_trades").insertOne({
    _id: tradeId,
    kind: "EXCHANGE",
    status: "OPEN",
    revision: 1,
    initiator: {
      userId: new ObjectId().toString(),
      displayName: "holder-user",
      characterId: "holder",
      characterCodename: "HOLDER",
    },
    counterparty: {
      userId: new ObjectId().toString(),
      displayName: "counterparty-user",
      characterId: new ObjectId().toString(),
      characterCodename: "COUNTERPARTY",
    },
    initiatorOffer: {
      credits: 0,
      items: [],
      stocks: [{ ticker: "RO0", shares: 4 }],
    },
    counterpartyOffer: { credits: 0, items: [], stocks: [] },
    initiatorConfirmedRevision: 1,
    createdAt: new Date("2099-01-01T12:00:00+09:00"),
    updatedAt: new Date("2099-01-01T12:00:00+09:00"),
  });

  const announcementSession = client.startSession();
  const competingConfirmSession = client.startSession();
  announcementSession.startTransaction();
  assert.equal(
    await announceStockRightsOffering(
      "rights-action",
      new Date("2099-01-01T13:01:00+09:00"),
      announcementSession,
    ),
    true,
  );
  let confirmStarted;
  const confirmDidStart = new Promise((resolve) => {
    confirmStarted = resolve;
  });
  const competingConfirm = competingConfirmSession.withTransaction(async () => {
    confirmStarted();
    return confirmPlayerTrade(
      tradeId.toString(),
      (await db.collection("player_trades").findOne({ _id: tradeId }))
        .counterparty.userId,
      1,
      { id: "counterparty", name: "counterparty-user" },
      competingConfirmSession,
    );
  });
  await confirmDidStart;
  await new Promise((resolve) => setImmediate(resolve));
  await announcementSession.commitTransaction();
  await assert.rejects(
    competingConfirm,
    (error) =>
      error instanceof PlayerTradeError &&
      ["TRADE_NOT_OPEN", "STOCK_TRADING_HALTED", "TRADE_REVISION_CONFLICT"]
        .includes(error.code),
  );
  await Promise.all([
    announcementSession.endSession(),
    competingConfirmSession.endSession(),
  ]);
  const cancelledTrade = await db.collection("player_trades").findOne({
    _id: tradeId,
  });
  assert.equal(cancelledTrade?.status, "CANCELLED");
  assert.equal(cancelledTrade?.revision, 2);
  assert.equal(cancelledTrade?.cancellationReason, "RIGHTS_OFFERING_ANNOUNCED");
  assert.equal(cancelledTrade?.cancellationContextId, "rights-action");
  assert.equal(cancelledTrade?.initiatorConfirmedRevision, undefined);
  assert.equal(
    (await db.collection("stock_corporate_actions").findOne({
      _id: "rights-action",
    }))?.cancelledOpenTradeCount,
    1,
  );

  const steady = (current) => ({
    price: current.price,
    referencePrice: current.referencePrice ?? current.price,
    eventText: "steady",
    eventTier: "routine",
    basePercent: 0,
    flowPercent: 0,
    disclosurePercent: 0,
    consumeFlow: true,
  });
  await applyStockMarketRoundTransaction(
    roundInput(
      "2099-01-01 13:00",
      new Date("2099-01-01T13:01:00+09:00"),
      steady,
    ),
  );
  const halted = await db.collection("stock_prices").findOne({ ticker: "RO0" });
  assert.equal(halted?.isTradingHalted, true);
  assert.equal(halted?.corporateActionHaltId, "rights-action");
  assert.equal(halted?.price, 100);
  assert.equal(
    (await db.collection("stock_disclosures").findOne({
      _id: "stock-disclosure:corporate-action:rights-action:announcement",
    }))?.status,
    "PUBLISHED",
  );
  const publicAfterAnnouncement = await listStockDisclosures({
    now: new Date("2099-01-01T13:02:00+09:00"),
    publicOnly: true,
    limit: 100,
  });
  assert.equal(
    publicAfterAnnouncement.some(
      (row) =>
        row._id ===
        "stock-disclosure:corporate-action:rights-action:announcement",
    ),
    true,
  );
  assert.equal(
    publicAfterAnnouncement.some((row) => row._id.startsWith("gm-halted-")),
    false,
  );
  const haltOutbox = await db.collection("integration_outbox").findOne({
    dedupeKey: "stock:rights-offering:rights-action:halt",
  });
  assert.equal(haltOutbox?.partitionKey, "stock:RO0");
  assert.equal(haltOutbox?.payload?.eventKind, "HALT");
  assert.equal(
    (await db.collection("stock_order_flow").findOne({ operationKey: "rights-flow" }))?.consumedSlotKey,
    undefined,
  );
  for (const id of ["gm-halted-ticker-price", "gm-halted-market-price"]) {
    const deferred = await db.collection("stock_disclosures").findOne({
      _id: id,
    });
    assert.equal(deferred?.status, "SCHEDULED");
    assert.equal(deferred?.deferredByCorporateActionId, "rights-action");
  }
  assert.equal(
    await db.collection("stock_company_profiles").countDocuments({}),
    0,
  );

  const tradeSession = client.startSession();
  await assert.rejects(
    tradeSession.withTransaction(() => claimTradableStockPrice("RO0", tradeSession)),
    /STOCK_TRADING_HALTED/,
  );
  await tradeSession.endSession();

  await assert.rejects(
    applyStockMarketRoundTransaction(
      roundInput(
        "2099-01-01 18:00",
        new Date("2099-01-01T18:01:00+09:00"),
        () => { throw new Error("forced rollback"); },
      ),
    ),
    /forced rollback/,
  );
  assert.deepEqual(
    await db.collection("stock_holdings").findOne(
      { characterId: "holder", ticker: "RO0" },
      { projection: { _id: 0, shares: 1, avgPrice: 1 } },
    ),
    { shares: 10, avgPrice: 100 },
  );
  assert.equal(
    (await db.collection("stock_corporate_actions").findOne({ _id: "rights-action" }))?.status,
    "HALTED",
  );
  assert.equal(
    await db.collection("integration_outbox").countDocuments({
      dedupeKey: "stock:rights-offering:rights-action:resume",
    }),
    0,
  );

  await applyStockMarketRoundTransaction(
    roundInput(
      "2099-01-01 18:00",
      new Date("2099-01-01T18:02:00+09:00"),
      (current, context) => {
        const percent =
          (context.disclosure?.effects[0]?.changePercent ?? 0) / 100;
        return {
          price: Math.round(current.price * (1 + percent) * 100) / 100,
          referencePrice:
            Math.round((current.referencePrice ?? current.price) * (1 + percent) * 100) / 100,
          eventText: context.disclosure?.title ?? "steady",
          eventTier: "scenario",
          basePercent: 0,
          flowPercent: 0,
          disclosurePercent: percent,
          consumeFlow: false,
        };
      },
    ),
  );
  assert.deepEqual(
    await db.collection("stock_holdings").findOne(
      { characterId: "holder", ticker: "RO0" },
      { projection: { _id: 0, shares: 1, avgPrice: 1 } },
    ),
    { shares: 20, avgPrice: 50 },
  );
  const completed = await db.collection("stock_prices").findOne({ ticker: "RO0" });
  assert.equal(completed?.price, 60);
  assert.equal(completed?.referencePrice, 60);
  assert.equal(completed?.cumulativeCapitalIncreaseFactor, 2);
  assert.equal(completed?.isTradingHalted, false);
  assert.equal(completed?.corporateActionHaltId, undefined);
  assert.equal(
    (await db.collection("stock_corporate_actions").findOne({ _id: "rights-action" }))?.status,
    "COMPLETED",
  );
  const resumeOutbox = await db.collection("integration_outbox").findOne({
    dedupeKey: "stock:rights-offering:rights-action:resume",
  });
  assert.equal(resumeOutbox?.partitionKey, "stock:RO0");
  assert.equal(resumeOutbox?.payload?.eventKind, "RESUME");

  for (const id of ["gm-halted-ticker-price", "gm-halted-market-price"]) {
    assert.equal(
      (await db.collection("stock_disclosures").findOne({ _id: id }))?.status,
      "SCHEDULED",
    );
  }
  await applyStockMarketRoundTransaction(
    roundInput(
      "2099-01-01 23:00",
      new Date("2099-01-01T23:01:00+09:00"),
      (current, context) => {
        const percent =
          (context.disclosure?.effects[0]?.changePercent ?? 0) / 100;
        return {
          price: Math.round(current.price * (1 + percent) * 100) / 100,
          referencePrice:
            Math.round(
              (current.referencePrice ?? current.price) *
                (1 + (context.structuralDisclosurePercent ?? 0)) *
                100,
            ) / 100,
          eventText: context.disclosure?.title ?? "steady",
          eventTier: "scenario",
          basePercent: 0,
          flowPercent: 0,
          disclosurePercent: percent,
          consumeFlow: false,
        };
      },
    ),
  );
  assert.equal(
    (await db.collection("stock_prices").findOne({ ticker: "RO0" }))?.price,
    66,
  );
  for (const id of ["gm-halted-ticker-price", "gm-halted-market-price"]) {
    assert.equal(
      (await db.collection("stock_disclosures").findOne({ _id: id }))?.status,
      "PUBLISHED",
    );
  }
  assert.deepEqual(
    await db.collection("stock_company_profiles").findOne(
      { _id: "RO0" },
      { projection: { _id: 0, majorShareholders: 1, sourceDisclosureId: 1 } },
    ),
    {
      majorShareholders: [
        { name: "MrBeast", stakePercent: 35, note: "전략적 투자" },
      ],
      sourceDisclosureId: "gm-halted-ticker-price",
    },
  );
  await applyStockMarketRoundTransaction(
    roundInput(
      "2099-01-02 09:00",
      new Date("2099-01-02T09:01:00+09:00"),
      steady,
    ),
  );
  assert.equal(
    (await db.collection("stock_prices").findOne({ ticker: "RO0" }))?.price,
    66,
  );
  assert.equal(
    await db.collection("stock_price_history").countDocuments({
      disclosureIds: "gm-halted-ticker-price",
    }),
    1,
  );

  const backlog = [
    ["rights-backlog-acquisition", "2099-01-02 13:00", 70],
    ["rights-backlog-followup-1", "2099-01-02 18:00", 25],
    ["rights-backlog-followup-2", "2099-01-02 23:00", 25],
    ["rights-backlog-followup-3", "2099-01-03 09:00", 25],
  ];
  const backlogSession = client.startSession();
  await backlogSession.withTransaction(async () => {
    for (const [id, slotKey, changePercent] of backlog) {
      await createStockDisclosure({
        id,
        title: id,
        body: `${changePercent}% 순차 호재`,
        kind: "PRICE",
        status: "SCHEDULED",
        source: "GM",
        effects: [{
          scope: "TICKER",
          ticker: "RO0",
          changePercent,
          structural: true,
        }],
        slotKey,
        publishAt: new Date(`${slotKey.replace(" ", "T")}:00+09:00`),
        createdById: "gm",
        now: new Date("2099-01-01T09:00:00+09:00"),
      }, backlogSession);
    }
    await db.collection("stock_disclosures").updateMany(
      { _id: { $in: backlog.map(([id]) => id) } },
      {
        $set: {
          deferredByCorporateActionId: "rights-action",
          deferredAt: new Date("2099-01-02T09:01:00+09:00"),
        },
      },
      { session: backlogSession },
    );
  });
  await backlogSession.endSession();

  const expectedBacklogPrices = [112.2, 140.25, 175.31, 219.14];
  for (const [index, [, slotKey]] of backlog.entries()) {
    await applyStockMarketRoundTransaction(
      roundInput(
        slotKey,
        new Date(`${slotKey.replace(" ", "T")}:01:00+09:00`),
        (current, context) => {
          const percent =
            (context.disclosure?.effects[0]?.changePercent ?? 0) / 100;
          return {
            price: Math.round(current.price * (1 + percent) * 100) / 100,
            referencePrice:
              Math.round(
                (current.referencePrice ?? current.price) *
                  (1 + (context.structuralDisclosurePercent ?? 0)) *
                  100,
              ) / 100,
            eventText: context.disclosure?.title ?? "steady",
            eventTier: "scenario",
            basePercent: 0,
            flowPercent: 0,
            disclosurePercent: percent,
            consumeFlow: false,
          };
        },
      ),
    );
    assert.equal(
      (await db.collection("stock_prices").findOne({ ticker: "RO0" }))?.price,
      expectedBacklogPrices[index],
    );
    const statuses = await db.collection("stock_disclosures")
      .find(
        { _id: { $in: backlog.map(([id]) => id) } },
        { projection: { _id: 1, status: 1 } },
      )
      .sort({ _id: 1 })
      .toArray();
    assert.equal(
      statuses.filter((item) => item.status === "PUBLISHED").length,
      index + 1,
    );
    assert.deepEqual(
      (
        await db.collection("stock_price_history").findOne({
          ticker: "RO0",
          slotKey,
          source: "scheduled",
        })
      )?.disclosureIds,
      [backlog[index][0]],
    );
  }

  const stopFollowupsSession = client.startSession();
  const completedWithStoppedFollowups = await stopFollowupsSession
    .withTransaction(() =>
      cancelStockCorporateAction(
        "rights-action",
        new Date("2099-01-03T10:00:00+09:00"),
        stopFollowupsSession,
      ),
    );
  await stopFollowupsSession.endSession();
  assert.equal(completedWithStoppedFollowups?.status, "COMPLETED");
  assert.equal(
    completedWithStoppedFollowups?.remainingDisclosuresCancelledCount,
    1,
  );
  assert.equal(
    (
      await db.collection("stock_disclosures").findOne({
        _id: "rights-action-future-followup",
      })
    )?.status,
    "CANCELLED",
  );
  assert.equal(
    (
      await db.collection("stock_disclosures").findOne({
        _id: "gm-halted-ticker-price",
      })
    )?.status,
    "PUBLISHED",
  );
  assert.equal(
    (
      await db.collection("stock_corporate_actions").findOne({
        _id: "rights-action",
      })
    )?.status,
    "COMPLETED",
  );
});
