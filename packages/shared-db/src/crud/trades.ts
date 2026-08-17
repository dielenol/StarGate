import { ObjectId, type ClientSession, type Filter } from "mongodb";

import type {
  PlayerTrade,
  PlayerTradeOffer,
  PlayerTradeParticipant,
} from "../types/index.js";

import {
  characterInventoryCol,
  charactersCol,
  masterItemsCol,
  playerTradesCol,
  stockHoldingsCol,
  usersCol,
} from "../collections.js";
import { addCredit, getCharacterBalance } from "./credits.js";
import {
  addToInventory,
  lockCharacterInventoryItems,
  removeFromInventory,
} from "./inventory.js";
import {
  buyHolding,
  sellHolding,
  StockPriceTradeClaimError,
} from "./stocks.js";
import {
  claimCompatibleTradableStockPrice,
  recordStockSeasonFlow,
  StockMarketTradeClaimError,
} from "./stock-market.js";

const MAX_OFFER_LINES = 50;
const MAX_ITEM_QUANTITY = 999;
const MAX_STOCK_SHARES = 1_000_000_000;
const MAX_CREDITS = 1_000_000_000;
const NON_TRANSFERABLE_ITEM_SLUG_PREFIXES = ["towaski-license-"] as const;
const NON_TRANSFERABLE_ITEM_SLUGS = new Set([
  "mrbeast_lottery",
  "mrbeast_apology_lottery",
]);

export function isPlayerTradeItemSlugTransferable(
  slug: string | null | undefined,
): boolean {
  return (
    !NON_TRANSFERABLE_ITEM_SLUGS.has(slug ?? "") &&
    !NON_TRANSFERABLE_ITEM_SLUG_PREFIXES.some((prefix) =>
      slug?.startsWith(prefix),
    )
  );
}

export const EMPTY_PLAYER_TRADE_OFFER: PlayerTradeOffer = {
  credits: 0,
  items: [],
  stocks: [],
};

export type PlayerTradeErrorCode =
  | "INVALID_TRADE"
  | "TRADE_NOT_FOUND"
  | "TRADE_FORBIDDEN"
  | "TRADE_NOT_OPEN"
  | "TRADE_REVISION_CONFLICT"
  | "EMPTY_TRADE"
  | "DUPLICATE_ASSET"
  | "INSUFFICIENT_CREDITS"
  | "INSUFFICIENT_ITEMS"
  | "INSUFFICIENT_STOCKS"
  | "STOCK_PRICE_NOT_FOUND"
  | "STOCK_TRADING_HALTED"
  | "MARKET_CLOSED"
  | "MARKET_OPENING_PENDING"
  | "STOCK_COOLING_DOWN"
  | "ITEM_NOT_TRANSFERABLE";

export interface PlayerTradeMarketOptions {
  now?: Date;
  novexV2Enabled?: boolean;
}

export class PlayerTradeError extends Error {
  constructor(
    public readonly code: PlayerTradeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PlayerTradeError";
  }
}

interface ValidatedOffer {
  offer: PlayerTradeOffer;
  stockAvgPrices: Map<string, number>;
}

function isNonNegativeCredit(value: number): boolean {
  const cents = value * 100;
  return (
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_CREDITS &&
    Number.isSafeInteger(Math.round(cents)) &&
    Math.abs(cents - Math.round(cents)) < 1e-7
  );
}

function hasAssets(offer: PlayerTradeOffer): boolean {
  return offer.credits > 0 || offer.items.length > 0 || offer.stocks.length > 0;
}

function participantSide(
  trade: PlayerTrade,
  userId: string,
): "initiator" | "counterparty" | null {
  if (trade.initiator.userId === userId) return "initiator";
  if (trade.counterparty.userId === userId) return "counterparty";
  return null;
}

