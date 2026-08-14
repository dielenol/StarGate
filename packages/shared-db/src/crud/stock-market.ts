import { MongoServerError, ObjectId, type ClientSession, type Collection } from "mongodb";

import { getClient, getDb } from "../client.js";
import { charactersCol, notificationsCol, stockHoldingsCol, stockPriceHistoryCol, stockPricesCol, usersCol } from "../collections.js";
import { addCredit } from "./credits.js";
import { claimTradableStockPrice } from "./stocks.js";
import { enqueueIntegrationOutbox, type EnqueueIntegrationOutboxInput } from "./worker.js";
import type {
  StockCorporateAction,
  StockDisclosure,
  StockDisclosureEffect,
  StockDividendAction,
  StockDividendEntitlement,
  StockFlowSignal,
  StockInvestmentSeason,
  StockMarketCalendarException,
  StockMarketPreference,
  StockMarketSnapshot,
  StockMarketState,
  StockOrderFlow,
  StockPrice,
  StockPriceHistory,
  StockSeasonPerformance,
  StockSeasonFlow,
  StockSeasonLeaderboardEntry,
  StockScheduledEvent,
} from "../types/index.js";
import { STOCK_MARKET_STATE_ID } from "../types/stock-market.js";

const MARKET_STATE = "stock_market_state";
const CALENDAR_EXCEPTIONS = "stock_market_calendar_exceptions";
const ORDER_FLOW = "stock_order_flow";
const DISCLOSURES = "stock_disclosures";
const DISCLOSURE_FENCES = "stock_disclosure_effect_fences";
const PREFERENCES = "stock_market_preferences";
const CORPORATE_ACTIONS = "stock_corporate_actions";
const DIVIDEND_ENTITLEMENTS = "stock_dividend_entitlements";
const SEASONS = "stock_investment_seasons";
const SEASON_PERFORMANCE = "stock_season_performance";
const SEASON_FLOWS = "stock_season_flows";

async function col<T extends object>(name: string): Promise<Collection<T>> {
  return (await getDb()).collection<T>(name);
}

export async function getStockMarketState(
  options: { session?: ClientSession } = {},
): Promise<StockMarketState | null> {
  return (await col<StockMarketState>(MARKET_STATE)).findOne(
    { _id: STOCK_MARKET_STATE_ID },
    { session: options.session },
  );
}

export async function getStockMarketSnapshot(
  now = new Date(),
): Promise<StockMarketSnapshot | null> {
  const [state, prices] = await Promise.all([
    getStockMarketState(),
    stockPricesCol().then((pricesCol) => pricesCol.find().sort({ ticker: 1 }).toArray()),
  ]);
  if (!state) return null;
  const stateError = classifyStockMarketStateTradeError(state, now);
  const effectiveState = state.status === "OPEN" && (
    now.getTime() >= state.closesAt.getTime() || state.tradingDate < kstDateForMarket(now)
  )
    ? { ...state, status: stateError === "MARKET_OPENING_PENDING" ? "OPENING_PENDING" as const : "CLOSED" as const }
    : state.status === "CLOSED" && stateError === "MARKET_OPENING_PENDING"
      ? { ...state, status: "OPENING_PENDING" as const }
      : state.status === "OPENING_PENDING" && stateError === "MARKET_CLOSED"
        ? { ...state, status: "CLOSED" as const }
      : state;
  return { state: effectiveState, prices };
}

export async function saveStockMarketState(
  state: Omit<StockMarketState, "_id" | "tradeRevision">,
  session: ClientSession,
): Promise<StockMarketState> {
  const saved = await (await col<StockMarketState>(MARKET_STATE)).findOneAndUpdate(
    { _id: STOCK_MARKET_STATE_ID },
    {
      $set: state,
      $setOnInsert: { tradeRevision: 0 },
    },
    { upsert: true, returnDocument: "after", session },
  );
  if (!saved) throw new Error("Failed to save NOVEX market state");
  return saved;
}

export async function closeStockMarketWithoutRound(input: {
  tradingDate: string;
  opensAt: Date;
  closesAt: Date;
  nextOpenAt: Date;
  closureReason: NonNullable<StockMarketState["closureReason"]>;
  finalizeSeason?: boolean;
  now: Date;
}): Promise<StockMarketState> {
  const client = await getClient();
  const session = client.startSession();
  let saved: StockMarketState | null = null;
  try {
    await session.withTransaction(async () => {
      const stateCol = await col<StockMarketState>(MARKET_STATE);
      const current = await stateCol.findOneAndUpdate(
        { _id: STOCK_MARKET_STATE_ID },
        {
          $inc: { tradeRevision: 1 },
          $setOnInsert: {
            status: "OPENING_PENDING",
            tradingDate: input.tradingDate,
            opensAt: input.opensAt,
            closesAt: input.closesAt,
            nextSlotAt: input.nextOpenAt,
            delayed: true,
            updatedAt: input.now,
          },
        },
        { upsert: true, returnDocument: "before", session },
      );
      if (current && current.tradingDate > input.tradingDate) {
        saved = await stateCol.findOne(
          { _id: STOCK_MARKET_STATE_ID },
          { session },
        );
        return;
      }
      saved = await saveStockMarketState({
        status: "CLOSED",
        tradingDate: input.tradingDate,
        opensAt: input.opensAt,
        closesAt: input.closesAt,
        nextSlotAt: input.nextOpenAt,
        lastCompletedSlotKey: current?.lastCompletedSlotKey,
        delayed: current?.delayed ?? false,
        mergedSlotKeys: current?.mergedSlotKeys,
        closureReason: input.closureReason,
        updatedAt: input.now,
      }, session);
      await evaluateStockInvestmentSeasonForRound({
        slotKey: `${input.tradingDate} EARLY_CLOSE`,
        now: input.closesAt,
        endsAt: input.closesAt,
        finalize: input.finalizeSeason === true,
      }, session);
    });
    if (!saved) throw new Error("Failed to close NOVEX market state");
    return saved;
  } finally {
    await session.endSession();
  }
}

export type StockMarketTradeClaimErrorCode =
  | "MARKET_CLOSED"
  | "MARKET_OPENING_PENDING"
  | "STOCK_TRADING_HALTED"
  | "STOCK_COOLING_DOWN"
  | "PRICE_NOT_FOUND";

export class StockMarketTradeClaimError extends Error {
  constructor(readonly code: StockMarketTradeClaimErrorCode) {
    super(code);
    this.name = "StockMarketTradeClaimError";
  }
}

function kstDateForMarket(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function classifyStockMarketStateTradeError(
  state: StockMarketState | null,
  now: Date,
): "MARKET_CLOSED" | "MARKET_OPENING_PENDING" {
  const kstDate = kstDateForMarket(now);
  const opensAt = new Date(`${kstDate}T09:00:00+09:00`).getTime();
  const closesAt = new Date(`${kstDate}T23:00:00+09:00`).getTime();
  const withinTradingHours = now.getTime() >= opensAt && now.getTime() < closesAt;
  if (!state || state.status === "OPENING_PENDING") {
    return withinTradingHours ? "MARKET_OPENING_PENDING" : "MARKET_CLOSED";
  }
  if (
    state.status === "CLOSED" &&
    state.nextSlotAt !== undefined &&
    withinTradingHours && now.getTime() >= state.nextSlotAt.getTime()
  ) return "MARKET_OPENING_PENDING";
  if (
    state.status === "OPEN" &&
    state.tradingDate < kstDate &&
    withinTradingHours
  ) return "MARKET_OPENING_PENDING";
  return "MARKET_CLOSED";
}

/** 거래 transaction 안에서 시장 상태와 종목 상태를 모두 write-fence 한다. */
export async function claimMarketTradableStockPrice(
  ticker: string,
  now: Date,
  session: ClientSession,
): Promise<StockPrice> {
  const stateCol = await col<StockMarketState>(MARKET_STATE);
  const state = await stateCol.findOneAndUpdate(
    {
      _id: STOCK_MARKET_STATE_ID,
      status: "OPEN",
      opensAt: { $lte: now },
      closesAt: { $gt: now },
    },
    { $inc: { tradeRevision: 1 } },
    { returnDocument: "after", session },
  );
  if (!state) {
    const existing = await stateCol.findOne(
      { _id: STOCK_MARKET_STATE_ID },
      { session },
    );
    throw new StockMarketTradeClaimError(
      classifyStockMarketStateTradeError(existing, now),
    );
  }

  const prices = await stockPricesCol();
  const claimed = await prices.findOneAndUpdate(
    {
      ticker,
      isTradingHalted: { $ne: true },
      $or: [
        { cooldownUntil: { $exists: false } },
        { cooldownUntil: { $lte: now } },
      ],
    },
    { $inc: { tradeRevision: 1 } },
    { returnDocument: "after", session },
  );
  if (claimed) return claimed;
  const existing = await prices.findOne({ ticker }, { session });
  if (!existing) throw new StockMarketTradeClaimError("PRICE_NOT_FOUND");
  if (existing.isTradingHalted) {
    throw new StockMarketTradeClaimError("STOCK_TRADING_HALTED");
  }
  throw new StockMarketTradeClaimError("STOCK_COOLING_DOWN");
}

/** 기능 플래그가 꺼진 배포에서는 기존 개별 정지 claim을 그대로 사용한다. */
export async function claimCompatibleTradableStockPrice(
  ticker: string,
  now: Date,
  session: ClientSession,
  options: { novexV2Enabled: boolean },
): Promise<StockPrice> {
  return options.novexV2Enabled
    ? claimMarketTradableStockPrice(ticker, now, session)
    : claimTradableStockPrice(ticker, session);
}

/**
 * GM 지급은 폐장·정지·냉각과 무관하게 허용하되, 실제 운영 시세 문서를
 * write-fence해 가격 회차와 시즌 외부유입 평가가 같은 가격을 보도록 한다.
 */
export async function claimAdministrativeStockPrice(
  ticker: string,
  session: ClientSession,
): Promise<StockPrice> {
  const claimed = await (await stockPricesCol()).findOneAndUpdate(
    { ticker },
    { $inc: { tradeRevision: 1 } },
    { returnDocument: "after", session },
  );
  if (!claimed) throw new StockMarketTradeClaimError("PRICE_NOT_FOUND");
  return claimed;
}

export async function upsertStockMarketCalendarException(
  input: Omit<StockMarketCalendarException, "_id" | "createdAt" | "updatedAt">,
  session: ClientSession,
): Promise<StockMarketCalendarException> {
  const now = new Date();
  const collection = await col<StockMarketCalendarException>(CALENDAR_EXCEPTIONS);
  const saved = await collection.findOneAndUpdate(
    { _id: `stock-calendar:${input.kstDate}` },
    {
      $set: { ...input, updatedAt: now },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true, returnDocument: "after", session },
  );
  if (!saved) throw new Error("Failed to save stock calendar exception");
  return saved;
}

export async function getStockMarketCalendarException(
  kstDate: string,
  options: { session?: ClientSession } = {},
): Promise<StockMarketCalendarException | null> {
  return (await col<StockMarketCalendarException>(CALENDAR_EXCEPTIONS)).findOne(
    { _id: `stock-calendar:${kstDate}` },
    { session: options.session },
  );
}

export async function listStockMarketCalendarExceptions(input: {
  from?: string;
  limit?: number;
} = {}): Promise<StockMarketCalendarException[]> {
  return (await col<StockMarketCalendarException>(CALENDAR_EXCEPTIONS))
    .find(input.from ? { kstDate: { $gte: input.from } } : {})
    .sort({ kstDate: 1 })
    .limit(Math.min(500, Math.max(1, input.limit ?? 100)))
    .toArray();
}

export async function deleteStockMarketCalendarException(
  kstDate: string,
  session: ClientSession,
): Promise<boolean> {
  const result = await (await col<StockMarketCalendarException>(CALENDAR_EXCEPTIONS)).deleteOne(
    { _id: `stock-calendar:${kstDate}` },
    { session },
  );
  return result.deletedCount === 1;
}

export async function recordStockOrderFlow(
  input: Omit<StockOrderFlow, "_id" | "consumedSlotKey" | "consumedAt">,
  session: ClientSession,
): Promise<StockOrderFlow> {
  if (!Number.isInteger(input.shares) || input.shares <= 0) {
    throw new Error("Stock order flow shares must be a positive integer");
  }
  const collection = await col<StockOrderFlow>(ORDER_FLOW);
  try {
    const result = await collection.insertOne(input, { session });
    await recordStockSeasonFlow({
      operationKey: `season:${input.operationKey}`,
      characterId: input.characterId,
      ticker: input.ticker,
      kind: input.side,
      shares: input.shares,
      marketPrice: input.price,
      externalAmount: (input.side === "BUY" ? 1 : -1) * input.shares * input.price,
      returnAmount: 0,
      occurredAt: input.occurredAt,
    }, session);
    return { ...input, _id: result.insertedId };
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11_000) throw error;
    const existing = await collection.findOne(
      { operationKey: input.operationKey },
      { session },
    );
    if (!existing) throw error;
    return existing;
  }
}

