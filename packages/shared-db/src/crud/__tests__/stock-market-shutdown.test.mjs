import assert from "node:assert/strict";
import test from "node:test";

const TEST_URI = process.env.MONGODB_TEST_URI?.trim();
const HAS_DB = process.env.RUN_DB_INTEGRATION_TESTS === "1" && Boolean(TEST_URI);
const TEST_DB_NAME = `stargate-stock-market-shutdown-${process.pid}`;
const TICKERS = ["ART", "BPE", "GN3", "MSF", "SPZ", "SSR", "STM", "TWS", "VFP"];
const DECLINES = [55, 58, 70, 40, 62, 65, 50, 45, 47];

test("영구 폐장은 매수/이체를 막고 폭락을 정확히 한 번 적용한 뒤 매도만 허용한다", {
  skip: !HAS_DB && "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI replica-set 필요",
}, async (t) => {
  const { ObjectId } = await import("mongodb");
  const {
    applyDueStockMarketShutdown,
    applyScheduledStockPriceMutation,
    applyStockMarketRoundTransaction,
    buyHolding,
    claimAdministrativeStockPrice,
    claimCompatibleTradableStockPrice,
    createStockDisclosure,
    createStockScheduledEvent,
    getClient,
    getDb,
    getStockMarketSnapshot,
    initServerless,
    payNextPendingStockDividendEntitlement,
    prepareMrBeastSodaStockImpactDemand,
    incrementMrBeastSodaStockImpactDemand,
    consumeMrBeastSodaStockImpactDemand,
    recordStockOrderFlow,
    scheduleStockMarketShutdown,
    sellHolding,
    setStockTradingHalted,
    updateStockPrice,
    upsertStockMarketCalendarException,
    StockMarketAutomationStoppedError,
    StockMarketTradeClaimError,
  } = await import("../../../dist/index.js");
  const {
    applyNovexStockMarketTick,
    applyScheduledStockTick,
  } = await import("../../../../core/dist/operations/stocks-tick.js");

  initServerless({ uri: TEST_URI, dbName: TEST_DB_NAME });
  const db = await getDb();
  const client = await getClient();
  const futureDay = new Date(Date.now() + 3 * 24 * 60 * 60 * 1_000);
  const kstDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(futureDay);
  const executeAt = new Date(`${kstDate}T18:00:00+09:00`);
  const scheduledAt = new Date(executeAt.getTime() - 30 * 60 * 1_000);
  const beforeShutdown = new Date(executeAt.getTime() - 20 * 60 * 1_000);
  const afterShutdown = new Date(executeAt.getTime() + 60 * 60 * 1_000);
  const reason = "파리 사태로 인한 쇼크";
  const policyNotice =
    "NOVEX 주식 매수는 영구적으로 금지됩니다. 기존 보유 주식은 매도만 가능합니다.\n\n매수 영구 중단 · 가격 영구 동결 · 보유 주식 매도만 가능";
  const declines = TICKERS.map((ticker, index) => ({
    ticker,
    dropPercent: DECLINES[index],
  }));
  const seasonOwnerId = new ObjectId();
  const seasonCharacterId = new ObjectId();
  const sodaImpactKey = {
    eventId: "shutdown-test",
    configVersion: 1,
    startAt: new Date(scheduledAt.getTime() - 60 * 60 * 1_000),
    endAt: new Date(afterShutdown.getTime() + 60 * 60 * 1_000),
  };

  t.after(async () => {
    await db.dropDatabase();
    await client.close();
  });
  await db.collection("stock_price_history").createIndex(
    { operationKey: 1 },
    {
      unique: true,
      partialFilterExpression: { operationKey: { $type: "string" } },
    },
  );
  await db.collection("integration_outbox").createIndex(
    { dedupeKey: 1 },
    { unique: true },
  );
  await db.collection("stock_market_migration_readiness").insertOne({
    _id: "novex-2",
    status: "READY",
    runtimeRevision: 0,
  });
  await db.collection("stock_market_state").insertOne({
    _id: "novex",
    status: "OPEN",
    tradingDate: kstDate,
    opensAt: new Date(`${kstDate}T09:00:00+09:00`),
    closesAt: new Date(`${kstDate}T23:00:00+09:00`),
    nextSlotAt: executeAt,
    delayed: false,
    tradeRevision: 0,
    updatedAt: scheduledAt,
  });
  await db.collection("stock_prices").insertMany(TICKERS.map((ticker, index) => ({
    ticker,
    price: 100 + index,
    prevPrice: 100 + index,
    referencePrice: 100 + index,
    eventText: "seed",
    lastUpdate: `${kstDate} 13:00`,
    tradeRevision: 0,
  })));
  await db.collection("users").insertOne({
    _id: seasonOwnerId,
    displayName: "season-owner",
  });
  await db.collection("characters").insertOne({
    _id: seasonCharacterId,
    ownerId: seasonOwnerId.toString(),
    codename: "SEASON-HOLDER",
  });
  await db.collection("stock_holdings").insertOne({
    characterId: seasonCharacterId.toString(),
    ticker: "TWS",
    shares: 1,
    avgPrice: 107,
    updatedAt: scheduledAt,
  });
  await db.collection("stock_investment_seasons").insertOne({
    _id: "shutdown-season",
    startsAt: new Date(scheduledAt.getTime() - 24 * 60 * 60 * 1_000),
    endsAt: new Date(executeAt.getTime() + 24 * 60 * 60 * 1_000),
    status: "ACTIVE",
    createdAt: new Date(scheduledAt.getTime() - 24 * 60 * 60 * 1_000),
  });
  await db.collection("stock_season_performance").insertOne({
    _id: `stock-season-performance:shutdown-season:${seasonCharacterId}`,
    seasonId: "shutdown-season",
    characterId: seasonCharacterId.toString(),
    codename: "SEASON-HOLDER",
    linkedReturn: 0,
    investedValue: 107,
    buyCount: 1,
    exposureSlots: 8,
    eligible: true,
    currentPortfolioValue: 107,
    lastValuedAt: scheduledAt,
    lastValuedSlotKey: `${kstDate} 13:00`,
    updatedAt: scheduledAt,
  });
  await db.collection("stock_market_preferences").insertOne({
    _id: "shutdown-disclosure-subscriber",
    userId: seasonOwnerId.toString(),
    alerts: [{
      id: "shutdown-disclosure-alert",
      kind: "DISCLOSURE",
      enabled: true,
    }],
    updatedAt: scheduledAt,
  });
  await prepareMrBeastSodaStockImpactDemand(sodaImpactKey);

  const scheduleInput = {
    executeAt,
    reason,
    declines,
    createdById: "gm-test",
    now: scheduledAt,
  };
  await assert.rejects(
    scheduleStockMarketShutdown({
      ...scheduleInput,
      executeAt: scheduledAt,
    }),
    /executeAt must be in the future/,
  );
  const scheduled = await scheduleStockMarketShutdown(scheduleInput);
  assert.equal(scheduled.status, "SCHEDULED");
  assert.equal(scheduled.buysBlockedAt.getTime(), scheduledAt.getTime());
  assert.deepEqual(await scheduleStockMarketShutdown({
    ...scheduleInput,
    now: new Date(scheduledAt.getTime() + 60_000),
  }), scheduled);

  async function claim(side, now, ticker = "TWS", novexV2Enabled = true) {
    const session = client.startSession();
    try {
      let price;
      await session.withTransaction(async () => {
        price = await claimCompatibleTradableStockPrice(ticker, now, session, {
          novexV2Enabled,
          side,
        });
      });
      return price;
    } finally {
      await session.endSession();
    }
  }

  for (const side of ["BUY", "TRANSFER"]) {
    await assert.rejects(
      claim(side, beforeShutdown),
      (error) => error instanceof StockMarketTradeClaimError && error.code === "MARKET_SELL_ONLY",
    );
  }
  await assert.rejects(
    claim("BUY", beforeShutdown, "TWS", false),
    (error) => error instanceof StockMarketTradeClaimError && error.code === "MARKET_SELL_ONLY",
  );
  assert.equal(
    (await claim("SELL", beforeShutdown)).ticker,
    "TWS",
  );
  await assert.rejects(
    claim("SELL", executeAt),
    (error) => error instanceof StockMarketTradeClaimError && error.code === "MARKET_SHUTDOWN_PENDING",
  );

  // 폭락 transaction 후단의 disclosure 충돌을 주입해 가격·이력·상태·marker rollback을 확인한다.
  await db.collection("stock_disclosures").insertOne({
    _id: "stock-market-shutdown:novex",
    title: "fault",
  });
  await assert.rejects(
    applyDueStockMarketShutdown({ now: executeAt }),
    (error) => error?.code === 11000,
  );
  assert.equal((await db.collection("stock_prices").findOne({ ticker: "TWS" })).price, 107);
  assert.equal(await db.collection("stock_price_history").countDocuments(), 0);
  assert.equal((await db.collection("stock_market_shutdown").findOne({ _id: "novex" })).status, "SCHEDULED");
  assert.equal((await db.collection("stock_market_state").findOne({ _id: "novex" })).status, "OPEN");
  assert.equal(await db.collection("integration_outbox").countDocuments(), 0);
  await db.collection("stock_disclosures").deleteOne({ _id: "stock-market-shutdown:novex" });
  await db.collection("stock_prices").updateOne(
    { ticker: "TWS" },
    {
      $set: {
        isTradingHalted: true,
        cooldownUntil: new Date(afterShutdown.getTime() + 60_000),
        cooldownReason: "이전 급등락 냉각",
        corporateActionReservationId: "old-reservation",
        corporateActionHaltId: "old-halt",
        corporateActionHaltReason: "old-halt",
        corporateActionResumeSlotKey: `${kstDate} 23:00`,
      },
    },
  );

  const concurrent = await Promise.all([
    applyDueStockMarketShutdown({ now: executeAt }),
    applyDueStockMarketShutdown({ now: executeAt }),
  ]);
  assert.deepEqual(
    concurrent.map((result) => result.status).sort(),
    ["ALREADY_COMPLETED", "APPLIED"],
  );
  assert.equal(await db.collection("stock_price_history").countDocuments(), TICKERS.length);
  for (const history of await db.collection("stock_price_history").find().toArray()) {
    assert.equal(history.basePercent, 0);
    assert.equal(history.flowPercent, 0);
    assert.equal(
      history.disclosurePercent,
      -declines.find((decline) => decline.ticker === history.ticker).dropPercent / 100,
    );
  }
  assert.equal(await db.collection("stock_disclosures").countDocuments({
    _id: "stock-market-shutdown:novex",
    status: "PUBLISHED",
    body: `${reason}\n\n${policyNotice}`,
  }), 1);
  const shutdownOutbox = await db.collection("integration_outbox").findOne({
    dedupeKey: "stock:market-shutdown:novex:shock-disclosure",
  });
  assert.equal(await db.collection("integration_outbox").countDocuments(), 1);
  assert.equal(shutdownOutbox.kind, "STOCK_MANUAL_INTERVENTION_WEBHOOK");
  assert.equal(shutdownOutbox.status, "PENDING");
  assert.equal(shutdownOutbox.payload.eventKind, "SHOCK_DISCLOSURE");
  assert.equal(shutdownOutbox.payload.eventText, reason);
  assert.equal(shutdownOutbox.payload.marketPolicyNotice, policyNotice);
  assert.equal(shutdownOutbox.payload.items.length, TICKERS.length);
  const completedPlan = await db.collection("stock_market_shutdown").findOne({ _id: "novex" });
  assert.equal(completedPlan.status, "COMPLETED");
  const closedState = await db.collection("stock_market_state").findOne({ _id: "novex" });
  assert.equal(closedState.status, "CLOSED");
  assert.equal(closedState.tradingMode, "SELL_ONLY");
  assert.equal(closedState.nextSlotAt, undefined);
  const snapshot = await getStockMarketSnapshot(afterShutdown);
  assert.equal(snapshot.shutdownPlan.status, "COMPLETED");
  assert.equal(snapshot.state.tradingMode, "SELL_ONLY");
  assert.equal(snapshot.prices.find((price) => price.ticker === "TWS").price, 58.85);
  assert.equal(snapshot.prices.find((price) => price.ticker === "TWS").isTradingHalted, undefined);
  assert.equal(snapshot.prices.find((price) => price.ticker === "TWS").cooldownUntil, undefined);
  assert.equal(snapshot.prices.find((price) => price.ticker === "TWS").corporateActionHaltId, undefined);
  const finalizedSeason = await db.collection("stock_investment_seasons").findOne({
    _id: "shutdown-season",
  });
  assert.equal(finalizedSeason.status, "FINALIZED");
  assert.equal(finalizedSeason.endsAt.getTime(), executeAt.getTime());
  const finalPerformance = await db.collection("stock_season_performance").findOne({
    _id: `stock-season-performance:shutdown-season:${seasonCharacterId}`,
  });
  assert.equal(finalPerformance.currentPortfolioValue, 58.85);
  assert.equal(Math.round(finalPerformance.linkedReturn * 100), -45);
  assert.equal(finalPerformance.rank, 1);
  const shutdownNotification = await db.collection("notifications").findOne({
    dedupeKey: `stock:disclosure:${seasonOwnerId}:shutdown-disclosure-alert:stock-market-shutdown:novex`,
  });
  assert.equal(await db.collection("notifications").countDocuments(), 1);
  assert.equal(shutdownNotification.type, "STOCK");
  assert.equal(shutdownNotification.title, reason);
  assert.equal(shutdownNotification.message, `${reason}\n\n${policyNotice}`);
  await db.collection("stock_dividend_entitlements").insertOne({
    _id: "shutdown-pending-dividend",
    actionId: "must-not-pay",
    characterId: seasonCharacterId.toString(),
    shares: 1,
    amount: 10,
    status: "PENDING",
    creditRequestId: "shutdown-pending-dividend-credit",
    createdAt: executeAt,
  });
  await assert.rejects(
    payNextPendingStockDividendEntitlement(),
    StockMarketAutomationStoppedError,
  );
  assert.equal(
    (await db.collection("stock_dividend_entitlements").findOne({
      _id: "shutdown-pending-dividend",
    })).status,
    "PENDING",
  );

  for (const [index, ticker] of TICKERS.entries()) {
    const current = await db.collection("stock_prices").findOne({ ticker });
    const expected = Math.max(
      0.01,
      Math.round((100 + index) * (1 - DECLINES[index] / 100) * 100) / 100,
    );
    assert.equal(current.prevPrice, 100 + index);
    assert.equal(current.price, expected);
    assert.equal(current.eventText, reason);
  }

  const finalPrice = (await db.collection("stock_prices").findOne({ ticker: "TWS" })).price;
  const liquidationSession = client.startSession();
  try {
    let sold;
    let recordedFlow;
    await liquidationSession.withTransaction(async () => {
      const price = await claimCompatibleTradableStockPrice(
        "TWS",
        afterShutdown,
        liquidationSession,
        { novexV2Enabled: true, side: "SELL" },
      );
      sold = await sellHolding(
        seasonCharacterId.toString(),
        "TWS",
        1,
        { session: liquidationSession },
      );
      recordedFlow = await recordStockOrderFlow({
        operationKey: "post-freeze-sell",
        characterId: seasonCharacterId.toString(),
        ticker: "TWS",
        side: "SELL",
        shares: 1,
        price: price.price,
        occurredAt: afterShutdown,
      }, liquidationSession);
    });
    assert.equal(sold.ok, true);
    assert.equal(recordedFlow, null);
  } finally {
    await liquidationSession.endSession();
  }
  assert.equal((await db.collection("stock_prices").findOne({ ticker: "TWS" })).price, finalPrice);
  assert.equal(await db.collection("stock_holdings").countDocuments({
    characterId: seasonCharacterId.toString(),
    ticker: "TWS",
  }), 0);
  const mutationSession = client.startSession();
  try {
    for (const mutate of [
      () => setStockTradingHalted("TWS", true, mutationSession),
      () => claimAdministrativeStockPrice("TWS", mutationSession),
      () => updateStockPrice("TWS", 999, "must-not-run", `${kstDate} 19:00`, { session: mutationSession }),
      () => upsertStockMarketCalendarException({
        kstDate,
        isClosed: true,
        reason: "must-not-run",
        createdById: "gm-test",
      }, mutationSession),
      () => createStockDisclosure({
        id: "must-not-run",
        title: "must-not-run",
        body: "must-not-run",
        kind: "INFO",
        status: "PUBLISHED",
        source: "GM",
        effects: [],
        createdById: "gm-test",
        now: afterShutdown,
      }, mutationSession),
      () => createStockScheduledEvent({
        ticker: "TWS",
        kstDate,
        executeAt: afterShutdown,
        changePercent: 1,
        eventText: "must-not-run",
        eventTier: "shock",
        actor: { id: "gm-test", displayName: "GM" },
        now: afterShutdown,
      }, mutationSession),
    ]) {
      await assert.rejects(
        mutationSession.withTransaction(mutate),
        StockMarketAutomationStoppedError,
      );
    }
  } finally {
    await mutationSession.endSession();
  }
  await assert.rejects(
    updateStockPrice("TWS", 999, "standalone-must-not-run", `${kstDate} 19:00`),
    StockMarketAutomationStoppedError,
  );
  await assert.rejects(
    buyHolding(seasonCharacterId.toString(), "TWS", 1, finalPrice),
    StockMarketAutomationStoppedError,
  );
  assert.equal((await db.collection("stock_prices").findOne({ ticker: "TWS" })).price, finalPrice);
  assert.equal(await db.collection("stock_order_flow").countDocuments(), 0);
  assert.equal(await db.collection("stock_season_flows").countDocuments(), 0);
  assert.equal(await db.collection("stock_market_calendar_exceptions").countDocuments(), 0);
  assert.equal(await db.collection("stock_disclosures").countDocuments({ _id: "must-not-run" }), 0);
  assert.equal(await db.collection("stock_scheduled_events").countDocuments(), 0);
  const revisionBeforeStoppedSodaImpact = (
    await db.collection("stock_market_state").findOne({ _id: "novex" })
  ).tradeRevision;
  const sodaSession = client.startSession();
  try {
    let consumed;
    await sodaSession.withTransaction(async () => {
      await incrementMrBeastSodaStockImpactDemand({
        key: sodaImpactKey,
        quantity: 3,
        purchasedAt: afterShutdown,
        session: sodaSession,
      });
      consumed = await consumeMrBeastSodaStockImpactDemand({
        operationKey: "post-freeze-soda-impact",
        now: afterShutdown,
        session: sodaSession,
      });
    });
    assert.deepEqual(consumed, { soldQuantity: 0, eventIds: [] });
  } finally {
    await sodaSession.endSession();
  }
  await prepareMrBeastSodaStockImpactDemand({
    ...sodaImpactKey,
    eventId: "post-freeze-must-not-create",
  });
  const sodaDemand = await db.collection("mrbeast_soda_stock_impact_demand").findOne({
    eventId: sodaImpactKey.eventId,
  });
  assert.equal(sodaDemand.soldQuantity, 0);
  assert.equal(sodaDemand.appliedQuantity, 0);
  assert.equal(await db.collection("mrbeast_soda_stock_impact_demand").countDocuments(), 1);
  assert.equal(
    (await db.collection("stock_market_state").findOne({ _id: "novex" })).tradeRevision,
    revisionBeforeStoppedSodaImpact,
  );

  const historyCount = await db.collection("stock_price_history").countDocuments();
  const disclosureCount = await db.collection("stock_disclosures").countDocuments();
  await assert.rejects(
    applyStockMarketRoundTransaction({
      slotKey: `${kstDate} 13:00`,
      resolveMergedSlotKeys: () => [`${kstDate} 13:00`],
      delayed: false,
      now: beforeShutdown,
      tradingDate: kstDate,
      opensAt: new Date(`${kstDate}T09:00:00+09:00`),
      closesAt: new Date(`${kstDate}T23:00:00+09:00`),
      closeAfterRound: false,
      seeds: TICKERS.map((ticker) => ({ ticker, price: 100 })),
      calculate: () => {
        throw new Error("calculate should not run");
      },
    }),
    StockMarketAutomationStoppedError,
  );
  await assert.rejects(
    applyScheduledStockPriceMutation({
      ticker: "STM",
      operationKey: "legacy-must-not-run",
      initialPrice: 100,
      initialLastUpdateKst: `${kstDate} 12:00`,
      now: beforeShutdown,
      calculate: () => {
        throw new Error("calculate should not run");
      },
    }),
    StockMarketAutomationStoppedError,
  );
  const recovered = await applyNovexStockMarketTick({
    now: beforeShutdown,
    slotKey: `${kstDate} 13:00`,
  });
  const legacy = await applyScheduledStockTick({
    force: true,
    now: beforeShutdown,
    operationId: "must-not-run",
  });
  assert.equal(recovered.marketShutdown, true);
  assert.equal(recovered.skipDiscord, true);
  assert.equal(legacy.marketShutdown, true);
  assert.equal(await db.collection("stock_price_history").countDocuments(), historyCount);
  assert.equal(await db.collection("stock_disclosures").countDocuments(), disclosureCount);
});