function assertOpenTrade(
  trade: PlayerTrade | null,
  userId: string,
  expectedRevision?: number,
): asserts trade is PlayerTrade {
  if (!trade) {
    throw new PlayerTradeError("TRADE_NOT_FOUND", "거래를 찾을 수 없습니다.");
  }
  if (!participantSide(trade, userId)) {
    throw new PlayerTradeError("TRADE_FORBIDDEN", "이 거래에 참여할 수 없습니다.");
  }
  if (trade.status !== "OPEN") {
    throw new PlayerTradeError("TRADE_NOT_OPEN", "이미 종료된 거래입니다.");
  }
  if (
    expectedRevision !== undefined &&
    trade.revision !== expectedRevision
  ) {
    throw new PlayerTradeError(
      "TRADE_REVISION_CONFLICT",
      "거래 구성이 변경되었습니다. 최신 상태를 확인해주세요.",
    );
  }
}

export function normalizePlayerTradeOffer(input: unknown): PlayerTradeOffer {
  if (!input || typeof input !== "object") {
    throw new PlayerTradeError("INVALID_TRADE", "거래 자산 구성이 올바르지 않습니다.");
  }
  const raw = input as {
    credits?: unknown;
    items?: unknown;
    stocks?: unknown;
  };
  const credits = raw.credits ?? 0;
  if (typeof credits !== "number" || !isNonNegativeCredit(credits)) {
    throw new PlayerTradeError(
      "INVALID_TRADE",
      `크레딧은 0~${MAX_CREDITS.toLocaleString()} 사이의 2자리 이하 금액이어야 합니다.`,
    );
  }
  if (!Array.isArray(raw.items) || raw.items.length > MAX_OFFER_LINES) {
    throw new PlayerTradeError("INVALID_TRADE", "아이템 거래 구성이 너무 많습니다.");
  }
  if (!Array.isArray(raw.stocks) || raw.stocks.length > MAX_OFFER_LINES) {
    throw new PlayerTradeError("INVALID_TRADE", "주식 거래 구성이 너무 많습니다.");
  }

  const itemIds = new Set<string>();
  const items = raw.items.map((value) => {
    if (!value || typeof value !== "object") {
      throw new PlayerTradeError("INVALID_TRADE", "아이템 거래 구성이 올바르지 않습니다.");
    }
    const item = value as { itemId?: unknown; quantity?: unknown };
    if (
      typeof item.itemId !== "string" ||
      !ObjectId.isValid(item.itemId) ||
      typeof item.quantity !== "number" ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > MAX_ITEM_QUANTITY
    ) {
      throw new PlayerTradeError("INVALID_TRADE", "아이템 ID 또는 수량이 올바르지 않습니다.");
    }
    if (itemIds.has(item.itemId)) {
      throw new PlayerTradeError("DUPLICATE_ASSET", "같은 아이템을 중복 등록할 수 없습니다.");
    }
    itemIds.add(item.itemId);
    return { itemId: item.itemId, itemName: "", quantity: item.quantity };
  });

  const tickers = new Set<string>();
  const stocks = raw.stocks.map((value) => {
    if (!value || typeof value !== "object") {
      throw new PlayerTradeError("INVALID_TRADE", "주식 거래 구성이 올바르지 않습니다.");
    }
    const stock = value as { ticker?: unknown; shares?: unknown };
    const ticker =
      typeof stock.ticker === "string" ? stock.ticker.trim().toUpperCase() : "";
    if (
      !/^[A-Z0-9._-]{1,20}$/.test(ticker) ||
      typeof stock.shares !== "number" ||
      !Number.isSafeInteger(stock.shares) ||
      stock.shares < 1 ||
      stock.shares > MAX_STOCK_SHARES
    ) {
      throw new PlayerTradeError("INVALID_TRADE", "종목 또는 주식 수량이 올바르지 않습니다.");
    }
    if (tickers.has(ticker)) {
      throw new PlayerTradeError("DUPLICATE_ASSET", "같은 종목을 중복 등록할 수 없습니다.");
    }
    tickers.add(ticker);
    return { ticker, shares: stock.shares };
  });

  return { credits: Math.round(credits * 100) / 100, items, stocks };
}