/**
 * 시즌 외부 자금/배당 수익 원장. 호출자는 주식 보유 mutation과 같은 session을 넘긴다.
 * operationKey unique로 transaction retry와 API idempotency 재실행을 흡수한다.
 */
export async function recordStockSeasonFlow(
  input: Omit<StockSeasonFlow, "_id" | "evaluatedSlotKey" | "evaluatedAt">,
  session: ClientSession,
): Promise<StockSeasonFlow> {
  if (!input.operationKey.trim()) throw new Error("Stock season flow operationKey is required");
  if (!Number.isInteger(input.shares) || input.shares < 0) {
    throw new Error("Stock season flow shares must be a non-negative integer");
  }
  if (!Number.isFinite(input.marketPrice) || input.marketPrice < 0) {
    throw new Error("Stock season flow marketPrice must be non-negative");
  }
  const flows = await col<StockSeasonFlow>(SEASON_FLOWS);
  try {
    const inserted = await flows.insertOne(input, { session });
    return { ...input, _id: inserted.insertedId };
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11_000) throw error;
    const existing = await flows.findOne({ operationKey: input.operationKey }, { session });
    if (!existing) throw error;
    return existing;
  }
}

export interface StockFlowAggregate {
  ticker: string;
  netShares: number;
  volume: number;
  percent: number;
  signal: StockFlowSignal;
}

