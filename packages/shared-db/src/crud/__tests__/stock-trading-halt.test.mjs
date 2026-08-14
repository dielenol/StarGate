import assert from "node:assert/strict";
import test from "node:test";

const TEST_URI = process.env.MONGODB_TEST_URI?.trim();
const HAS_DB =
  process.env.RUN_DB_INTEGRATION_TESTS === "1" && Boolean(TEST_URI);
const TEST_DB_NAME = `stargate-stock-trading-halt-test-${process.pid}`;

test(
  "거래정지와 gift/confirm 동시 실행은 선커밋 순서를 지키고 실패 transaction 전체를 rollback한다",
  {
    skip:
      !HAS_DB &&
      "RUN_DB_INTEGRATION_TESTS=1 + MONGODB_TEST_URI replica-set 필요",
  },
  async (t) => {
    const { ObjectId } = await import("mongodb");
    const {
      claimTradableStockPrice,
      close,
      confirmPlayerTrade,
      createAndSettleGift,
      createOpenPlayerTrade,
      getClient,
      getDb,
      initServerless,
      PlayerTradeError,
      setStockTradingHalted,
      StockPriceTradeClaimError,
    } = await import("../../../dist/index.js");

    initServerless({ uri: TEST_URI, dbName: TEST_DB_NAME });
    const db = await getDb();
    const prices = db.collection("stock_prices");
    const holdings = db.collection("stock_holdings");
    const balances = db.collection("credit_balances");
    const transactions = db.collection("credit_transactions");
    const trades = db.collection("player_trades");
    const users = db.collection("users");
    const characters = db.collection("characters");
    const marketState = db.collection("stock_market_state");
    const client = await getClient();

    t.after(async () => {
      await db.dropDatabase();
      await close();
    });

    async function seedScenario(label) {
      const ticker = `HALT_${label}`;
      const initiatorUserId = new ObjectId();
      const counterpartyUserId = new ObjectId();
      const initiatorCharacterId = new ObjectId();
      const counterpartyCharacterId = new ObjectId();
      const now = new Date();
      const initiator = {
        userId: initiatorUserId.toString(),
        displayName: `${label}-initiator`,
        characterId: initiatorCharacterId.toString(),
        characterCodename: `${label}-A`,
      };
      const counterparty = {
        userId: counterpartyUserId.toString(),
        displayName: `${label}-counterparty`,
        characterId: counterpartyCharacterId.toString(),
        characterCodename: `${label}-B`,
      };
      await users.insertMany([
        { _id: initiatorUserId, displayName: initiator.displayName, status: "ACTIVE" },
        { _id: counterpartyUserId, displayName: counterparty.displayName, status: "ACTIVE" },
      ]);
      await characters.insertMany([
        {
          _id: initiatorCharacterId,
          ownerId: initiator.userId,
          type: "AGENT",
          tier: "MAIN",
          codename: initiator.characterCodename,
        },
        {
          _id: counterpartyCharacterId,
          ownerId: counterparty.userId,
          type: "AGENT",
          tier: "MAIN",
          codename: counterparty.characterCodename,
        },
      ]);
      await prices.insertOne({
        ticker,
        price: 10,
        prevPrice: 10,
        eventText: "seed",
        lastUpdate: "2026-08-13 12:00",
      });
      await holdings.insertOne({
        characterId: initiator.characterId,
        ticker,
        shares: 10,
        avgPrice: 10,
        updatedAt: now,
      });
      await balances.insertMany([
        { characterId: initiator.characterId, balance: 100, updatedAt: now },
        { characterId: counterparty.characterId, balance: 0, updatedAt: now },
      ]);
      return {
        ticker,
        initiator,
        counterparty,
        offer: {
          credits: 25,
          items: [],
          stocks: [{ ticker, shares: 4 }],
        },
        actor: { id: initiator.userId, name: initiator.displayName },
      };
    }

    async function assertUnmoved(scenario) {
      assert.equal(
        (await balances.findOne({ characterId: scenario.initiator.characterId }))
          .balance,
        100,
      );
      assert.equal(
        (await balances.findOne({ characterId: scenario.counterparty.characterId }))
          .balance,
        0,
      );
      assert.equal(
        (await holdings.findOne({
          characterId: scenario.initiator.characterId,
          ticker: scenario.ticker,
        })).shares,
        10,
      );
      assert.equal(
        await holdings.countDocuments({
          characterId: scenario.counterparty.characterId,
          ticker: scenario.ticker,
        }),
        0,
      );
      assert.equal(
        await transactions.countDocuments({
          characterId: {
            $in: [
              scenario.initiator.characterId,
              scenario.counterparty.characterId,
            ],
          },
        }),
        0,
      );
    }

    const rollbackTicker = "HALT_ROLLBACK";
    await prices.insertOne({
      ticker: rollbackTicker,
      price: 10,
      prevPrice: 10,
      eventText: "seed",
      lastUpdate: "2026-08-13 12:00",
    });
    const rollbackSession = client.startSession();
    try {
      await assert.rejects(
        rollbackSession.withTransaction(async () => {
          await claimTradableStockPrice(rollbackTicker, rollbackSession);
          throw new Error("FAULT_AFTER_CLAIM");
        }),
        /FAULT_AFTER_CLAIM/,
      );
    } finally {
      await rollbackSession.endSession();
    }
    assert.equal(
      (await prices.findOne({ ticker: rollbackTicker })).tradeRevision,
      undefined,
    );

    const haltWinsGift = await seedScenario("GIFT_BLOCKED");
    const haltSession = client.startSession();
    const giftSession = client.startSession();
    haltSession.startTransaction();
    await setStockTradingHalted(haltWinsGift.ticker, true, haltSession);
    let signalGiftStarted;
    const giftStarted = new Promise((resolve) => {
      signalGiftStarted = resolve;
    });
    const giftPromise = giftSession.withTransaction(async () => {
      signalGiftStarted();
      return createAndSettleGift(
        haltWinsGift.initiator,
        haltWinsGift.counterparty,
        haltWinsGift.offer,
        haltWinsGift.actor,
        giftSession,
      );
    });
    await giftStarted;
    await new Promise((resolve) => setImmediate(resolve));
    await haltSession.commitTransaction();
    await assert.rejects(
      giftPromise,
      (error) =>
        error instanceof PlayerTradeError &&
        error.code === "STOCK_TRADING_HALTED",
    );
    await Promise.all([haltSession.endSession(), giftSession.endSession()]);
    await assertUnmoved(haltWinsGift);
    assert.equal(
      await trades.countDocuments({
        "initiator.characterId": haltWinsGift.initiator.characterId,
      }),
      0,
    );
    const giftBlockedPrice = await prices.findOne({
      ticker: haltWinsGift.ticker,
    });
    assert.equal(giftBlockedPrice.isTradingHalted, true);
    assert.equal(giftBlockedPrice.tradeRevision, undefined);

    const giftWins = await seedScenario("GIFT_COMMITTED");
    const committedGiftSession = client.startSession();
    committedGiftSession.startTransaction();
    await createAndSettleGift(
      giftWins.initiator,
      giftWins.counterparty,
      giftWins.offer,
      giftWins.actor,
      committedGiftSession,
    );
    const trailingHaltSession = client.startSession();
    let signalHaltStarted;
    const trailingHaltStarted = new Promise((resolve) => {
      signalHaltStarted = resolve;
    });
    const trailingHaltPromise = trailingHaltSession.withTransaction(async () => {
      signalHaltStarted();
      return setStockTradingHalted(giftWins.ticker, true, trailingHaltSession);
    });
    await trailingHaltStarted;
    await new Promise((resolve) => setImmediate(resolve));
    await committedGiftSession.commitTransaction();
    await trailingHaltPromise;
    await Promise.all([
      committedGiftSession.endSession(),
      trailingHaltSession.endSession(),
    ]);
    assert.equal(
      (await balances.findOne({ characterId: giftWins.initiator.characterId }))
        .balance,
      75,
    );
    assert.equal(
      (await balances.findOne({ characterId: giftWins.counterparty.characterId }))
        .balance,
      25,
    );
    assert.equal(
      (await holdings.findOne({
        characterId: giftWins.initiator.characterId,
        ticker: giftWins.ticker,
      })).shares,
      6,
    );
    assert.equal(
      (await holdings.findOne({
        characterId: giftWins.counterparty.characterId,
        ticker: giftWins.ticker,
      })).shares,
      4,
    );
    assert.equal(
      await transactions.countDocuments({
        characterId: {
          $in: [
            giftWins.initiator.characterId,
            giftWins.counterparty.characterId,
          ],
        },
      }),
      2,
    );
    assert.equal(
      await trades.countDocuments({
        "initiator.characterId": giftWins.initiator.characterId,
        status: "COMPLETED",
      }),
      1,
    );
    const giftCommittedPrice = await prices.findOne({ ticker: giftWins.ticker });
    assert.equal(giftCommittedPrice.isTradingHalted, true);
    assert.equal(giftCommittedPrice.tradeRevision, 1);

    const haltWinsConfirm = await seedScenario("CONFIRM_BLOCKED");
    const openSession = client.startSession();
    let openTrade;
    await openSession.withTransaction(async () => {
      openTrade = await createOpenPlayerTrade(
        haltWinsConfirm.initiator,
        haltWinsConfirm.counterparty,
        haltWinsConfirm.offer,
        openSession,
      );
    });
    await openSession.endSession();
    const firstConfirmSession = client.startSession();
    await firstConfirmSession.withTransaction(() =>
      confirmPlayerTrade(
        openTrade._id.toString(),
        haltWinsConfirm.initiator.userId,
        openTrade.revision,
        haltWinsConfirm.actor,
        firstConfirmSession,
      ),
    );
    await firstConfirmSession.endSession();

    const confirmHaltSession = client.startSession();
    const finalConfirmSession = client.startSession();
    confirmHaltSession.startTransaction();
    await setStockTradingHalted(
      haltWinsConfirm.ticker,
      true,
      confirmHaltSession,
    );
    let signalConfirmStarted;
    const confirmStarted = new Promise((resolve) => {
      signalConfirmStarted = resolve;
    });
    const finalConfirmPromise = finalConfirmSession.withTransaction(async () => {
      signalConfirmStarted();
      return confirmPlayerTrade(
        openTrade._id.toString(),
        haltWinsConfirm.counterparty.userId,
        openTrade.revision,
        {
          id: haltWinsConfirm.counterparty.userId,
          name: haltWinsConfirm.counterparty.displayName,
        },
        finalConfirmSession,
      );
    });
    await confirmStarted;
    await new Promise((resolve) => setImmediate(resolve));
    await confirmHaltSession.commitTransaction();
    await assert.rejects(
      finalConfirmPromise,
      (error) =>
        error instanceof PlayerTradeError &&
        error.code === "STOCK_TRADING_HALTED",
    );
    await Promise.all([
      confirmHaltSession.endSession(),
      finalConfirmSession.endSession(),
    ]);
    await assertUnmoved(haltWinsConfirm);
    const stillOpen = await trades.findOne({ _id: openTrade._id });
    assert.equal(stillOpen.status, "OPEN");
    assert.equal(stillOpen.initiatorConfirmedRevision, openTrade.revision);
    assert.equal(stillOpen.counterpartyConfirmedRevision, undefined);
    const confirmBlockedPrice = await prices.findOne({
      ticker: haltWinsConfirm.ticker,
    });
    assert.equal(confirmBlockedPrice.isTradingHalted, true);
    assert.equal(confirmBlockedPrice.tradeRevision, 2);

    const sequentialSession = client.startSession();
    try {
      await assert.rejects(
        sequentialSession.withTransaction(() =>
          claimTradableStockPrice(haltWinsConfirm.ticker, sequentialSession),
        ),
        (error) =>
          error instanceof StockPriceTradeClaimError &&
          error.code === "STOCK_TRADING_HALTED",
      );
    } finally {
      await sequentialSession.endSession();
    }

    const novexNow = new Date("2026-08-14T12:00:00.000Z");
    const closedGift = await seedScenario("NOVEX_CLOSED");
    await marketState.replaceOne(
      { _id: "novex" },
      {
        _id: "novex",
        status: "CLOSED",
        tradingDate: "2026-08-14",
        opensAt: new Date("2026-08-14T00:00:00.000Z"),
        closesAt: new Date("2026-08-14T14:00:00.000Z"),
        delayed: false,
        tradeRevision: 0,
        updatedAt: novexNow,
      },
      { upsert: true },
    );
    const closedSession = client.startSession();
    try {
      await assert.rejects(
        closedSession.withTransaction(() => createAndSettleGift(
          closedGift.initiator,
          closedGift.counterparty,
          closedGift.offer,
          closedGift.actor,
          closedSession,
          { novexV2Enabled: true, now: novexNow },
        )),
        (error) => error instanceof PlayerTradeError && error.code === "MARKET_CLOSED",
      );
    } finally {
      await closedSession.endSession();
    }
    await assertUnmoved(closedGift);

    const coolingGift = await seedScenario("NOVEX_COOLING");
    await marketState.updateOne(
      { _id: "novex" },
      { $set: { status: "OPEN", opensAt: new Date("2026-08-14T00:00:00.000Z"), closesAt: new Date("2026-08-14T14:00:00.000Z") } },
    );
    await prices.updateOne(
      { ticker: coolingGift.ticker },
      { $set: { cooldownUntil: new Date(novexNow.getTime() + 10 * 60 * 1000) } },
    );
    const coolingSession = client.startSession();
    try {
      await assert.rejects(
        coolingSession.withTransaction(() => createAndSettleGift(
          coolingGift.initiator,
          coolingGift.counterparty,
          coolingGift.offer,
          coolingGift.actor,
          coolingSession,
          { novexV2Enabled: true, now: novexNow },
        )),
        (error) => error instanceof PlayerTradeError && error.code === "STOCK_COOLING_DOWN",
      );
    } finally {
      await coolingSession.endSession();
    }
    await assertUnmoved(coolingGift);
  },
);