export function assertPlayerTradeOffersCompatible(
  initiatorOffer: PlayerTradeOffer,
  counterpartyOffer: PlayerTradeOffer,
): void {
  const itemIds = new Set(initiatorOffer.items.map((item) => item.itemId));
  if (counterpartyOffer.items.some((item) => itemIds.has(item.itemId))) {
    throw new PlayerTradeError(
      "DUPLICATE_ASSET",
      "양쪽이 같은 아이템을 동시에 제안할 수 없습니다.",
    );
  }
  const tickers = new Set(initiatorOffer.stocks.map((stock) => stock.ticker));
  if (counterpartyOffer.stocks.some((stock) => tickers.has(stock.ticker))) {
    throw new PlayerTradeError(
      "DUPLICATE_ASSET",
      "양쪽이 같은 종목을 동시에 제안할 수 없습니다.",
    );
  }
}

async function validateOwnedOffer(
  participant: PlayerTradeParticipant,
  offer: PlayerTradeOffer,
  session: ClientSession,
): Promise<ValidatedOffer> {
  if (!ObjectId.isValid(participant.userId)) {
    throw new PlayerTradeError("TRADE_FORBIDDEN", "거래 참여자 정보가 올바르지 않습니다.");
  }
  const balance = await getCharacterBalance(participant.characterId, {
    session,
  });
  const inventory = await (await characterInventoryCol())
    .find({ characterId: participant.characterId }, { session })
    .toArray();
  const holdings = await (await stockHoldingsCol())
    .find({ characterId: participant.characterId }, { session })
    .toArray();
  const user = await (await usersCol()).findOne(
    { _id: new ObjectId(participant.userId) },
    { session, projection: { status: 1 } },
  );
  const mainCharacters = await (await charactersCol())
    .find(
      {
        ownerId: participant.userId,
        type: "AGENT",
        $or: [{ tier: "MAIN" }, { tier: { $exists: false } }],
      },
      { session, projection: { _id: 1 } },
    )
    .toArray();
  if (
    user?.status !== "ACTIVE" ||
    mainCharacters.length !== 1 ||
    String(mainCharacters[0]._id) !== participant.characterId
  ) {
    throw new PlayerTradeError(
      "TRADE_FORBIDDEN",
      "ACTIVE 사용자의 MAIN AGENT 캐릭터만 거래할 수 있습니다.",
    );
  }
  if (balance < offer.credits) {
    throw new PlayerTradeError("INSUFFICIENT_CREDITS", "보유 크레딧이 부족합니다.");
  }

  const entryByItemId = new Map(inventory.map((entry) => [entry.itemId, entry]));
  const masterIds = offer.items.map((item) => new ObjectId(item.itemId));
  const masters =
    masterIds.length === 0
      ? []
      : await (await masterItemsCol())
          .find({ _id: { $in: masterIds } }, { session })
          .toArray();
  const masterById = new Map(
    masters.filter((item) => item._id).map((item) => [String(item._id), item]),
  );
  const canonicalItems = offer.items.map((item) => {
    const entry = entryByItemId.get(item.itemId);
    const master = masterById.get(item.itemId);
    if (!entry || entry.quantity < item.quantity || !master) {
      throw new PlayerTradeError("INSUFFICIENT_ITEMS", "보유 아이템 수량이 부족합니다.");
    }
    if (
      entry.equippedSlot ||
      entry.equipmentCharge ||
      master.equipmentAction ||
      master.isPublic === false ||
      master.workshop ||
      !isPlayerTradeItemSlugTransferable(master.slug)
    ) {
      throw new PlayerTradeError(
        "ITEM_NOT_TRANSFERABLE",
        `${master.name}은(는) 거래할 수 없는 아이템입니다.`,
      );
    }
    return { ...item, itemName: master.name };
  });

  const holdingByTicker = new Map(
    holdings.map((holding) => [holding.ticker, holding]),
  );
  const stockAvgPrices = new Map<string, number>();
  for (const stock of offer.stocks) {
    const holding = holdingByTicker.get(stock.ticker);
    if (!holding || holding.shares < stock.shares) {
      throw new PlayerTradeError("INSUFFICIENT_STOCKS", "보유 주식 수량이 부족합니다.");
    }
    stockAvgPrices.set(stock.ticker, holding.avgPrice);
  }
  return {
    offer: { ...offer, items: canonicalItems },
    stockAvgPrices,
  };
}