/** character별 매수/매도를 먼저 상계하고 각 character 기여를 ±100주로 제한한다. */
export function aggregateStockOrderFlow(
  rows: readonly Pick<StockOrderFlow, "characterId" | "ticker" | "side" | "shares">[],
): StockFlowAggregate[] {
  const byTickerActor = new Map<string, number>();
  const volumes = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.ticker}\u0000${row.characterId}`;
    byTickerActor.set(
      key,
      (byTickerActor.get(key) ?? 0) + (row.side === "BUY" ? row.shares : -row.shares),
    );
    volumes.set(row.ticker, (volumes.get(row.ticker) ?? 0) + row.shares);
  }
  const nets = new Map<string, number>();
  for (const [key, net] of byTickerActor) {
    const ticker = key.split("\u0000", 1)[0]!;
    nets.set(ticker, (nets.get(ticker) ?? 0) + Math.max(-100, Math.min(100, net)));
  }
  return [...new Set([...nets.keys(), ...volumes.keys()])].map((ticker) => {
    const netShares = nets.get(ticker) ?? 0;
    const percent = 0.03 * Math.tanh(netShares / 200);
    const magnitude = Math.abs(percent);
    return {
      ticker,
      netShares,
      volume: volumes.get(ticker) ?? 0,
      percent,
      signal: {
        ticker,
        direction: netShares > 0 ? "BUY" : netShares < 0 ? "SELL" : "NEUTRAL",
        strength: magnitude < 0.01 ? "WEAK" : magnitude < 0.02 ? "MODERATE" : "STRONG",
        volume: volumes.get(ticker) ?? 0,
      },
    };
  });
}

export async function listPendingStockFlowSignals(): Promise<StockFlowSignal[]> {
  return (await listPendingStockFlowAggregates()).map((row) => row.signal);
}

/** worker shadow/round 내부용. 플레이어 응답에는 percent/netShares를 직렬화하지 않는다. */
export async function listPendingStockFlowAggregates(): Promise<StockFlowAggregate[]> {
  const rows = await (await col<StockOrderFlow>(ORDER_FLOW))
    .find({ consumedSlotKey: { $exists: false } })
    .project<Pick<StockOrderFlow, "characterId" | "ticker" | "side" | "shares">>({
      characterId: 1,
      ticker: 1,
      side: 1,
      shares: 1,
    })
    .toArray();
  return aggregateStockOrderFlow(rows);
}

export interface CreateStockDisclosureInput {
  id: string;
  title: string;
  body: string;
  kind: StockDisclosure["kind"];
  status: "DRAFT" | "SCHEDULED" | "PUBLISHED";
  source: StockDisclosure["source"];
  effects: StockDisclosureEffect[];
  publishAt?: Date;
  slotKey?: string;
  shock?: boolean;
  forceCooldown?: boolean;
  templateId?: string;
  createdById: string;
  now?: Date;
}

export class StockDisclosureConflictError extends Error {
  readonly code = "STOCK_DISCLOSURE_PRICE_EFFECT_CONFLICT";
  constructor() {
    super("STOCK_DISCLOSURE_PRICE_EFFECT_CONFLICT");
    this.name = "StockDisclosureConflictError";
  }
}

export class StockDisclosureCutoffError extends Error {
  readonly code = "STOCK_DISCLOSURE_CUTOFF_PASSED";
  constructor() {
    super("STOCK_DISCLOSURE_CUTOFF_PASSED");
    this.name = "StockDisclosureCutoffError";
  }
}

export class StockCorporateActionDisclosureError extends Error {
  readonly code = "STOCK_CORPORATE_ACTION_DISCLOSURE_MANAGED";
  constructor() {
    super("STOCK_CORPORATE_ACTION_DISCLOSURE_MANAGED");
    this.name = "StockCorporateActionDisclosureError";
  }
}

const STOCK_DISCLOSURE_SLOT_PATTERN =
  /^\d{4}-\d{2}-\d{2} (?:09|13|18|23):00$/;

function assertScheduledDisclosureFuture(
  disclosure: Pick<StockDisclosure, "status" | "publishAt" | "slotKey">,
  now: Date,
): void {
  if (disclosure.status !== "SCHEDULED") return;
  if (
    !disclosure.slotKey ||
    !STOCK_DISCLOSURE_SLOT_PATTERN.test(disclosure.slotKey) ||
    !disclosure.publishAt
  ) {
    throw new StockDisclosureCutoffError();
  }
  const slotAt = new Date(
    `${disclosure.slotKey.replace(" ", "T")}:00+09:00`,
  );
  if (
    Number.isNaN(slotAt.getTime()) ||
    slotAt.getTime() !== disclosure.publishAt.getTime() ||
    slotAt.getTime() <= now.getTime()
  ) {
    throw new StockDisclosureCutoffError();
  }
}

function validateDisclosureEffects(effects: readonly StockDisclosureEffect[]): void {
  const tickerTargets = new Set<string>();
  for (const effect of effects) {
    if (effect.scope === "TICKER" && !effect.ticker) {
      throw new Error("Ticker disclosure effect requires ticker");
    }
    if (effect.ticker) {
      if (tickerTargets.has(effect.ticker)) throw new Error("Duplicate ticker disclosure effect");
      tickerTargets.add(effect.ticker);
    }
  }
}

function disclosureEffectScopeKeys(
  effects: readonly StockDisclosureEffect[],
): Set<string> {
  return new Set(effects.map((effect) =>
    effect.scope === "MARKET" ? "MARKET" : `TICKER:${effect.ticker}`,
  ));
}

export function doStockDisclosureEffectsConflict(
  left: readonly StockDisclosureEffect[],
  right: readonly StockDisclosureEffect[],
): boolean {
  const leftKeys = disclosureEffectScopeKeys(left);
  return [...disclosureEffectScopeKeys(right)].some((key) => leftKeys.has(key));
}

export function summarizeStockDisclosureEffects(
  effects: readonly StockDisclosureEffect[],
): { changePercent: number; structuralChangePercent: number } {
  return effects.reduce(
    (summary, effect) => ({
      changePercent: summary.changePercent + (effect.changePercent ?? 0),
      structuralChangePercent:
        summary.structuralChangePercent +
        (effect.structural ? (effect.changePercent ?? 0) : 0),
    }),
    { changePercent: 0, structuralChangePercent: 0 },
  );
}

async function fenceStockDisclosureSlot(
  slotKey: string,
  session: ClientSession,
): Promise<void> {
  const fences = await col<{ _id: string; revision: number }>(DISCLOSURE_FENCES);
  await fences.updateOne(
    { _id: slotKey },
    { $inc: { revision: 1 } },
    { upsert: true, session },
  );
}

export async function createStockDisclosure(
  input: CreateStockDisclosureInput,
  session: ClientSession,
): Promise<StockDisclosure> {
  validateDisclosureEffects(input.effects);
  const now = input.now ?? new Date();
  if (input.status === "PUBLISHED" && input.kind !== "INFO") {
    throw new Error("Only information disclosures can publish immediately");
  }
  assertScheduledDisclosureFuture(input, now);
  const collection = await col<StockDisclosure>(DISCLOSURES);
  if (input.status === "SCHEDULED" && input.slotKey) {
    await fenceStockDisclosureSlot(input.slotKey, session);
    // fence 대기 또는 transaction retry 중 cutoff가 지난 예약은 저장하지 않는다.
    assertScheduledDisclosureFuture(input, new Date());
  }
  if (input.kind === "PRICE" && input.status === "SCHEDULED" && input.slotKey) {
    const sameSlot = await collection.find({
      status: "SCHEDULED",
      kind: "PRICE",
      slotKey: input.slotKey,
    }, { session }).toArray();
    const conflicts = sameSlot.filter((row) =>
      doStockDisclosureEffectsConflict(input.effects, row.effects),
    );
    if (conflicts.length) {
      if (input.source !== "GM" || conflicts.some((row) => row.source === "GM")) {
        throw new StockDisclosureConflictError();
      }
      await collection.updateMany(
        { _id: { $in: conflicts.map((row) => row._id) }, status: "SCHEDULED", source: "AUTO" },
        { $set: { status: "CANCELLED", cancelledAt: now, updatedAt: now } },
        { session },
      );
    }
  }
  const doc: StockDisclosure = {
    _id: input.id,
    title: input.title,
    body: input.body,
    kind: input.kind,
    status: input.status,
    source: input.source,
    effects: input.effects,
    publishAt: input.publishAt,
    slotKey: input.slotKey,
    shock: input.shock,
    forceCooldown: input.forceCooldown,
    templateId: input.templateId,
    createdById: input.createdById,
    createdAt: now,
    updatedAt: now,
    publishedAt: input.status === "PUBLISHED" ? now : undefined,
  };
  await collection.insertOne(doc, { session });
  if (doc.kind === "INFO" && doc.status === "PUBLISHED") {
    await emitPublishedInformationDisclosureAlerts([doc], session);
  }
  return doc;
}

export async function updateStockDisclosure(
  id: string,
  patch: Partial<Pick<StockDisclosure, "title" | "body" | "kind" | "source" | "effects" | "publishAt" | "slotKey" | "status" | "shock" | "forceCooldown">>,
  now: Date,
  session: ClientSession,
): Promise<StockDisclosure | null> {
  if (patch.effects) validateDisclosureEffects(patch.effects);
  const collection = await col<StockDisclosure>(DISCLOSURES);
  const existing = await collection.findOne(
    {
      _id: id,
      $or: [
        { status: "DRAFT" },
        { status: "SCHEDULED", publishAt: { $gt: now } },
      ],
    },
    { session },
  );
  if (!existing) return null;
  if (existing.source === "CORPORATE_ACTION") {
    throw new StockCorporateActionDisclosureError();
  }
  const candidate = { ...existing, ...patch };
  if (candidate.status === "PUBLISHED" && candidate.kind !== "INFO") {
    throw new Error("Only information disclosures can publish immediately");
  }
  assertScheduledDisclosureFuture(candidate, now);
  if (candidate.status === "SCHEDULED" && candidate.slotKey) {
    await fenceStockDisclosureSlot(candidate.slotKey, session);
    assertScheduledDisclosureFuture(candidate, new Date());
  }
  if (candidate.kind === "PRICE" && candidate.status === "SCHEDULED" && candidate.slotKey) {
    const sameSlot = await collection.find({
      _id: { $ne: id },
      status: "SCHEDULED",
      kind: "PRICE",
      slotKey: candidate.slotKey,
    }, { session }).toArray();
    const conflicts = sameSlot.filter((row) =>
      doStockDisclosureEffectsConflict(candidate.effects, row.effects),
    );
    if (conflicts.length) {
      if (candidate.source !== "GM" || conflicts.some((row) => row.source === "GM")) {
        throw new StockDisclosureConflictError();
      }
      await collection.updateMany(
        { _id: { $in: conflicts.map((row) => row._id) }, status: "SCHEDULED", source: "AUTO" },
        { $set: { status: "CANCELLED", cancelledAt: now, updatedAt: now } },
        { session },
      );
    }
  }
  const publishedImmediately = candidate.kind === "INFO" && candidate.status === "PUBLISHED";
  const saved = await collection.findOneAndUpdate(
    {
      _id: id,
      $or: [
        { status: "DRAFT" },
        { status: "SCHEDULED", publishAt: { $gt: now } },
      ],
    },
    { $set: {
      ...patch,
      updatedAt: now,
      ...(publishedImmediately ? { publishedAt: now } : {}),
    } },
    { returnDocument: "after", session },
  );
  if (saved && publishedImmediately) {
    await emitPublishedInformationDisclosureAlerts([saved], session);
  }
  return saved;
}

export async function cancelStockDisclosure(
  id: string,
  now: Date,
  session: ClientSession,
  options: { allowCorporateAction?: boolean } = {},
): Promise<StockDisclosure | null> {
  const collection = await col<StockDisclosure>(DISCLOSURES);
  const existing = await collection.findOne(
    {
      _id: id,
      $or: [
        { status: "DRAFT" },
        { status: "SCHEDULED", publishAt: { $gt: now } },
      ],
    },
    { session },
  );
  if (!existing) return null;
  if (
    existing.source === "CORPORATE_ACTION" &&
    options.allowCorporateAction !== true
  ) {
    throw new StockCorporateActionDisclosureError();
  }
  if (existing.status === "SCHEDULED" && existing.slotKey) {
    await fenceStockDisclosureSlot(existing.slotKey, session);
    // fence 대기 또는 transaction retry 중 공개 시각이 지난 취소는 commit하지 않는다.
    assertScheduledDisclosureFuture(existing, new Date());
  }
  const cancelledAt = existing.status === "SCHEDULED" ? new Date() : now;
  return collection.findOneAndUpdate(
    {
      _id: id,
      $or: [
        { status: "DRAFT" },
        { status: "SCHEDULED", publishAt: { $gt: cancelledAt } },
      ],
    },
    {
      $set: {
        status: "CANCELLED",
        cancelledAt,
        updatedAt: cancelledAt,
      },
    },
    { returnDocument: "after", session },
  );
}

export async function listStockDisclosures(input: {
  now: Date;
  includeDrafts?: boolean;
  limit?: number;
}): Promise<StockDisclosure[]> {
  const statuses: StockDisclosure["status"][] = input.includeDrafts
    ? ["DRAFT", "SCHEDULED", "PUBLISHED", "CANCELLED"]
    : ["SCHEDULED", "PUBLISHED"];
  return (await col<StockDisclosure>(DISCLOSURES))
    .find({ status: { $in: statuses } })
    .sort({ publishAt: -1, createdAt: -1 })
    .limit(Math.min(500, Math.max(1, input.limit ?? 100)))
    .toArray();
}

export async function getScheduledStockDisclosureQueueStatsForDate(
  kstDate: string,
): Promise<{ count: number; shockCount: number }> {
  const end = new Date(
    new Date(`${kstDate}T00:00:00+09:00`).getTime() + 24 * 60 * 60 * 1000,
  );
  const collection = await col<StockDisclosure>(DISCLOSURES);
  const filter = {
    status: "SCHEDULED",
    source: "AUTO",
    publishAt: { $lt: end },
  } as const;
  const [count, shockCount] = await Promise.all([
    collection.countDocuments(filter),
    collection.countDocuments({ ...filter, shock: true }),
  ]);
  return { count, shockCount };
}

export async function countScheduledStockDisclosuresForDate(
  kstDate: string,
): Promise<number> {
  return (await getScheduledStockDisclosureQueueStatsForDate(kstDate)).count;
}

export async function createAutomaticStockDisclosureQueue(
  inputs: CreateStockDisclosureInput[],
): Promise<{ created: number; skipped: number }> {
  if (!inputs.length) return { created: 0, skipped: 0 };
  const client = await getClient();
  const session = client.startSession();
  let created = 0;
  let skipped = 0;
  try {
    await session.withTransaction(async () => {
      let transactionCreated = 0;
      let transactionSkipped = 0;
      const disclosures = await col<StockDisclosure>(DISCLOSURES);
      for (const input of inputs) {
        if (await disclosures.findOne({ _id: input.id }, { session, projection: { _id: 1 } })) {
          transactionSkipped += 1;
          continue;
        }
        try {
          await createStockDisclosure(input, session);
          transactionCreated += 1;
        } catch (error) {
          if (error instanceof StockDisclosureConflictError) {
            transactionSkipped += 1;
            continue;
          }
          throw error;
        }
      }
      created = transactionCreated;
      skipped = transactionSkipped;
    });
    return { created, skipped };
  } finally {
    await session.endSession();
  }
}

export async function getStockMarketPreference(
  userId: string,
  options: { session?: ClientSession } = {},
): Promise<StockMarketPreference | null> {
  return (await col<StockMarketPreference>(PREFERENCES)).findOne(
    { _id: userId },
    { session: options.session },
  );
}

export function mergeStockPreferenceValues(
  server: Pick<StockMarketPreference, "watchlist" | "alerts">,
  local: Pick<StockMarketPreference, "watchlist" | "alerts">,
): Pick<StockMarketPreference, "watchlist" | "alerts"> {
  const watchlist = [...new Set([...server.watchlist, ...local.watchlist])].slice(0, 9);
  const seen = new Set(server.alerts.map((alert) => alert.id));
  const localAlerts = local.alerts.filter((alert) => {
    if (seen.has(alert.id)) return false;
    seen.add(alert.id);
    return true;
  });
  return { watchlist, alerts: [...server.alerts, ...localAlerts].slice(0, 50) };
}

export async function upsertStockMarketPreference(
  userId: string,
  input: Pick<StockMarketPreference, "watchlist" | "alerts" | "migratedLocalStorageAt">,
  options: { session?: ClientSession } = {},
): Promise<StockMarketPreference> {
  const now = new Date();
  const watchlist = [...new Set(input.watchlist)].slice(0, 9);
  const alerts = input.alerts.filter(
    (alert, index, rows) => rows.findIndex((row) => row.id === alert.id) === index,
  ).slice(0, 50);
  const saved = await (await col<StockMarketPreference>(PREFERENCES)).findOneAndUpdate(
    { _id: userId },
    {
      $set: { userId, ...input, watchlist, alerts, updatedAt: now },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true, returnDocument: "after", session: options.session },
  );
  if (!saved) throw new Error("Failed to save stock market preference");
  return saved;
}

/** localStorage→서버 최초 전환만 합치며 이후 호출은 기존 서버 설정을 보존한다. */
export async function mergeStockMarketPreferenceFromLocalStorage(
  userId: string,
  input: Pick<StockMarketPreference, "watchlist" | "alerts">,
  migratedAt: Date,
  session: ClientSession,
): Promise<StockMarketPreference> {
  const collection = await col<StockMarketPreference>(PREFERENCES);
  await collection.updateOne(
    { _id: userId },
    {
      $setOnInsert: {
        userId,
        watchlist: [],
        alerts: [],
        createdAt: migratedAt,
        updatedAt: migratedAt,
      },
    },
    { upsert: true, session },
  );
  const current = await collection.findOne({ _id: userId }, { session });
  if (!current) throw new Error("Failed to initialize stock market preference");
  if (current.migratedLocalStorageAt) return current;
  const { watchlist, alerts } = mergeStockPreferenceValues(current, input);
  const saved = await collection.findOneAndUpdate(
    { _id: userId, migratedLocalStorageAt: { $exists: false }, updatedAt: current.updatedAt },
    { $set: { watchlist, alerts, migratedLocalStorageAt: migratedAt, updatedAt: migratedAt } },
    { returnDocument: "after", session },
  );
  if (saved) return saved;
  const existing = await collection.findOne({ _id: userId }, { session });
  if (!existing) throw new Error("Failed to merge stock market preference");
  return existing;
}

export interface StockClosingPriceSnapshot {
  ticker: string;
  price: number;
  slotKey: string;
  createdAt: Date;
}

/** 배당 예약 검증용 직전 23시 확정 종가. 장중 current price를 종가로 오인하지 않는다. */
export async function getLatestStockClosingPrice(
  ticker: string,
  options: { before?: Date; session?: ClientSession } = {},
): Promise<StockClosingPriceSnapshot | null> {
  const row = await (await stockPriceHistoryCol()).findOne(
    {
      ticker,
      source: "scheduled",
      slotKey: { $regex: " 23:00$" },
      ...(options.before ? { createdAt: { $lt: options.before } } : {}),
    },
    { sort: { createdAt: -1 }, session: options.session },
  );
  return row?.slotKey
    ? { ticker: row.ticker, price: row.price, slotKey: row.slotKey, createdAt: row.createdAt }
    : null;
}

export class StockCorporateActionConflictError extends Error {
  readonly code = "STOCK_CORPORATE_ACTION_SLOT_CONFLICT";
  constructor() {
    super("STOCK_CORPORATE_ACTION_SLOT_CONFLICT");
    this.name = "StockCorporateActionConflictError";
  }
}

export class StockCorporateActionCutoffError extends Error {
  readonly code = "STOCK_CORPORATE_ACTION_CUTOFF_PASSED";
  constructor() {
    super("STOCK_CORPORATE_ACTION_CUTOFF_PASSED");
    this.name = "StockCorporateActionCutoffError";
  }
}

function corporateActionSlotKey(action: StockCorporateAction): string {
  return action.type === "DIVIDEND"
    ? action.recordSlotKey
    : action.executeSlotKey;
}

function stockSlotKeyDate(slotKey: string): Date {
  return new Date(`${slotKey.replace(" ", "T")}:00+09:00`);
}

export async function createStockCorporateAction(
  action: StockCorporateAction,
  session: ClientSession,
): Promise<StockCorporateAction> {
  if (action.type === "DIVIDEND" && action.amountPerShare <= 0) {
    throw new Error("Dividend amount must be positive");
  }
  if (action.type === "DIVIDEND") {
    const priorClose = await getLatestStockClosingPrice(action.ticker, {
      before: action.createdAt,
      session,
    });
    if (!priorClose) throw new Error("Dividend prior 23:00 close not found");
    if (action.amountPerShare > priorClose.price * 0.25) {
      throw new Error("Dividend amount exceeds 25% of the prior close");
    }
  }
  if (action.type === "SPLIT" && (!Number.isInteger(action.factor) || action.factor < 2 || action.factor > 10)) {
    throw new Error("Split factor must be an integer from 2 through 10");
  }
  const slotKey = corporateActionSlotKey(action);
  await fenceStockDisclosureSlot(slotKey, session);
  const priceFence = await (await stockPricesCol()).updateOne(
    { ticker: action.ticker },
    { $inc: { corporateActionRevision: 1 } },
    { session },
  );
  if (priceFence.matchedCount !== 1) throw new Error("Corporate action stock price not found");
  if (stockSlotKeyDate(slotKey).getTime() <= Date.now()) {
    throw new StockCorporateActionCutoffError();
  }
  const actionCollection = await col<StockCorporateAction>(CORPORATE_ACTIONS);
  const slotField = action.type === "DIVIDEND" ? "recordSlotKey" : "executeSlotKey";
  const conflict = await actionCollection.findOne({
    type: action.type,
    ticker: action.ticker,
    status: "SCHEDULED",
    [slotField]: slotKey,
  }, { session });
  if (conflict) throw new StockCorporateActionConflictError();
  await actionCollection.insertOne(action, { session });
  await createStockDisclosure({
    id: `stock-disclosure:corporate-action:${action._id}`,
    title: action.type === "DIVIDEND"
      ? `${action.ticker} 배당 기준일 공시`
      : `${action.ticker} ${action.factor}:1 액면분할 공시`,
    body: action.type === "DIVIDEND"
      ? `주당 ${action.amountPerShare.toFixed(2)} CR 배당이 예정되었습니다.`
      : `${action.factor}:1 정방향 액면분할이 예정되었습니다.`,
    kind: "INFO",
    status: "SCHEDULED",
    source: "CORPORATE_ACTION",
    effects: [{ scope: "TICKER", ticker: action.ticker, structural: false }],
    slotKey: action.type === "DIVIDEND" ? action.recordSlotKey : action.executeSlotKey,
    publishAt: new Date(`${(action.type === "DIVIDEND" ? action.recordSlotKey : action.executeSlotKey).replace(" ", "T")}:00+09:00`),
    createdById: action.createdById,
    now: action.createdAt,
  }, session);
  return action;
}

export function isStockDividendWithinCloseLimit(
  amountPerShare: number,
  closePrice: number,
): boolean {
  return amountPerShare > 0 && closePrice > 0 && amountPerShare <= closePrice * 0.25;
}

export function resolveStockDividendLifecycle(input: {
  pendingEntitlements: number;
  payoutCompletedAt?: Date;
  exDateAppliedAt?: Date;
}): Pick<StockDividendAction, "status" | "payoutCompletedAt" | "exDateAppliedAt"> {
  const payoutCompletedAt = input.pendingEntitlements === 0
    ? input.payoutCompletedAt
    : undefined;
  return {
    status: payoutCompletedAt && input.exDateAppliedAt
      ? "COMPLETED"
      : input.exDateAppliedAt
        ? "PROCESSING"
        : "SNAPSHOTTED",
    payoutCompletedAt,
    exDateAppliedAt: input.exDateAppliedAt,
  };
}

export function calculateStockDividendEligibleShares(
  holdings: ReadonlyArray<{ characterId: string; shares: number }>,
  postRecordGrants: ReadonlyArray<{ characterId: string; shares: number }>,
): Array<{ characterId: string; shares: number }> {
  const excludedShares = new Map<string, number>();
  for (const grant of postRecordGrants) {
    excludedShares.set(
      grant.characterId,
      (excludedShares.get(grant.characterId) ?? 0) + grant.shares,
    );
  }
  return holdings
    .map((holding) => ({
      characterId: holding.characterId,
      shares: Math.max(
        0,
        holding.shares - (excludedShares.get(holding.characterId) ?? 0),
      ),
    }))
    .filter((holding) => holding.shares > 0);
}

export async function listStockCorporateActions(input: {
  statuses?: StockCorporateAction["status"][];
  limit?: number;
} = {}): Promise<StockCorporateAction[]> {
  return (await col<StockCorporateAction>(CORPORATE_ACTIONS))
    .find(input.statuses ? { status: { $in: input.statuses } } : {})
    .sort({ createdAt: -1 })
    .limit(Math.min(200, Math.max(1, input.limit ?? 100)))
    .toArray();
}

export async function cancelStockCorporateAction(
  id: string,
  now: Date,
  session: ClientSession,
): Promise<StockCorporateAction | null> {
  const actions = await col<StockCorporateAction>(CORPORATE_ACTIONS);
  const current = await actions.findOne(
    { _id: id, status: "SCHEDULED" },
    { session },
  );
  if (!current) return null;
  const disclosure = await cancelStockDisclosure(
    `stock-disclosure:corporate-action:${id}`,
    now,
    session,
    { allowCorporateAction: true },
  );
  if (!disclosure) {
    throw new Error(`Corporate action disclosure is not cancellable: ${id}`);
  }
  const cancelled = await actions.findOneAndUpdate(
    { _id: id, status: "SCHEDULED" },
    { $set: { status: "CANCELLED", updatedAt: now } },
    { returnDocument: "after", session },
  );
  if (!cancelled) throw new Error(`Corporate action cancellation lost: ${id}`);
  return cancelled;
}

/** 23시 보유량을 배당 권리로 고정한다. 결정적 entitlement id로 재실행해도 중복되지 않는다. */
export async function snapshotStockDividendEntitlements(
  actionId: string,
  now: Date,
  session: ClientSession,
): Promise<{ status: "SNAPSHOTTED" | "REJECTED"; count: number }> {
  const actions = await col<StockCorporateAction>(CORPORATE_ACTIONS);
  const action = await actions.findOne({ _id: actionId, type: "DIVIDEND" }, { session });
  if (!action || action.type !== "DIVIDEND") throw new Error("Dividend action not found");
  const closePrice = await (await stockPricesCol()).findOne(
    { ticker: action.ticker },
    { session },
  );
  if (!closePrice) throw new Error("Dividend close price not found");
  if (!isStockDividendWithinCloseLimit(action.amountPerShare, closePrice.price)) {
    await actions.updateOne(
      { _id: actionId, status: "SCHEDULED" },
      { $set: { status: "ERROR", failureReason: "DIVIDEND_EXCEEDS_25_PERCENT_OF_CLOSE", updatedAt: now } },
      { session },
    );
    return { status: "REJECTED", count: 0 };
  }
  const holdings = await stockHoldingsCol();
  const rows = await holdings.find({ ticker: action.ticker, shares: { $gt: 0 } }, { session }).toArray();
  const recordAt = stockSlotKeyDate(action.recordSlotKey);
  const postRecordGrants = await (await col<StockSeasonFlow>(SEASON_FLOWS))
    .find(
      {
        ticker: action.ticker,
        kind: "GM_GRANT",
        occurredAt: { $gt: recordAt, $lte: now },
      },
      { session },
    )
    .toArray();
  const eligibleShares = new Map(
    calculateStockDividendEligibleShares(rows, postRecordGrants).map(
      (holding) => [holding.characterId, holding.shares],
    ),
  );
  const eligibleRows = rows
    .filter((holding) => eligibleShares.has(holding.characterId))
    .map((holding) => ({
      ...holding,
      shares: eligibleShares.get(holding.characterId)!,
    }));
  const entitlements = await col<StockDividendEntitlement>(DIVIDEND_ENTITLEMENTS);
  if (eligibleRows.length) {
    await entitlements.bulkWrite(
      eligibleRows.map((holding) => ({
        updateOne: {
          filter: { _id: `stock-dividend:${actionId}:${holding.characterId}` },
          update: {
            $setOnInsert: {
              actionId,
              characterId: holding.characterId,
              shares: holding.shares,
              amount: Math.round(holding.shares * action.amountPerShare * 100) / 100,
              status: "PENDING",
              creditRequestId: `stock-dividend:${actionId}:${holding.characterId}`,
              createdAt: now,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false, session },
    );
  }
  await actions.updateOne(
    { _id: actionId, status: "SCHEDULED" },
    { $set: {
      status: "SNAPSHOTTED",
      updatedAt: now,
      ...(eligibleRows.length === 0 ? { payoutCompletedAt: now } : {}),
    } },
    { session },
  );
  return { status: "SNAPSHOTTED", count: eligibleRows.length };
}

export async function listPendingStockDividendEntitlements(limit = 100): Promise<StockDividendEntitlement[]> {
  return (await col<StockDividendEntitlement>(DIVIDEND_ENTITLEMENTS))
    .find({ status: "PENDING" })
    .sort({ createdAt: 1 })
    .limit(Math.min(500, Math.max(1, limit)))
    .toArray();
}

export async function markStockDividendEntitlementPaid(
  id: string,
  paidAt: Date,
  session: ClientSession,
): Promise<boolean> {
  const result = await (await col<StockDividendEntitlement>(DIVIDEND_ENTITLEMENTS)).updateOne(
    { _id: id, status: "PENDING" },
    { $set: { status: "PAID", paidAt } },
    { session },
  );
  return result.modifiedCount === 1;
}

export async function payNextPendingStockDividendEntitlement(): Promise<
  | { status: "EMPTY" }
  | { status: "PAID"; entitlementId: string; amount: number }
  | { status: "ERROR"; entitlementId: string; error: string }
> {
  const entitlementCol = await col<StockDividendEntitlement>(DIVIDEND_ENTITLEMENTS);
  const candidate = await entitlementCol.findOne(
    { status: "PENDING" },
    { sort: { createdAt: 1, _id: 1 } },
  );
  if (!candidate) return { status: "EMPTY" };
  const client = await getClient();
  const session = client.startSession();
  let outcome:
    | { status: "PAID"; entitlementId: string; amount: number }
    | { status: "ERROR"; entitlementId: string; error: string }
    | null = null;
  try {
    await session.withTransaction(async () => {
      const entitlement = await entitlementCol.findOne(
        { _id: candidate._id, status: "PENDING" },
        { session },
      );
      if (!entitlement) return;
      const markPermanentError = async (reason: string) => {
        await entitlementCol.updateOne(
          { _id: entitlement._id, status: "PENDING" },
          {
            $set: {
              status: "ERROR",
              failureReason: reason,
              failedAt: new Date(),
            },
          },
          { session },
        );
        await (await col<StockCorporateAction>(CORPORATE_ACTIONS)).updateOne(
          { _id: entitlement.actionId, type: "DIVIDEND" },
          { $set: { failureReason: reason, updatedAt: new Date() } },
          { session },
        );
        outcome = {
          status: "ERROR",
          entitlementId: entitlement._id,
          error: reason,
        };
      };
      if (!ObjectId.isValid(entitlement.characterId)) {
        await markPermanentError("INVALID_CHARACTER_ID");
        return;
      }
      const character = await (await charactersCol()).findOne(
        { _id: new ObjectId(entitlement.characterId) },
        { session },
      );
      if (!character?.ownerId || !ObjectId.isValid(character.ownerId)) {
        await markPermanentError("CHARACTER_OWNER_NOT_FOUND");
        return;
      }
      const owner = await (await usersCol()).findOne(
        { _id: new ObjectId(character.ownerId) },
        { session },
      );
      if (!owner) {
        await markPermanentError("DIVIDEND_OWNER_NOT_FOUND");
        return;
      }
      const dividendAction = await (await col<StockCorporateAction>(CORPORATE_ACTIONS)).findOne(
        { _id: entitlement.actionId, type: "DIVIDEND" },
        { session },
      );
      if (!dividendAction || dividendAction.type !== "DIVIDEND") {
        await markPermanentError("DIVIDEND_ACTION_NOT_FOUND");
        return;
      }
      await addCredit({
        characterId: entitlement.characterId,
        characterCodename: character.codename,
        ownerId: character.ownerId,
        ownerName: owner.displayName,
        amount: entitlement.amount,
        type: "STOCK_DIVIDEND",
        description: "NOVEX 주식 배당",
        createdById: "000000000000000000000001",
        createdByName: "NOVEX",
        metadata: { actionId: entitlement.actionId, shares: entitlement.shares },
        requestId: entitlement.creditRequestId,
        session,
      });
      const dividendDedupeKey = `stock:dividend:${entitlement._id}`;
      await (await notificationsCol()).updateOne(
        { dedupeKey: dividendDedupeKey },
        { $setOnInsert: {
          userId: character.ownerId,
          dedupeKey: dividendDedupeKey,
          type: "STOCK",
          title: "NOVEX 배당 지급",
          message: `${character.codename}에게 ${entitlement.amount.toFixed(2)} CR 배당이 지급되었습니다.`,
          link: "/erp/stock",
          isRead: false,
          createdAt: new Date(),
        } },
        { upsert: true, session },
      );
      const marked = await entitlementCol.updateOne(
        { _id: entitlement._id, status: "PENDING" },
        { $set: { status: "PAID", paidAt: new Date() } },
        { session },
      );
      if (marked.modifiedCount !== 1) throw new Error("Dividend entitlement claim lost");
      const remaining = await entitlementCol.countDocuments(
        { actionId: entitlement.actionId, status: { $in: ["PENDING", "ERROR"] } },
        { session },
      );
      if (remaining === 0) {
        const action = await (await col<StockCorporateAction>(CORPORATE_ACTIONS)).findOne(
          { _id: entitlement.actionId, type: "DIVIDEND" },
          { session },
        );
        const lifecycle = resolveStockDividendLifecycle({
          pendingEntitlements: remaining,
          payoutCompletedAt: new Date(),
          exDateAppliedAt: action?.type === "DIVIDEND" ? action.exDateAppliedAt : undefined,
        });
        await (await col<StockCorporateAction>(CORPORATE_ACTIONS)).updateOne(
          { _id: entitlement.actionId, status: { $in: ["SNAPSHOTTED", "PROCESSING"] } },
          { $set: {
            status: lifecycle.status,
            payoutCompletedAt: lifecycle.payoutCompletedAt,
            updatedAt: new Date(),
          } },
          { session },
        );
      }
      outcome = { status: "PAID", entitlementId: entitlement._id, amount: entitlement.amount };
    });
    return outcome ?? { status: "EMPTY" };
  } finally {
    await session.endSession();
  }
}

/** 다음 09시 배당락: 현재가와 적정가에서 같은 주당 배당액을 차감한다. */
export async function applyStockDividendExDate(
  actionId: string,
  now: Date,
  session: ClientSession,
): Promise<boolean> {
  const actions = await col<StockCorporateAction>(CORPORATE_ACTIONS);
  const action = await actions.findOne(
    { _id: actionId, type: "DIVIDEND", status: { $in: ["SNAPSHOTTED", "PROCESSING"] } },
    { session },
  );
  if (!action || action.type !== "DIVIDEND") return false;
  const prices = await stockPricesCol();
  const previous = await prices.findOne({ ticker: action.ticker }, { session });
  if (!previous) throw new Error(`Dividend stock not found: ${action.ticker}`);
  const nextPrice = Math.max(0.01, Math.round((previous.price - action.amountPerShare) * 100) / 100);
  const nextReference = Math.max(0.01, Math.round(((previous.referencePrice ?? previous.price) - action.amountPerShare) * 100) / 100);
  await prices.updateOne(
    { ticker: action.ticker },
    { $set: { prevPrice: previous.price, price: nextPrice, referencePrice: nextReference, eventText: `주당 ${action.amountPerShare.toFixed(2)} CR 배당락`, lastUpdate: action.exDateSlotKey } },
    { session },
  );
  await (await stockPriceHistoryCol()).insertOne(
    { ticker: action.ticker, price: nextPrice, prevPrice: previous.price, referencePrice: nextReference, eventText: `주당 ${action.amountPerShare.toFixed(2)} CR 배당락`, source: "dividend", slotKey: action.exDateSlotKey, effectiveAt: stockSlotKeyDate(action.exDateSlotKey), effectiveSequence: 10, createdAt: now },
    { session },
  );
  const entitlements = await (await col<StockDividendEntitlement>(DIVIDEND_ENTITLEMENTS))
    .find({ actionId }, { session })
    .toArray();
  for (const entitlement of entitlements) {
    await recordStockSeasonFlow({
      operationKey: `season:dividend:${entitlement._id}`,
      characterId: entitlement.characterId,
      ticker: action.ticker,
      kind: "DIVIDEND",
      shares: entitlement.shares,
      marketPrice: action.amountPerShare,
      externalAmount: 0,
      returnAmount: entitlement.amount,
      // 지연 실행돼도 배당 수익은 가격의 배당락과 같은 경제 slot에 귀속한다.
      occurredAt: stockSlotKeyDate(action.exDateSlotKey),
    }, session);
  }
  const pendingEntitlements = await (await col<StockDividendEntitlement>(DIVIDEND_ENTITLEMENTS)).countDocuments(
    { actionId, status: { $in: ["PENDING", "ERROR"] } },
    { session },
  );
  const lifecycle = resolveStockDividendLifecycle({
    pendingEntitlements,
    payoutCompletedAt: pendingEntitlements === 0 ? (action.payoutCompletedAt ?? now) : undefined,
    exDateAppliedAt: now,
  });
  await actions.updateOne(
    { _id: actionId },
    { $set: {
      status: lifecycle.status,
      payoutCompletedAt: lifecycle.payoutCompletedAt,
      exDateAppliedAt: now,
      updatedAt: now,
    } },
    { session },
  );
  return true;
}

export async function getActiveStockInvestmentSeason(now = new Date()): Promise<StockInvestmentSeason | null> {
  return (await col<StockInvestmentSeason>(SEASONS)).findOne({
    status: "ACTIVE",
    startsAt: { $lte: now },
    endsAt: { $gt: now },
  });
}

export async function createStockInvestmentSeason(
  season: StockInvestmentSeason,
  session: ClientSession,
): Promise<StockInvestmentSeason> {
  if (season.endsAt.getTime() <= season.startsAt.getTime()) {
    throw new Error("Stock investment season must end after it starts");
  }
  await (await col<StockInvestmentSeason>(SEASONS)).insertOne(season, { session });
  return season;
}

export async function listStockInvestmentSeasons(limit = 20): Promise<StockInvestmentSeason[]> {
  return (await col<StockInvestmentSeason>(SEASONS))
    .find()
    .sort({ startsAt: -1 })
    .limit(Math.min(100, Math.max(1, limit)))
    .toArray();
}

export async function finalizeStockInvestmentSeason(
  seasonId: string,
  performances: StockSeasonPerformance[],
  finalizedAt: Date,
  session: ClientSession,
): Promise<boolean> {
  await recalculateStockSeasonPerformance(performances, session);
  const result = await (await col<StockInvestmentSeason>(SEASONS)).updateOne(
    { _id: seasonId, status: "ACTIVE" },
    { $set: { status: "FINALIZED", finalizedAt } },
    { session },
  );
  return result.modifiedCount === 1;
}

export async function listStockSeasonLeaderboard(seasonId: string): Promise<StockSeasonLeaderboardEntry[]> {
  return (await col<StockSeasonPerformance>(SEASON_PERFORMANCE))
    .find({ seasonId, eligible: true })
    .sort({ linkedReturn: -1, codename: 1 })
    .project<StockSeasonLeaderboardEntry>({
      _id: 0,
      codename: 1,
      linkedReturn: 1,
      rank: 1,
      badge: 1,
      title: 1,
    })
    .toArray();
}

export async function getStockSeasonPerformance(
  seasonId: string,
  characterId: string,
): Promise<StockSeasonPerformance | null> {
  return (await col<StockSeasonPerformance>(SEASON_PERFORMANCE)).findOne({
    _id: `stock-season-performance:${seasonId}:${characterId}`,
  });
}

export async function listRegularSessionStartsForStockMarket(input: {
  title: string;
  start: Date;
  end: Date;
  session?: ClientSession;
}): Promise<Date[]> {
  const db = await getDb();
  const rows = await db.collection<{ title: string; targetDateTime: Date }>("sessions")
    .find(
      { title: input.title, targetDateTime: { $gte: input.start, $lt: input.end } },
      { projection: { targetDateTime: 1 }, session: input.session },
    )
    .toArray();
  return rows.map((row) => row.targetDateTime);
}

export async function recalculateStockSeasonPerformance(
  rows: StockSeasonPerformance[],
  session: ClientSession,
): Promise<void> {
  if (!rows.length) return;
  await (await col<StockSeasonPerformance>(SEASON_PERFORMANCE)).bulkWrite(
    rows.map((row) => ({
      replaceOne: { filter: { _id: row._id }, replacement: row, upsert: true },
    })),
    { ordered: false, session },
  );
}

export function calculateStockSeasonPeriodReturn(input: {
  openingValue: number;
  closingValue: number;
  externalFlows: Array<{ amount: number; weight: number }>;
  returnAmount: number;
}): number {
  const netFlows = input.externalFlows.reduce((sum, flow) => sum + flow.amount, 0);
  const weightedFlows = input.externalFlows.reduce(
    (sum, flow) => sum + flow.amount * Math.max(0, Math.min(1, flow.weight)),
    0,
  );
  const denominator = input.openingValue + weightedFlows;
  if (Math.abs(denominator) < 1e-9) return 0;
  return (input.closingValue + input.returnAmount - input.openingValue - netFlows) / denominator;
}

export function reconstructStockSeasonClosingValue(
  currentValue: number,
  postCutoffFlows: readonly Pick<StockSeasonFlow, "externalAmount">[],
): number {
  const postCutoffExternal = postCutoffFlows.reduce(
    (sum, flow) => sum + flow.externalAmount,
    0,
  );
  return Math.max(0, currentValue - postCutoffExternal);
}

/** 현재 보유량에서 cutoff 이후 주식 이동을 역산해 폐장 시점 수량을 복원한다. */
export function reconstructStockSeasonSharesAtCutoff(
  currentShares: number,
  postCutoffFlows: readonly Pick<StockSeasonFlow, "kind" | "shares">[],
): number {
  const postCutoffShareDelta = postCutoffFlows.reduce((sum, flow) => {
    if (
      flow.kind === "BUY" ||
      flow.kind === "TRANSFER_IN" ||
      flow.kind === "GM_GRANT"
    ) {
      return sum + flow.shares;
    }
    if (flow.kind === "SELL" || flow.kind === "TRANSFER_OUT") {
      return sum - flow.shares;
    }
    return sum;
  }, 0);
  return Math.max(0, currentShares - postCutoffShareDelta);
}

export async function evaluateStockInvestmentSeasonForRound(input: {
  slotKey: string;
  now: Date;
  activate?: StockInvestmentSeason;
  endsAt?: Date;
  finalize?: boolean;
}, session: ClientSession): Promise<{ seasonId?: string; finalized: boolean; participants: number }> {
  const seasons = await col<StockInvestmentSeason>(SEASONS);
  if (input.activate) {
    await seasons.updateOne(
      { _id: input.activate._id },
      {
        $setOnInsert: {
          startsAt: input.activate.startsAt,
          endsAt: input.activate.endsAt,
          createdAt: input.activate.createdAt,
        },
        $set: { status: "ACTIVE" },
      },
      { upsert: true, session },
    );
  }
  if (input.endsAt) {
    await seasons.updateOne(
      { status: "ACTIVE" },
      { $set: { endsAt: input.endsAt } },
      { session },
    );
  }
  const season = await seasons.findOne(
    { status: "ACTIVE", startsAt: { $lte: input.now } },
    { sort: { startsAt: -1 }, session },
  );
  if (!season) return { finalized: false, participants: 0 };

  const valuationAt = input.finalize === true ? season.endsAt : input.now;
  // 같은 transaction snapshot에서 holdings와 flow를 순서대로 읽는다. input.now를
  // 상한으로 쓰면 호출 시각과 snapshot 사이에 commit된 GM 지급만 holdings에 보이고
  // flow에서는 빠질 수 있다.
  const holdings = await (await stockHoldingsCol())
    .find({ shares: { $gt: 0 } }, { session })
    .toArray();
  const prices = await (await stockPricesCol()).find({}, { session }).toArray();
  const cutoffPriceRows = await (await stockPriceHistoryCol()).aggregate<{
      _id: string;
      price: number;
    }>([
      {
        $set: {
          valuationEffectiveAt: { $ifNull: ["$effectiveAt", "$createdAt"] },
          valuationEffectiveSequence: { $ifNull: ["$effectiveSequence", 0] },
        },
      },
      { $match: { valuationEffectiveAt: { $lte: valuationAt } } },
      {
        $sort: {
          ticker: 1,
          valuationEffectiveAt: -1,
          valuationEffectiveSequence: -1,
          createdAt: -1,
        },
      },
      { $group: { _id: "$ticker", price: { $first: "$price" } } },
    ], { session }).toArray();
  const existingRows = await (await col<StockSeasonPerformance>(SEASON_PERFORMANCE))
    .find({ seasonId: season._id }, { session })
    .toArray();
  const unevaluatedFlows = await (await col<StockSeasonFlow>(SEASON_FLOWS)).find({
      occurredAt: { $gte: season.startsAt },
      evaluatedSlotKey: { $exists: false },
    }, { session }).toArray();
  const pendingFlows = unevaluatedFlows.filter(
    (flow) => flow.occurredAt.getTime() <= valuationAt.getTime(),
  );
  const postCutoffFlows = unevaluatedFlows.filter(
    (flow) => flow.occurredAt.getTime() > valuationAt.getTime(),
  );
  const currentPriceByTicker = new Map(
    prices.map((price) => [price.ticker, price.price]),
  );
  const cutoffPriceByTicker = new Map(
    cutoffPriceRows.map((price) => [price._id, price.price]),
  );
  const sharesByCharacterTicker = new Map<string, number>();
  for (const holding of holdings) {
    sharesByCharacterTicker.set(
      `${holding.characterId}\u0000${holding.ticker}`,
      holding.shares,
    );
  }
  const postCutoffByCharacterTicker = new Map<string, StockSeasonFlow[]>();
  for (const flow of postCutoffFlows) {
    const key = `${flow.characterId}\u0000${flow.ticker}`;
    const rows = postCutoffByCharacterTicker.get(key) ?? [];
    rows.push(flow);
    postCutoffByCharacterTicker.set(key, rows);
  }
  const portfolioByCharacter = new Map<string, number>();
  for (const key of new Set([
    ...sharesByCharacterTicker.keys(),
    ...postCutoffByCharacterTicker.keys(),
  ])) {
    const separator = key.indexOf("\u0000");
    const characterId = key.slice(0, separator);
    const ticker = key.slice(separator + 1);
    const cutoffShares = reconstructStockSeasonSharesAtCutoff(
      sharesByCharacterTicker.get(key) ?? 0,
      postCutoffByCharacterTicker.get(key) ?? [],
    );
    const marketPrice =
      cutoffPriceByTicker.get(ticker) ?? currentPriceByTicker.get(ticker);
    if (cutoffShares <= 0 || marketPrice === undefined) continue;
    portfolioByCharacter.set(
      characterId,
      (portfolioByCharacter.get(characterId) ?? 0) + cutoffShares * marketPrice,
    );
  }
  const existingByCharacter = new Map(existingRows.map((row) => [row.characterId, row]));
  const flowsByCharacter = new Map<string, StockSeasonFlow[]>();
  for (const flow of pendingFlows) {
    const rows = flowsByCharacter.get(flow.characterId) ?? [];
    rows.push(flow);
    flowsByCharacter.set(flow.characterId, rows);
  }
  const postCutoffFlowsByCharacter = new Map<string, StockSeasonFlow[]>();
  for (const flow of postCutoffFlows) {
    const rows = postCutoffFlowsByCharacter.get(flow.characterId) ?? [];
    rows.push(flow);
    postCutoffFlowsByCharacter.set(flow.characterId, rows);
  }
  const characterIds = new Set([
    ...portfolioByCharacter.keys(),
    ...existingByCharacter.keys(),
    ...flowsByCharacter.keys(),
    ...postCutoffFlowsByCharacter.keys(),
  ]);
  const objectIds = [...characterIds].filter(ObjectId.isValid).map((id) => new ObjectId(id));
  const characters = objectIds.length
    ? await (await charactersCol()).find(
      { _id: { $in: objectIds } },
      { projection: { codename: 1, ownerId: 1 }, session },
    ).toArray()
    : [];
  const characterById = new Map(characters.map((character) => [String(character._id), character]));
  const rows: StockSeasonPerformance[] = [];
  for (const characterId of characterIds) {
    const previous = existingByCharacter.get(characterId);
    const periodStart = previous?.lastValuedAt ?? season.startsAt;
    const periodLength = Math.max(
      1,
      valuationAt.getTime() - periodStart.getTime(),
    );
    const flows = (flowsByCharacter.get(characterId) ?? []).filter(
      (flow) => flow.occurredAt.getTime() >= periodStart.getTime(),
    );
    const closingValue = portfolioByCharacter.get(characterId) ?? 0;
    const openingValue = previous?.currentPortfolioValue ?? closingValue;
    const periodReturn = previous
      ? calculateStockSeasonPeriodReturn({
        openingValue,
        closingValue,
        externalFlows: flows
          .filter((flow) => flow.externalAmount !== 0)
          .map((flow) => ({
            amount: flow.externalAmount,
            weight:
              (valuationAt.getTime() - flow.occurredAt.getTime()) /
              periodLength,
          })),
        returnAmount: flows.reduce((sum, flow) => sum + flow.returnAmount, 0),
      })
      : 0;
    const linkedReturn = (1 + (previous?.linkedReturn ?? 0)) * (1 + periodReturn) - 1;
    const investedValue = (previous?.investedValue ?? 0) + flows
      .filter((flow) => flow.kind === "BUY")
      .reduce((sum, flow) => sum + Math.max(0, flow.externalAmount), 0);
    const buyCount = (previous?.buyCount ?? 0) + flows.filter((flow) => flow.kind === "BUY").length;
    const exposureSlots = (previous?.exposureSlots ?? 0) + (closingValue > 0 ? 1 : 0);
    const character = characterById.get(characterId);
    rows.push({
      _id: `stock-season-performance:${season._id}:${characterId}`,
      seasonId: season._id,
      characterId,
      codename: character?.codename ?? previous?.codename ?? characterId,
      linkedReturn,
      investedValue,
      buyCount,
      exposureSlots,
      eligible: investedValue >= 50 && buyCount >= 1 && exposureSlots >= 8 && closingValue > 0,
      currentPortfolioValue: closingValue,
      lastValuedAt: valuationAt,
      lastValuedSlotKey: input.slotKey,
      updatedAt: valuationAt,
    });
  }
  const shouldFinalize = input.finalize === true;
  if (shouldFinalize) {
    const ranked = rows
      .filter((row) => row.eligible)
      .sort((left, right) => right.linkedReturn - left.linkedReturn || left.codename.localeCompare(right.codename, "ko"));
    ranked.forEach((row, index) => {
      row.rank = index + 1;
      if (index < 3) row.badge = `NOVEX 시즌 ${index + 1}위`;
      if (index === 0) row.title = "NOVEX 시즌 챔피언";
    });
  }
  await recalculateStockSeasonPerformance(rows, session);
  const evaluatedFlows = shouldFinalize ? unevaluatedFlows : pendingFlows;
  if (evaluatedFlows.length) {
    await (await col<StockSeasonFlow>(SEASON_FLOWS)).updateMany(
      { _id: { $in: evaluatedFlows.map((flow) => flow._id!) }, evaluatedSlotKey: { $exists: false } },
      { $set: { evaluatedSlotKey: input.slotKey, evaluatedAt: valuationAt } },
      { session },
    );
  }
  if (shouldFinalize) {
    await seasons.updateOne(
      { _id: season._id, status: "ACTIVE" },
      { $set: { status: "FINALIZED", finalizedAt: valuationAt } },
      { session },
    );
    const notifications = await notificationsCol();
    for (const row of rows.filter((performance) => (performance.rank ?? 99) <= 3)) {
      const ownerId = characterById.get(row.characterId)?.ownerId;
      if (!ownerId) continue;
      const dedupeKey = `stock:season:${season._id}:${row.characterId}:rank`;
      await notifications.updateOne(
        { dedupeKey },
        { $setOnInsert: {
          userId: ownerId,
          dedupeKey,
          type: "STOCK",
          title: row.rank === 1 ? "NOVEX 시즌 챔피언" : `NOVEX 시즌 ${row.rank}위`,
          message: `${row.codename}의 시즌 수익률 순위가 확정되었습니다.`,
          link: "/erp/stock",
          isRead: false,
          createdAt: valuationAt,
        } },
        { upsert: true, session },
      );
    }
  }
  return { seasonId: season._id, finalized: shouldFinalize, participants: rows.length };
}

export interface StockMarketRoundContext {
  flow: StockFlowAggregate;
  disclosure?: StockDisclosure;
  structuralDisclosurePercent?: number;
}

export function buildStockCooldownOutboxEvents(input: {
  ticker: string;
  slotKey: string;
  previousPrice: number;
  price: number;
  reason: string;
  startedAt: Date;
  cooldownUntil: Date;
}): [EnqueueIntegrationOutboxInput, EnqueueIntegrationOutboxInput] {
  const partitionKey = `stock:${input.ticker}`;
  return [
    {
      kind: "STOCK_MANUAL_INTERVENTION_WEBHOOK",
      dedupeKey: `stock:cooldown:${input.slotKey}:${input.ticker}`,
      partitionKey,
      partitionOrderAt: input.startedAt,
      payload: {
        eventKind: "COOLDOWN",
        ticker: input.ticker,
        previousPrice: input.previousPrice,
        price: input.price,
        eventText: input.reason,
        cooldownUntil: input.cooldownUntil.toISOString(),
        actor: { displayName: "NOVEX", role: "SYSTEM" },
        occurredAt: input.startedAt.toISOString(),
      },
    },
    {
      kind: "STOCK_MANUAL_INTERVENTION_WEBHOOK",
      dedupeKey: `stock:cooldown-release:${input.slotKey}:${input.ticker}`,
      partitionKey,
      partitionOrderAt: input.cooldownUntil,
      availableAt: input.cooldownUntil,
      payload: {
        eventKind: "COOLDOWN_RELEASE",
        ticker: input.ticker,
        eventText: "자동 냉각 시간이 종료되었습니다.",
        actor: { displayName: "NOVEX", role: "SYSTEM" },
        occurredAt: input.cooldownUntil.toISOString(),
      },
    },
  ];
}
export interface StockMarketRoundMutation {
  price: number;
  referencePrice: number;
  eventText: string;
  eventTier: NonNullable<StockPriceHistory["eventTier"]>;
  basePercent: number;
  flowPercent: number;
  disclosurePercent: number;
  cooldownUntil?: Date;
  cooldownReason?: string;
  pendingBasePercent?: number;
  consumeFlow?: boolean;
}
export interface ApplyStockMarketRoundInput {
  slotKey: string;
  /** 시장 상태 write fence를 잡은 뒤 transaction snapshot에서 병합 회차를 계산한다. */
  resolveMergedSlotKeys: (lastCompletedSlotKey?: string) => string[];
  /** 회차 자체가 1분 이상 늦게 시작됐는지 여부. 병합 지연은 transaction 안에서 더한다. */
  delayed: boolean;
  now: Date;
  tradingDate: string;
  opensAt: Date;
  closesAt: Date;
  nextSlotAt?: Date;
  closeAfterRound: boolean;
  closureReason?: StockMarketState["closureReason"];
  season?: {
    activate?: StockInvestmentSeason;
    /** 실제 병합 회차가 확정된 뒤 그 안에 포함된 시즌 시작을 선택한다. */
    resolveActivation?: (
      mergedSlotKeys: readonly string[],
    ) => StockInvestmentSeason | undefined;
    endsAt?: Date;
    finalize?: boolean;
  };
  seeds: Array<{ ticker: string; price: number }>;
  calculate: (current: StockPrice, context: StockMarketRoundContext) => StockMarketRoundMutation;
}
export interface ApplyStockMarketRoundResult {
  applied: boolean;
  prices: StockPrice[];
  histories: StockPriceHistory[];
  flowSignals: StockFlowSignal[];
  publishedDisclosureIds: string[];
  state: StockMarketState;
}

export type StockCorporateActionExecutionStepKind =
  | "DIVIDEND_EX_DATE"
  | "SPLIT"
  | "DIVIDEND_RECORD";
export interface StockCorporateActionExecutionStep {
  actionId: string;
  slotKey: string;
  kind: StockCorporateActionExecutionStepKind;
}

/** 병합 회차에서도 기업행동의 경제 시각을 보존한다. 같은 09시에는 배당락 후 분할한다. */
export function buildStockCorporateActionExecutionPlan(
  actions: readonly StockCorporateAction[],
  mergedSlotKeys: readonly string[],
): StockCorporateActionExecutionStep[] {
  const merged = new Set(mergedSlotKeys);
  const steps: StockCorporateActionExecutionStep[] = [];
  for (const action of actions) {
    if (action.type === "SPLIT") {
      if (action.status === "SCHEDULED" && merged.has(action.executeSlotKey)) {
        steps.push({
          actionId: action._id,
          slotKey: action.executeSlotKey,
          kind: "SPLIT",
        });
      }
      continue;
    }
    const recordsInBatch =
      action.status === "SCHEDULED" && merged.has(action.recordSlotKey);
    if (recordsInBatch) {
      steps.push({
        actionId: action._id,
        slotKey: action.recordSlotKey,
        kind: "DIVIDEND_RECORD",
      });
    }
    if (
      merged.has(action.exDateSlotKey) &&
      (recordsInBatch ||
        action.status === "SNAPSHOTTED" ||
        action.status === "PROCESSING")
    ) {
      steps.push({
        actionId: action._id,
        slotKey: action.exDateSlotKey,
        kind: "DIVIDEND_EX_DATE",
      });
    }
  }
  const priority: Record<StockCorporateActionExecutionStepKind, number> = {
    DIVIDEND_EX_DATE: 0,
    SPLIT: 1,
    DIVIDEND_RECORD: 2,
  };
  return steps.sort(
    (left, right) =>
      left.slotKey.localeCompare(right.slotKey) ||
      priority[left.kind] - priority[right.kind] ||
      left.actionId.localeCompare(right.actionId),
  );
}

export interface StockAlertTrigger {
  ruleId: string;
  kind: StockMarketPreference["alerts"][number]["kind"];
  ticker?: string;
  slotKey?: string;
  disclosureId?: string;
}

export class StockPreferenceConcurrentUpdateError extends Error {
  constructor(userId: string) {
    super(`STOCK_PREFERENCE_CONCURRENT_UPDATE:${userId}`);
    this.name = "StockPreferenceConcurrentUpdateError";
  }
}

/** 원본 회차별로 같은 scope는 GM 우선, MARKET과 TICKER가 겹치면 TICKER를 선택한다. */
export function selectStockDisclosuresForTicker(
  disclosures: readonly StockDisclosure[],
  ticker: string,
): StockDisclosure[] {
  const selectedBySlotAndScope = new Map<string, StockDisclosure>();
  for (const disclosure of disclosures) {
    const slotGroup = disclosure.slotKey ?? disclosure.publishAt?.toISOString() ?? disclosure._id;
    const effect = disclosure.effects.find((row) => row.scope === "TICKER" && row.ticker === ticker)
      ?? disclosure.effects.find((row) => row.scope === "MARKET");
    if (!effect) continue;
    const groupKey = `${slotGroup}\u0000${effect.scope}`;
    const selected = selectedBySlotAndScope.get(groupKey);
    if (selected && selected.source === "GM" && disclosure.source !== "GM") continue;
    if (!selected || disclosure.source === "GM") selectedBySlotAndScope.set(groupKey, disclosure);
  }
  const slotGroups = new Map<string, { ticker?: StockDisclosure; market?: StockDisclosure }>();
  for (const [key, disclosure] of selectedBySlotAndScope) {
    const [slotGroup, scope] = key.split("\u0000");
    const group = slotGroups.get(slotGroup!) ?? {};
    if (scope === "TICKER") group.ticker = disclosure;
    else group.market = disclosure;
    slotGroups.set(slotGroup!, group);
  }
  return [...slotGroups.values()].map((group) => group.ticker ?? group.market!);
}

export function evaluateStockMarketAlertRules(
  rules: StockMarketPreference["alerts"],
  histories: readonly StockPriceHistory[],
): { rules: StockMarketPreference["alerts"]; triggers: StockAlertTrigger[] } {
  const nextRules = rules.map((rule) => ({ ...rule }));
  const triggers: StockAlertTrigger[] = [];
  for (const rule of nextRules) {
    if (!rule.enabled) continue;
    const history = rule.ticker
      ? histories.find((row) => row.ticker === rule.ticker)
      : undefined;
    if (rule.kind === "BELOW_PRICE" && history && rule.threshold !== undefined) {
      if (history.price > rule.threshold) rule.armed = true;
      if (rule.armed !== false && history.prevPrice > rule.threshold && history.price <= rule.threshold) {
        triggers.push({ ruleId: rule.id, kind: rule.kind, ticker: rule.ticker, slotKey: history.slotKey });
        rule.armed = false;
        rule.lastTriggeredSlotKey = history.slotKey;
      }
    } else if (rule.kind === "MOVE_PERCENT" && history && rule.threshold !== undefined) {
      const change = history.prevPrice > 0
        ? Math.abs((history.price - history.prevPrice) / history.prevPrice) * 100
        : 0;
      if (change >= rule.threshold && rule.lastTriggeredSlotKey !== history.slotKey) {
        triggers.push({ ruleId: rule.id, kind: rule.kind, ticker: rule.ticker, slotKey: history.slotKey });
        rule.lastTriggeredSlotKey = history.slotKey;
      }
    } else if (rule.kind === "DISCLOSURE") {
      const ids = histories
        .filter((row) => !rule.ticker || row.ticker === rule.ticker)
        .flatMap((row) => row.disclosureIds ?? []);
      for (const id of new Set(ids)) {
        if (rule.lastTriggeredDisclosureId === id) continue;
        triggers.push({ ruleId: rule.id, kind: rule.kind, ticker: rule.ticker, disclosureId: id });
        rule.lastTriggeredDisclosureId = id;
      }
    }
  }
  return { rules: nextRules, triggers };
}

async function emitStockAlertsForRound(
  histories: StockPriceHistory[],
  session: ClientSession,
): Promise<void> {
  const preferences = await col<StockMarketPreference>(PREFERENCES);
  const rows = await preferences.find({ "alerts.enabled": true }, { session }).toArray();
  const notifications = await notificationsCol();
  for (const preference of rows) {
    const evaluated = evaluateStockMarketAlertRules(preference.alerts, histories);
    for (const trigger of evaluated.triggers) {
        const dedupeKey = trigger.kind === "DISCLOSURE"
          ? `stock:disclosure:${preference.userId}:${trigger.ruleId}:${trigger.disclosureId}`
          : `stock:${trigger.kind.toLowerCase()}:${preference.userId}:${trigger.ruleId}:${trigger.slotKey}`;
        await notifications.updateOne(
          { dedupeKey },
          { $setOnInsert: {
            userId: preference.userId,
            dedupeKey,
            type: "STOCK",
            title: "NOVEX 시장 알림",
            message: trigger.ticker
              ? `${trigger.ticker} 관심 조건이 충족되었습니다.`
              : "관심 공시가 공개되었습니다.",
            link: trigger.ticker ? `/erp/stock/${trigger.ticker}` : "/erp/stock",
            isRead: false,
            createdAt: new Date(),
          } },
          { upsert: true, session },
        );
    }
    const preferenceUpdate = await preferences.updateOne(
      { _id: preference._id, updatedAt: preference.updatedAt },
      { $set: { alerts: evaluated.rules, updatedAt: new Date() } },
      { session },
    );
    if (preferenceUpdate.matchedCount !== 1) {
      throw new StockPreferenceConcurrentUpdateError(preference.userId);
    }
  }
}

async function emitPublishedInformationDisclosureAlerts(
  disclosures: readonly StockDisclosure[],
  session: ClientSession,
): Promise<void> {
  if (!disclosures.length) return;
  const preferences = await col<StockMarketPreference>(PREFERENCES);
  const notifications = await notificationsCol();
  const rows = await preferences.find(
    { alerts: { $elemMatch: { enabled: true, kind: "DISCLOSURE" } } },
    { session },
  ).toArray();
  for (const preference of rows) {
    const alerts = preference.alerts.map((rule) => ({ ...rule }));
    let changed = false;
    for (const disclosure of disclosures) {
      const targetTickers = new Set(
        disclosure.effects
          .filter((effect) => effect.scope === "TICKER")
          .map((effect) => effect.ticker!),
      );
      const marketWide = disclosure.effects.some((effect) => effect.scope === "MARKET");
      for (const rule of alerts) {
        if (
          !rule.enabled ||
          rule.kind !== "DISCLOSURE" ||
          rule.lastTriggeredDisclosureId === disclosure._id ||
          (rule.ticker && !marketWide && !targetTickers.has(rule.ticker))
        ) continue;
        const dedupeKey = `stock:disclosure:${preference.userId}:${rule.id}:${disclosure._id}`;
        await notifications.updateOne(
          { dedupeKey },
          { $setOnInsert: {
            userId: preference.userId,
            dedupeKey,
            type: "STOCK",
            title: disclosure.title,
            message: disclosure.body,
            link: rule.ticker ? `/erp/stock/${rule.ticker}` : "/erp/stock",
            isRead: false,
            createdAt: disclosure.publishedAt ?? new Date(),
          } },
          { upsert: true, session },
        );
        rule.lastTriggeredDisclosureId = disclosure._id;
        changed = true;
      }
    }
    if (changed) {
      const preferenceUpdate = await preferences.updateOne(
        { _id: preference._id, updatedAt: preference.updatedAt },
        { $set: { alerts, updatedAt: new Date() } },
        { session },
      );
      if (preferenceUpdate.matchedCount !== 1) {
        throw new StockPreferenceConcurrentUpdateError(preference.userId);
      }
    }
  }
}

/** 9종목 가격·수급 소비·공시 공개·이력·시장 상태를 한 transaction으로 확정한다. */
export async function applyStockMarketRoundTransaction(
  input: ApplyStockMarketRoundInput,
): Promise<ApplyStockMarketRoundResult> {
  const client = await getClient();
  const session = client.startSession();
  let result: ApplyStockMarketRoundResult | null = null;
  try {
    await session.withTransaction(async () => {
      const stateCol = await col<StockMarketState>(MARKET_STATE);
      // 모든 거래와 같은 순서로 market_state를 첫 write fence로 잡는다. Mongo가
      // transaction callback을 재시도하면 최신 lastCompletedSlotKey에서 다시 판정한다.
      const stateBeforeRound = await stateCol.findOneAndUpdate(
        { _id: STOCK_MARKET_STATE_ID },
        {
          $inc: { tradeRevision: 1 },
          $setOnInsert: {
            status: "OPENING_PENDING",
            tradingDate: input.tradingDate,
            opensAt: input.opensAt,
            closesAt: input.closesAt,
            nextSlotAt: input.opensAt,
            delayed: true,
            updatedAt: input.now,
          },
        },
        { upsert: true, returnDocument: "before", session },
      );
      const prices = await stockPricesCol();
      const history = await stockPriceHistoryCol();
      const existing = await history.countDocuments({ slotKey: input.slotKey, source: "scheduled" }, { session });
      if (existing !== 0 && existing !== input.seeds.length) {
        throw new Error(`Partial stock round detected: ${input.slotKey}`);
      }
      const lastCompletedSlotKey = stateBeforeRound?.lastCompletedSlotKey;
      if (lastCompletedSlotKey && lastCompletedSlotKey >= input.slotKey) {
        if (lastCompletedSlotKey === input.slotKey && existing !== input.seeds.length) {
          throw new Error(`Stock market state is ahead of history: ${input.slotKey}`);
        }
        const savedPrices = await prices
          .find(
            { ticker: { $in: input.seeds.map((seed) => seed.ticker) } },
            { session },
          )
          .sort({ ticker: 1 })
          .toArray();
        const state = await stateCol.findOne(
          { _id: STOCK_MARKET_STATE_ID },
          { session },
        );
        if (!state) throw new Error(`Stock round ${input.slotKey} has history without market state`);
        result = { applied: false, prices: savedPrices, histories: await history.find({ slotKey: input.slotKey, source: "scheduled" }, { session }).toArray(), flowSignals: [], publishedDisclosureIds: [], state };
        return;
      }
      if (existing !== 0) {
        throw new Error(`Stock round history is ahead of market state: ${input.slotKey}`);
      }
      const mergedSlotKeys = input.resolveMergedSlotKeys(lastCompletedSlotKey);
      if (!mergedSlotKeys.includes(input.slotKey)) {
        throw new Error(`Resolved stock round does not include target slot: ${input.slotKey}`);
      }
      const delayed = input.delayed || mergedSlotKeys.length > 1;
      const seasonActivation =
        input.season?.resolveActivation?.(mergedSlotKeys) ??
        input.season?.activate;

      // 예약 공시 mutation과 같은 slot fence를 순서대로 잡아 cutoff 경합을 직렬화한다.
      for (const mergedSlotKey of [...mergedSlotKeys].sort()) {
        await fenceStockDisclosureSlot(mergedSlotKey, session);
      }

      await prices.bulkWrite(
        input.seeds.map((seed) => ({ updateOne: { filter: { ticker: seed.ticker }, update: { $setOnInsert: { ticker: seed.ticker, price: seed.price, prevPrice: seed.price, referencePrice: seed.price, eventText: "정기 시세 초기화", lastUpdate: input.slotKey, tradeRevision: 0 } }, upsert: true } })),
        { ordered: false, session },
      );
      if (seasonActivation) {
        // 일요일 회차 전체 장애 뒤 월요일 09 복구 시 이전 시즌을 구 가격으로 먼저 종결한다.
        await evaluateStockInvestmentSeasonForRound({
          slotKey: `${input.slotKey}:previous-season-close`,
          now: seasonActivation.startsAt,
          finalize: true,
        }, session);
      }
      const corporateActions = await col<StockCorporateAction>(CORPORATE_ACTIONS);
      const corporateActionPlan = buildStockCorporateActionExecutionPlan(
        await corporateActions.find(
          { status: { $in: ["SCHEDULED", "SNAPSHOTTED", "PROCESSING"] } },
          { session },
        ).toArray(),
        mergedSlotKeys,
      );
      // 병합된 원본 slot 순서를 보존한다. target 23시 배당 snapshot만 해당
      // 가격 확정 뒤로 미루고, 배당락·분할은 target 가격 계산 전에 반영한다.
      const rejectedDividendActionIds = new Set<string>();
      for (const step of corporateActionPlan.filter(
        (item) =>
          item.kind !== "DIVIDEND_RECORD" || item.slotKey !== input.slotKey,
      )) {
        if (step.kind === "DIVIDEND_RECORD") {
          const snapshot = await snapshotStockDividendEntitlements(
            step.actionId,
            input.now,
            session,
          );
          if (snapshot.status === "REJECTED") {
            rejectedDividendActionIds.add(step.actionId);
          }
        } else if (step.kind === "DIVIDEND_EX_DATE") {
          // 같은 병합 batch의 record가 당시 종가 25% cap에서 거절되면 ERROR를
          // commit하되 ex-date는 실행하지 않아 전체 회차가 영구 재시도되지 않게 한다.
          if (rejectedDividendActionIds.has(step.actionId)) continue;
          if (!await applyStockDividendExDate(step.actionId, input.now, session)) {
            throw new Error(`Dividend ex-date execution lost: ${step.actionId}`);
          }
        } else if (!await applyForwardStockSplit(step.actionId, input.now, session)) {
          throw new Error(`Stock split execution lost: ${step.actionId}`);
        }
      }
      const current = await prices.find(
        { ticker: { $in: input.seeds.map((seed) => seed.ticker) } },
        { session },
      ).toArray();
      const flowCol = await col<StockOrderFlow>(ORDER_FLOW);
      const flowRows = await flowCol.find({ consumedSlotKey: { $exists: false }, occurredAt: { $lte: input.now } }, { session }).toArray();
      const flowMap = new Map(aggregateStockOrderFlow(flowRows).map((flow) => [flow.ticker, flow]));
      const disclosureCol = await col<StockDisclosure>(DISCLOSURES);
      const dueDisclosures = await disclosureCol.find({
        status: "SCHEDULED",
        $or: [
          { kind: "PRICE", slotKey: { $in: mergedSlotKeys } },
          { kind: "INFO", slotKey: { $in: mergedSlotKeys } },
        ],
      }, { session }).sort({ createdAt: 1 }).toArray();
      const disclosureByTicker = new Map<string, {
        disclosure: StockDisclosure;
        ids: string[];
        structuralDisclosurePercent: number;
      }>();
      for (const seed of input.seeds) {
        const applicable = dueDisclosures.filter((disclosure) =>
          disclosure.kind === "PRICE" && disclosure.effects.some((effect) =>
            effect.scope === "MARKET" || (effect.scope === "TICKER" && effect.ticker === seed.ticker),
          ),
        );
        if (!applicable.length) continue;
        const selected = selectStockDisclosuresForTicker(applicable, seed.ticker);
        const effects = selected.map((disclosure) =>
          disclosure.effects.find((effect) => effect.scope === "TICKER" && effect.ticker === seed.ticker)
            ?? disclosure.effects.find((effect) => effect.scope === "MARKET"),
        ).filter((effect): effect is StockDisclosureEffect => Boolean(effect));
        const contribution = summarizeStockDisclosureEffects(effects);
        const only = selected.length === 1 ? selected[0]! : undefined;
        const combined: StockDisclosure = only ?? {
          ...selected[selected.length - 1]!,
          _id: selected.map((row) => row._id).join("+"),
          title: selected.map((row) => row.title).join(" · "),
          source: "AUTO",
          shock: selected.some((row) => row.shock),
          forceCooldown: selected.some((row) => row.forceCooldown),
          effects: [{
            scope: "TICKER",
            ticker: seed.ticker,
            changePercent: contribution.changePercent,
            structural: effects.some((effect) => effect.structural),
          }],
        };
        disclosureByTicker.set(seed.ticker, {
          disclosure: combined,
          ids: selected.map((row) => row._id),
          structuralDisclosurePercent:
            contribution.structuralChangePercent / 100,
        });
      }

      for (const disclosure of dueDisclosures.filter((row) => row.kind === "PRICE" && row.shock === true)) {
        const marketWide = disclosure.effects.some((effect) => effect.scope === "MARKET");
        const affectedTickers = marketWide
          ? input.seeds.map((seed) => seed.ticker)
          : disclosure.effects
            .filter((effect) => effect.scope === "TICKER" && effect.ticker)
            .map((effect) => effect.ticker!);
        for (const ticker of new Set(affectedTickers)) {
          await enqueueIntegrationOutbox({
            kind: "STOCK_MANUAL_INTERVENTION_WEBHOOK",
            dedupeKey: `stock:shock-disclosure:${disclosure._id}:${ticker}`,
            partitionKey: `stock:${ticker}`,
            partitionOrderAt: input.now,
            payload: {
              eventKind: "SHOCK_DISCLOSURE",
              ticker,
              eventText: `${disclosure.title} · ${disclosure.body}`,
              actor: { displayName: "NOVEX", role: disclosure.source },
              occurredAt: input.now.toISOString(),
            },
          }, { session });
        }
      }

      const createdAt = input.now;
      const effectiveAt = stockSlotKeyDate(input.slotKey);
      const histories: StockPriceHistory[] = [];
      const savedPrices: StockPrice[] = [];
      const consumedTickers = new Set<string>();
      for (const seed of input.seeds) {
        const price = current.find((row) => row.ticker === seed.ticker)!;
        const flow = flowMap.get(seed.ticker) ?? { ticker: seed.ticker, netShares: 0, volume: 0, percent: 0, signal: { ticker: seed.ticker, direction: "NEUTRAL", strength: "WEAK", volume: 0 } } as StockFlowAggregate;
        const disclosureGroup = disclosureByTicker.get(seed.ticker);
        const disclosure = disclosureGroup?.disclosure;
        const mutation = input.calculate(price, {
          flow,
          disclosure,
          structuralDisclosurePercent:
            disclosureGroup?.structuralDisclosurePercent,
        });
        const saved = await prices.findOneAndUpdate(
          { ticker: seed.ticker },
          {
            $set: {
              prevPrice: price.price,
              price: mutation.price,
              referencePrice: mutation.referencePrice,
              eventText: mutation.eventText,
              lastUpdate: input.slotKey,
              pendingBasePercent: mutation.pendingBasePercent ?? 0,
              ...(mutation.cooldownUntil
                ? {
                    cooldownUntil: mutation.cooldownUntil,
                    cooldownReason: mutation.cooldownReason,
                  }
                : {}),
            },
            ...(!mutation.cooldownUntil
              ? { $unset: { cooldownUntil: "", cooldownReason: "" } }
              : {}),
          },
          { returnDocument: "after", session },
        );
        if (!saved) throw new Error(`Missing stock during round: ${seed.ticker}`);
        if (mutation.cooldownUntil) {
          for (const outbox of buildStockCooldownOutboxEvents({
            ticker: seed.ticker,
            slotKey: input.slotKey,
            previousPrice: price.price,
            price: mutation.price,
            reason: mutation.cooldownReason ?? "급격한 가격 변동",
            startedAt: input.now,
            cooldownUntil: mutation.cooldownUntil,
          })) await enqueueIntegrationOutbox(outbox, { session });
        }
        savedPrices.push(saved);
        if (mutation.consumeFlow !== false) consumedTickers.add(seed.ticker);
        histories.push({
          operationKey: `stocks.tick:${input.slotKey}:${seed.ticker}`,
          ticker: seed.ticker,
          price: mutation.price,
          prevPrice: price.price,
          referencePrice: mutation.referencePrice,
          eventText: mutation.eventText,
          eventTier: mutation.eventTier,
          source: "scheduled",
          slotKey: input.slotKey,
          effectiveAt,
          effectiveSequence: 30,
          mergedSlotKeys,
          delayed,
          basePercent: mutation.basePercent,
          flowPercent: mutation.flowPercent,
          disclosurePercent: mutation.disclosurePercent,
          disclosureIds: disclosureGroup?.ids ?? [],
          createdAt,
        });
      }
      await history.insertMany(histories, { session });
      await emitStockAlertsForRound(histories, session);
      const consumedFlowRows = flowRows.filter((row) => consumedTickers.has(row.ticker));
      if (consumedFlowRows.length) {
        await flowCol.updateMany(
          { _id: { $in: consumedFlowRows.map((row) => row._id!) }, consumedSlotKey: { $exists: false } },
          { $set: { consumedSlotKey: input.slotKey, consumedAt: input.now } },
          { session },
        );
      }
      const publishedDisclosureIds = dueDisclosures.map((row) => row._id);
      if (publishedDisclosureIds.length) {
        await disclosureCol.updateMany(
          { _id: { $in: publishedDisclosureIds }, status: "SCHEDULED" },
          { $set: { status: "PUBLISHED", publishedAt: input.now, updatedAt: input.now } },
          { session },
        );
        await (await col<StockScheduledEvent>("stock_scheduled_events")).updateMany(
          {
            status: "PENDING",
            migratedDisclosureId: { $in: publishedDisclosureIds },
          },
          {
            $set: {
              status: "APPLIED",
              appliedAt: input.now,
              appliedOperationKey: `novex:${input.slotKey}`,
              updatedAt: input.now,
            },
          },
          { session },
        );
      }
      await emitPublishedInformationDisclosureAlerts(
        dueDisclosures
          .filter((row) => row.kind === "INFO")
          .map((row) => ({ ...row, status: "PUBLISHED" as const, publishedAt: input.now })),
        session,
      );
      for (const step of corporateActionPlan.filter(
        (item) =>
          item.kind === "DIVIDEND_RECORD" && item.slotKey === input.slotKey,
      )) {
        await snapshotStockDividendEntitlements(
          step.actionId,
          input.now,
          session,
        );
      }
      const state = await saveStockMarketState({
        status: input.closeAfterRound ? "CLOSED" : "OPEN",
        tradingDate: input.tradingDate,
        opensAt: input.opensAt,
        closesAt: input.closesAt,
        nextSlotAt: input.nextSlotAt,
        lastCompletedSlotKey: input.slotKey,
        delayed,
        mergedSlotKeys,
        closureReason: input.closeAfterRound ? input.closureReason : undefined,
        updatedAt: input.now,
      }, session);
      await evaluateStockInvestmentSeasonForRound({
        slotKey: input.slotKey,
        now: input.now,
        activate: seasonActivation,
        endsAt: input.season?.endsAt,
        finalize: input.season?.finalize,
      }, session);
      result = { applied: true, prices: savedPrices, histories, flowSignals: [...flowMap.values()].map((row) => row.signal), publishedDisclosureIds, state };
    });
    if (!result) throw new Error(`Stock market round returned no result: ${input.slotKey}`);
    return result;
  } finally {
    await session.endSession();
  }
}

/** 액면분할을 가격·적정가·보유량·평단에 같은 transaction으로 반영한다. */
export async function applyForwardStockSplit(
  actionId: string,
  now: Date,
  session: ClientSession,
): Promise<boolean> {
  const actions = await col<StockCorporateAction>(CORPORATE_ACTIONS);
  const action = await actions.findOne({ _id: actionId, type: "SPLIT", status: "SCHEDULED" }, { session });
  if (!action || action.type !== "SPLIT") return false;
  const holdings = await stockHoldingsCol();
  await holdings.updateMany(
    { ticker: action.ticker },
    [{ $set: { shares: { $multiply: ["$shares", action.factor] }, avgPrice: { $round: [{ $divide: ["$avgPrice", action.factor] }, 2] }, updatedAt: now } }],
    { session },
  );
  const prices = await stockPricesCol();
  const previous = await prices.findOne({ ticker: action.ticker }, { session });
  if (!previous) throw new Error(`Split stock not found: ${action.ticker}`);
  const nextPrice = Math.max(0.01, Math.round((previous.price / action.factor) * 100) / 100);
  const nextReference = Math.max(0.01, Math.round(((previous.referencePrice ?? previous.price) / action.factor) * 100) / 100);
  await prices.updateOne({ ticker: action.ticker }, { $set: { prevPrice: previous.price, price: nextPrice, referencePrice: nextReference, eventText: `${action.factor}:1 액면분할`, lastUpdate: action.executeSlotKey } }, { session });
  await (await stockPriceHistoryCol()).insertOne({ ticker: action.ticker, price: nextPrice, prevPrice: previous.price, referencePrice: nextReference, eventText: `${action.factor}:1 액면분할`, source: "split", slotKey: action.executeSlotKey, effectiveAt: stockSlotKeyDate(action.executeSlotKey), effectiveSequence: 20, splitFactor: action.factor, createdAt: now }, { session });
  await actions.updateOne({ _id: actionId, status: "SCHEDULED" }, { $set: { status: "COMPLETED", updatedAt: now } }, { session });
  return true;
}