async function transferOffer(
  tradeId: string,
  label: "initiator" | "counterparty",
  from: PlayerTradeParticipant,
  to: PlayerTradeParticipant,
  validated: ValidatedOffer,
  actor: { id: string; name: string },
  session: ClientSession,
  marketPrices: ReadonlyMap<string, number>,
  recordSeasonFlows: boolean,
): Promise<void> {
  const offer = validated.offer;
  if (offer.credits > 0) {
    const metadata = {
      tradeId,
      fromCharacterId: from.characterId,
      toCharacterId: to.characterId,
    };
    await addCredit({
      characterId: from.characterId,
      characterCodename: from.characterCodename,
      ownerId: from.userId,
      ownerName: from.displayName,
      amount: -offer.credits,
      type: "TRANSFER",
      description: `${to.characterCodename}에게 거래 전달`,
      createdById: actor.id,
      createdByName: actor.name,
      requestId: `${tradeId}:credit:${label}:out`,
      metadata,
      session,
    });
    await addCredit({
      characterId: to.characterId,
      characterCodename: to.characterCodename,
      ownerId: to.userId,
      ownerName: to.displayName,
      amount: offer.credits,
      type: "TRANSFER",
      description: `${from.characterCodename}에게 거래 수령`,
      createdById: actor.id,
      createdByName: actor.name,
      requestId: `${tradeId}:credit:${label}:in`,
      metadata,
      session,
    });
  }

  for (const item of offer.items) {
    const removed = await removeFromInventory(
      from.characterId,
      item.itemId,
      item.quantity,
      { session },
    );
    if (!removed.ok) {
      throw new PlayerTradeError("INSUFFICIENT_ITEMS", "보유 아이템 수량이 변경되었습니다.");
    }
    await addToInventory(
      {
        characterId: to.characterId,
        characterCodename: to.characterCodename,
        itemId: item.itemId,
        itemName: item.itemName,
        quantity: item.quantity,
        acquiredAt: new Date(),
        note: `플레이어 거래 ${tradeId}`,
      },
      { session },
    );
  }

  for (const stock of offer.stocks) {
    const sold = await sellHolding(
      from.characterId,
      stock.ticker,
      stock.shares,
      { session },
    );
    if (!sold.ok) {
      throw new PlayerTradeError("INSUFFICIENT_STOCKS", "보유 주식 수량이 변경되었습니다.");
    }
    await buyHolding(
      to.characterId,
      stock.ticker,
      stock.shares,
      validated.stockAvgPrices.get(stock.ticker) ?? sold.avgPrice,
      { session },
    );
    if (recordSeasonFlows) {
      const marketPrice = marketPrices.get(stock.ticker);
      if (marketPrice === undefined) {
        throw new PlayerTradeError("STOCK_PRICE_NOT_FOUND", `${stock.ticker} 종목의 운영 시세가 없습니다.`);
      }
      const occurredAt = new Date();
      await recordStockSeasonFlow({
        operationKey: `${tradeId}:season:${label}:${stock.ticker}:out`,
        characterId: from.characterId,
        ticker: stock.ticker,
        kind: "TRANSFER_OUT",
        shares: stock.shares,
        marketPrice,
        externalAmount: -stock.shares * marketPrice,
        returnAmount: 0,
        occurredAt,
      }, session);
      await recordStockSeasonFlow({
        operationKey: `${tradeId}:season:${label}:${stock.ticker}:in`,
        characterId: to.characterId,
        ticker: stock.ticker,
        kind: "TRANSFER_IN",
        shares: stock.shares,
        marketPrice,
        externalAmount: stock.shares * marketPrice,
        returnAmount: 0,
        occurredAt,
      }, session);
    }
  }
}

async function claimTradableOfferStocks(
  initiatorOffer: PlayerTradeOffer,
  counterpartyOffer: PlayerTradeOffer,
  session: ClientSession,
  options: PlayerTradeMarketOptions = {},
): Promise<Map<string, number>> {
  const tickers = Array.from(
    new Set(
      [...initiatorOffer.stocks, ...counterpartyOffer.stocks].map(
        (stock) => stock.ticker,
      ),
    ),
  ).sort((a, b) => a.localeCompare(b));
  const now = options.now ?? new Date();

  const prices = new Map<string, number>();
  for (const ticker of tickers) {
    try {
      const claimed = await claimCompatibleTradableStockPrice(
        ticker,
        now,
        session,
        { novexV2Enabled: options.novexV2Enabled === true },
      );
      prices.set(ticker, claimed.price);
    } catch (error) {
      if (error instanceof StockMarketTradeClaimError) {
        if (error.code === "PRICE_NOT_FOUND") {
          throw new PlayerTradeError("STOCK_PRICE_NOT_FOUND", `${ticker} 종목의 운영 시세가 없어 거래할 수 없습니다.`);
        }
        throw new PlayerTradeError(error.code, `${ticker} 종목을 현재 거래할 수 없습니다.`);
      }
      if (!(error instanceof StockPriceTradeClaimError)) throw error;
      if (error.code === "STOCK_TRADING_HALTED") {
        throw new PlayerTradeError(
          "STOCK_TRADING_HALTED",
          `${ticker} 종목은 현재 거래정지 상태입니다.`,
        );
      }
      throw new PlayerTradeError(
        "STOCK_PRICE_NOT_FOUND",
        `${ticker} 종목의 운영 시세가 없어 거래할 수 없습니다.`,
      );
    }
  }
  return prices;
}

async function settleTrade(
  trade: PlayerTrade,
  actor: { id: string; name: string },
  session: ClientSession,
  options: PlayerTradeMarketOptions = {},
): Promise<{
  initiatorOffer: PlayerTradeOffer;
  counterpartyOffer: PlayerTradeOffer;
}> {
  if (!hasAssets(trade.initiatorOffer) && !hasAssets(trade.counterpartyOffer)) {
    throw new PlayerTradeError("EMPTY_TRADE", "거래할 자산이 없습니다.");
  }
  assertPlayerTradeOffersCompatible(trade.initiatorOffer, trade.counterpartyOffer);

  // 모든 자산 mutation 전에 종목별 가격 문서를 정렬된 순서로 claim한다.
  // 거래정지 변경과 같은 문서 write로 직렬화되며, 이후 실패 시 revision도 함께 rollback된다.
  const marketPrices = await claimTradableOfferStocks(
    trade.initiatorOffer,
    trade.counterpartyOffer,
    session,
    options,
  );

  const lockTargets = [
    {
      characterId: trade.initiator.characterId,
      itemIds: [
        ...trade.initiatorOffer.items,
        ...trade.counterpartyOffer.items,
      ].map((item) => item.itemId),
    },
    {
      characterId: trade.counterparty.characterId,
      itemIds: [
        ...trade.initiatorOffer.items,
        ...trade.counterpartyOffer.items,
      ].map((item) => item.itemId),
    },
  ].sort((a, b) => a.characterId.localeCompare(b.characterId));
  for (const target of lockTargets) {
    if (target.itemIds.length > 0) {
      await lockCharacterInventoryItems(
        target.characterId,
        target.itemIds,
        session,
      );
    }
  }

  const initiatorValidated = await validateOwnedOffer(
    trade.initiator,
    trade.initiatorOffer,
    session,
  );
  const counterpartyValidated = await validateOwnedOffer(
    trade.counterparty,
    trade.counterpartyOffer,
    session,
  );

  const tradeId = String(trade._id);
  await transferOffer(
    tradeId,
    "initiator",
    trade.initiator,
    trade.counterparty,
    initiatorValidated,
    actor,
    session,
    marketPrices,
    options.novexV2Enabled === true,
  );
  await transferOffer(
    tradeId,
    "counterparty",
    trade.counterparty,
    trade.initiator,
    counterpartyValidated,
    actor,
    session,
    marketPrices,
    options.novexV2Enabled === true,
  );
  return {
    initiatorOffer: initiatorValidated.offer,
    counterpartyOffer: counterpartyValidated.offer,
  };
}

export async function listPlayerTradesForUser(
  userId: string,
  limit = 100,
): Promise<PlayerTrade[]> {
  const col = await playerTradesCol();
  return col
    .find({
      $or: [
        { "initiator.userId": userId },
        { "counterparty.userId": userId },
      ],
    })
    // _id 보조 키: 체결/취소가 양측 문서를 같은 시각으로 갱신해 동점이 실발생 —
    // 폴링 간 순서 플립(ETag 플랩 + 목록 재정렬)을 결정적으로 차단.
    .sort({ updatedAt: -1, _id: -1 })
    .limit(limit)
    .toArray();
}

export async function findPlayerTradeById(
  id: string,
  options: { session?: ClientSession } = {},
): Promise<PlayerTrade | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await playerTradesCol();
  return col.findOne({ _id: new ObjectId(id) }, { session: options.session });
}

export async function listPlayerTradeCounterparties(
  excludeUserId: string,
): Promise<PlayerTradeParticipant[]> {
  const users = await (await usersCol())
    .find(
      { status: "ACTIVE", _id: { $ne: new ObjectId(excludeUserId) } },
      { projection: { displayName: 1 } },
    )
    // natural order 는 문서 갱신으로 변동 — 응답 순서(=ETag 해시 입력) 결정화.
    .sort({ _id: 1 })
    .toArray();
  const ownerIds = users.map((user) => String(user._id));
  if (ownerIds.length === 0) return [];
  const characters = await (await charactersCol())
    .find({
      type: "AGENT",
      ownerId: { $in: ownerIds },
      $or: [{ tier: "MAIN" }, { tier: { $exists: false } }],
    })
    .project({
      ownerId: 1,
      codename: 1,
    })
    .toArray();
  const byOwner = new Map<string, typeof characters>();
  for (const character of characters) {
    if (!character.ownerId) continue;
    const rows = byOwner.get(character.ownerId) ?? [];
    rows.push(character);
    byOwner.set(character.ownerId, rows);
  }
  return users.flatMap((user) => {
    const rows = byOwner.get(String(user._id)) ?? [];
    if (rows.length !== 1 || !rows[0]._id) return [];
    return [{
      userId: String(user._id),
      displayName: user.displayName,
      characterId: String(rows[0]._id),
      characterCodename: rows[0].codename,
    }];
  });
}

export async function createOpenPlayerTrade(
  initiator: PlayerTradeParticipant,
  counterparty: PlayerTradeParticipant,
  offer: PlayerTradeOffer,
  session: ClientSession,
  options: PlayerTradeMarketOptions = {},
): Promise<PlayerTrade> {
  await claimTradableOfferStocks(
    offer,
    EMPTY_PLAYER_TRADE_OFFER,
    session,
    options,
  );
  const validated = await validateOwnedOffer(initiator, offer, session);
  await validateOwnedOffer(counterparty, EMPTY_PLAYER_TRADE_OFFER, session);
  const now = new Date();
  const doc: PlayerTrade = {
    kind: "EXCHANGE",
    status: "OPEN",
    revision: 1,
    initiator,
    counterparty,
    initiatorOffer: validated.offer,
    counterpartyOffer: EMPTY_PLAYER_TRADE_OFFER,
    createdAt: now,
    updatedAt: now,
  };
  const result = await (await playerTradesCol()).insertOne(doc, { session });
  return { ...doc, _id: result.insertedId };
}

export async function createAndSettleGift(
  initiator: PlayerTradeParticipant,
  counterparty: PlayerTradeParticipant,
  offer: PlayerTradeOffer,
  actor: { id: string; name: string },
  session: ClientSession,
  options: PlayerTradeMarketOptions = {},
): Promise<PlayerTrade> {
  if (!hasAssets(offer)) {
    throw new PlayerTradeError("EMPTY_TRADE", "전달할 자산이 없습니다.");
  }
  const now = new Date();
  const trade: PlayerTrade = {
    _id: new ObjectId(),
    kind: "GIFT",
    status: "OPEN",
    revision: 1,
    initiator,
    counterparty,
    initiatorOffer: offer,
    counterpartyOffer: EMPTY_PLAYER_TRADE_OFFER,
    createdAt: now,
    updatedAt: now,
  };
  const settled = await settleTrade(trade, actor, session, options);
  const completed: PlayerTrade = {
    ...trade,
    status: "COMPLETED",
    initiatorOffer: settled.initiatorOffer,
    counterpartyOffer: settled.counterpartyOffer,
    completedAt: now,
  };
  await (await playerTradesCol()).insertOne(completed, { session });
  return completed;
}

export async function replacePlayerTradeOffer(
  id: string,
  userId: string,
  expectedRevision: number,
  offer: PlayerTradeOffer,
  session: ClientSession,
  options: PlayerTradeMarketOptions = {},
): Promise<PlayerTrade> {
  const trade = await findPlayerTradeById(id, { session });
  assertOpenTrade(trade, userId, expectedRevision);
  if (trade.kind !== "EXCHANGE") {
    throw new PlayerTradeError("TRADE_NOT_OPEN", "즉시 전달 거래는 수정할 수 없습니다.");
  }
  const side = participantSide(trade, userId)!;
  const participant =
    side === "initiator" ? trade.initiator : trade.counterparty;
  const validated = await validateOwnedOffer(participant, offer, session);
  const nextInitiator =
    side === "initiator" ? validated.offer : trade.initiatorOffer;
  const nextCounterparty =
    side === "counterparty" ? validated.offer : trade.counterpartyOffer;
  assertPlayerTradeOffersCompatible(nextInitiator, nextCounterparty);
  // 상대 제안에 정지 종목이 있어도 각 참여자가 자기 제안에서 문제 종목을 제거할 수
  // 있어야 한다. 저장하는 본인의 새 제안만 claim하고, 양측 전체는 confirm/settle에서 막는다.
  await claimTradableOfferStocks(
    validated.offer,
    EMPTY_PLAYER_TRADE_OFFER,
    session,
    options,
  );

  const offerField =
    side === "initiator" ? "initiatorOffer" : "counterpartyOffer";
  const col = await playerTradesCol();
  const updated = await col.findOneAndUpdate(
    {
      _id: trade._id,
      status: "OPEN",
      revision: expectedRevision,
    },
    {
      $set: {
        [offerField]: validated.offer,
        updatedAt: new Date(),
      },
      $inc: { revision: 1 },
      $unset: {
        initiatorConfirmedRevision: "",
        counterpartyConfirmedRevision: "",
      },
    },
    { returnDocument: "after", session },
  );
  if (!updated) {
    throw new PlayerTradeError(
      "TRADE_REVISION_CONFLICT",
      "거래 구성이 변경되었습니다. 최신 상태를 확인해주세요.",
    );
  }
  return updated;
}

export async function confirmPlayerTrade(
  id: string,
  userId: string,
  expectedRevision: number,
  actor: { id: string; name: string },
  session: ClientSession,
  options: PlayerTradeMarketOptions = {},
): Promise<{ trade: PlayerTrade; completed: boolean; confirmed: boolean }> {
  const trade = await findPlayerTradeById(id, { session });
  assertOpenTrade(trade, userId, expectedRevision);
  if (trade.kind !== "EXCHANGE") {
    throw new PlayerTradeError("TRADE_NOT_OPEN", "즉시 전달 거래는 확정할 수 없습니다.");
  }
  const side = participantSide(trade, userId)!;
  const ownConfirmation =
    side === "initiator"
      ? trade.initiatorConfirmedRevision
      : trade.counterpartyConfirmedRevision;
  if (ownConfirmation === expectedRevision) {
    return { trade, completed: false, confirmed: false };
  }
  const otherConfirmed =
    (side === "initiator"
      ? trade.counterpartyConfirmedRevision
      : trade.initiatorConfirmedRevision) === expectedRevision;
  const confirmationField =
    side === "initiator"
      ? "initiatorConfirmedRevision"
      : "counterpartyConfirmedRevision";
  const col = await playerTradesCol();

  if (!otherConfirmed) {
    await claimTradableOfferStocks(
      trade.initiatorOffer,
      trade.counterpartyOffer,
      session,
      options,
    );
    const updated = await col.findOneAndUpdate(
      { _id: trade._id, status: "OPEN", revision: expectedRevision },
      {
        $set: {
          [confirmationField]: expectedRevision,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after", session },
    );
    if (!updated) {
      throw new PlayerTradeError(
        "TRADE_REVISION_CONFLICT",
        "거래 구성이 변경되었습니다. 최신 상태를 확인해주세요.",
      );
    }
    return { trade: updated, completed: false, confirmed: true };
  }

  const settled = await settleTrade(trade, actor, session, options);
  const completedAt = new Date();
  const completed = await col.findOneAndUpdate(
    { _id: trade._id, status: "OPEN", revision: expectedRevision },
    {
      $set: {
        [confirmationField]: expectedRevision,
        status: "COMPLETED",
        initiatorOffer: settled.initiatorOffer,
        counterpartyOffer: settled.counterpartyOffer,
        completedAt,
        updatedAt: completedAt,
      },
    },
    { returnDocument: "after", session },
  );
  if (!completed) {
    throw new PlayerTradeError(
      "TRADE_REVISION_CONFLICT",
      "거래 구성이 변경되었습니다. 최신 상태를 확인해주세요.",
    );
  }
  return { trade: completed, completed: true, confirmed: true };
}

export async function cancelPlayerTrade(
  id: string,
  userId: string,
  expectedRevision: number,
  session: ClientSession,
): Promise<PlayerTrade> {
  const trade = await findPlayerTradeById(id, { session });
  assertOpenTrade(trade, userId, expectedRevision);
  const cancelledAt = new Date();
  const filter: Filter<PlayerTrade> = {
    _id: trade._id,
    status: "OPEN",
    revision: expectedRevision,
  };
  const cancelled = await (await playerTradesCol()).findOneAndUpdate(
    filter,
    {
      $set: {
        status: "CANCELLED",
        cancelledAt,
        updatedAt: cancelledAt,
        cancellationReason: "USER_CANCELLED",
      },
    },
    { returnDocument: "after", session },
  );
  if (!cancelled) {
    throw new PlayerTradeError(
      "TRADE_REVISION_CONFLICT",
      "거래 구성이 변경되었습니다. 최신 상태를 확인해주세요.",
    );
  }
  return cancelled;
}
