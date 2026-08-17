import {
  applyStockMarketRoundTransaction,
  applyScheduledStockPriceMutation,
  aggregateStockOrderFlow,
  buildStockCorporateActionExecutionPlan,
  calculateForwardStockSplitPrices,
  calculateRightsOfferingPrices,
  calculateStockDividendExDatePrices,
  claimPendingStockScheduledEvent,
  combineStockDisclosuresForTicker,
  createAutomaticStockDisclosureQueue,
  consumeMrBeastSodaStockImpactDemand,
  closeStockMarketWithoutRound,
  getStockMarketCalendarException,
  getScheduledStockDisclosureQueueStatsForDate,
  getLatestStockMarketShadowState,
  getStockPrices,
  listPendingStockOrderFlows,
  listStockCorporateActions,
  listStockDisclosures,
  listRegularSessionStartsForStockMarket,
  listScheduledStockPriceHistoryRange,
  type ApplyScheduledStockPriceMutationResult,
} from "@stargate/shared-db";
import type {
  StockInvestmentSeason,
  StockDisclosure,
  StockMarketShadowPrice,
  StockMarketShadowState,
  StockPrice,
  StockPriceHistory,
} from "@stargate/shared-db/types";

import { STOCK_CATALOG } from "../domain/stock-catalog.js";
import {
  findScheduledStockMarketEvent,
  rollStockMarketEvent,
  type StockEventTier,
  type StockPriceDirection,
} from "../domain/stock-events.js";
import { normalizeStockPrice } from "../domain/stock-pricing.js";
import {
  calculateMrBeastSodaStockImpactPercent,
  MRBEAST_SODA_STOCK_IMPACT_TICKER,
} from "../domain/mrbeast-soda-stock-impact.js";
import { kstDateTag, kstNowTag } from "../domain/kst-time.js";
import {
  calculateNovexPrice,
  buildNovexAutoDisclosureQueue,
  enumerateNovexSlotsAfter,
  latestDueNovexSlot,
  isNovexRegularSessionDate,
  nextNovexMarketActionAt,
  NOVEX_REGULAR_SESSION_TITLE,
  novexKstDate,
  novexSeasonDateRangeForStart,
  parseNovexSlotKey,
  resolveNovexTradingWindow,
  shouldDeferNovexRoundForEarlyClose,
} from "../domain/novex-market.js";

const UP_DIRECTION_CHANCE = 0.55;

export interface ApplyScheduledStockTickOptions {
  /** Re-run even if today's scheduled row already exists. GM manual trigger only. */
  force?: boolean;
  /** Worker slot과 도메인 일자 계산을 같은 시각에 고정한다. */
  now?: Date;
  /** force 재시도에서 호출자가 재사용하는 안정 operation id. */
  operationId?: string;
  /** Backfill 검증 뒤에만 켜는 소다 판매량 자동 소비 gate. */
  sodaStockImpactEnabled?: boolean;
}

interface ApplyScheduledStockTickDependencies {
  applyMutation?: typeof applyScheduledStockPriceMutation;
  claimScheduledEvent?: typeof claimPendingStockScheduledEvent;
  consumeStockImpact?: typeof consumeMrBeastSodaStockImpactDemand;
  random?: () => number;
  createRunId?: () => string;
}

interface ScheduledTickContext {
  scheduledEvent?: {
    priceMultiplier: number;
    tier: Exclude<StockEventTier, "routine">;
    text: string;
  };
  stockImpact?: { soldQuantity: number; eventIds: string[] };
}

export interface ScheduledStockTickResult {
  ticker: string;
  previousPrice: number;
  price: number;
  changePercent: number;
  eventText: string;
  eventTier: StockEventTier;
  status: "updated" | "initialized" | "skipped";
  cumulativeSplitFactor?: number;
  cumulativeCapitalIncreaseFactor?: number;
}

export interface ScheduledStockTickSummary {
  date: string;
  slot: string;
  mergedSlotKeys?: string[];
  sourceRevision?: string;
  results: ScheduledStockTickResult[];
  marketStateChanged?: boolean;
  skipDiscord?: boolean;
  warning?: "REGULAR_SESSION_MISSING" | "REGULAR_SESSION_AMBIGUOUS";
  /** shadow 모드에서만 scheduled_job_runs summary에 직렬화하는 누적 상태. */
  shadowState?: StockMarketShadowState;
  shadowComparison?: Array<{
    ticker: string;
    shadowPrice: number;
    legacyPrice: number | null;
    deltaPercent: number | null;
  }>;
}

export class ScheduledStockTickNotDueError extends Error {
  readonly date: string;
  readonly executeAt: Date;

  constructor(date: string, executeAt: Date) {
    super(`SCHEDULED_STOCK_TICK_NOT_DUE:${executeAt.toISOString()}`);
    this.name = "ScheduledStockTickNotDueError";
    this.date = date;
    this.executeAt = executeAt;
  }
}

export interface ApplyNovexStockMarketTickOptions {
  now?: Date;
  /** 인증된 수동 복구가 실행할 명시적 KST 회차. 생략하면 현재까지 최신 due 회차. */
  slotKey?: string;
  random?: () => number;
}

export class NovexStockTickNotDueError extends Error {
  constructor(readonly executeAt: Date) {
    super(`NOVEX_STOCK_TICK_NOT_DUE:${executeAt.toISOString()}`);
    this.name = "NovexStockTickNotDueError";
  }
}

/** NOVEX_V2_ENABLED는 명시적인 true에서만 켜진다. */
export function isNovexV2Enabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

export type NovexV2Mode = "disabled" | "shadow" | "enabled";
export function resolveNovexV2Mode(input: {
  mode?: string;
  legacyEnabled?: string;
}): NovexV2Mode {
  const normalized = input.mode?.trim().toLowerCase();
  if (normalized === "enabled" || normalized === "shadow" || normalized === "disabled") {
    return normalized;
  }
  return isNovexV2Enabled(input.legacyEnabled) ? "enabled" : "disabled";
}

/** 종가 브리핑은 23시 회차만, 다음 개장(09시) 전 복구분까지만 허용한다. */
export function shouldSkipNovexClosingBriefing(
  slotKey: string,
  now: Date,
): boolean {
  if (!slotKey.endsWith("23:00")) return true;
  return now.getTime() >= nextNovexMarketActionAt(slotKey, true).getTime();
}

function seededNovexRandom(seed: string): () => number {
  let value = [...seed].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16_777_619), 2_166_136_261) >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4_294_967_296;
  };
}

async function ensureNextDayNovexAutoQueue(date: string, now: Date): Promise<void> {
  const tomorrow = novexKstDate(new Date(new Date(`${date}T00:00:00+09:00`).getTime() + 24 * 60 * 60 * 1000));
  const nowDate = novexKstDate(now);
  if (nowDate > tomorrow) return;
  const nowParts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  const currentMinutes =
    Number(nowParts.hour ?? 0) * 60 + Number(nowParts.minute ?? 0);
  const slotHours = [9, 13, 18, 23].filter(
    (hour) => nowDate < tomorrow || hour * 60 > currentMinutes,
  ) as Array<9 | 13 | 18 | 23>;
  if (slotHours.length === 0) return;
  const existing = await getScheduledStockDisclosureQueueStatsForDate(tomorrow);
  await createAutomaticStockDisclosureQueue(buildNovexAutoDisclosureQueue({
    kstDate: tomorrow,
    tickers: STOCK_CATALOG.map((stock) => stock.ticker),
    existingCount: existing.count,
    existingShockCount: existing.shockCount,
    slotHours,
    random: seededNovexRandom(tomorrow),
    now,
  }));
}

async function ensureRemainingNovexAutoQueue(
  date: string,
  currentHour: number,
  now: Date,
): Promise<void> {
  const slotHours = remainingNovexAutoQueueHours(date, currentHour, now);
  if (slotHours.length === 0) return;
  const existing = await getScheduledStockDisclosureQueueStatsForDate(date);
  await createAutomaticStockDisclosureQueue(buildNovexAutoDisclosureQueue({
    kstDate: date,
    tickers: STOCK_CATALOG.map((stock) => stock.ticker),
    existingCount: existing.count,
    existingShockCount: existing.shockCount,
    slotHours,
    random: seededNovexRandom(date),
    now,
  }));
}

export function remainingNovexAutoQueueHours(
  date: string,
  currentHour: number,
  now: Date,
): Array<9 | 13 | 18 | 23> {
  return ([9, 13, 18, 23] as const).filter((hour) =>
    hour > currentHour &&
    new Date(
      `${date}T${String(hour).padStart(2, "0")}:00:00+09:00`,
    ).getTime() > now.getTime(),
  );
}

interface NovexSeasonActivationCandidate {
  slotKey: string;
  season: StockInvestmentSeason;
}

export function selectNovexSeasonActivationForMergedSlots(
  candidates: readonly NovexSeasonActivationCandidate[],
  mergedSlotKeys: readonly string[],
): StockInvestmentSeason | undefined {
  const merged = new Set(mergedSlotKeys);
  return [...candidates]
    .filter((candidate) => merged.has(candidate.slotKey))
    .sort((left, right) => right.slotKey.localeCompare(left.slotKey))[0]
    ?.season;
}

async function buildNovexSeasonActivation(
  kstDate: string,
  slotKey: string,
  now: Date,
): Promise<StockInvestmentSeason | undefined> {
  const seasonDates = novexSeasonDateRangeForStart(kstDate);
  if (!slotKey.endsWith("09:00") || !seasonDates) {
    return undefined;
  }
  const endDate = seasonDates.endsOn;
  const start = new Date(`${endDate}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const [exception, sessionStarts] = await Promise.all([
    getStockMarketCalendarException(endDate),
    listRegularSessionStartsForStockMarket({
      title: NOVEX_REGULAR_SESSION_TITLE,
      start,
      end,
    }),
  ]);
  const window = resolveNovexTradingWindow({
    kstDate: endDate,
    regularSessionStarts: sessionStarts,
    exception,
  });
  return {
    _id: `novex-season:${kstDate}`,
    startsAt: parseNovexSlotKey(slotKey),
    endsAt: window.closesAt,
    status: "ACTIVE",
    createdAt: now,
  };
}

async function buildNovexSeasonActivationCandidates(
  targetSlotKey: string,
  now: Date,
): Promise<NovexSeasonActivationCandidate[]> {
  const targetAt = parseNovexSlotKey(targetSlotKey);
  const dates = new Set<string>();
  // enumerateNovexSlotsAfter의 128회 guard(최대 약 32일) 안에서 가능한 모든
  // 격주 시즌 시작일을 미리 준비하고, 실제 선택은 transaction 병합 결과로 한다.
  for (let offset = 0; offset <= 32; offset += 1) {
    const date = novexKstDate(
      new Date(targetAt.getTime() - offset * 24 * 60 * 60 * 1000),
    );
    if (novexSeasonDateRangeForStart(date)) dates.add(date);
  }
  const candidates = await Promise.all(
    [...dates].map(async (date) => {
      const slotKey = `${date} 09:00`;
      if (parseNovexSlotKey(slotKey).getTime() > targetAt.getTime()) {
        return undefined;
      }
      const season = await buildNovexSeasonActivation(date, slotKey, now);
      return season ? { slotKey, season } : undefined;
    }),
  );
  return candidates.filter(
    (candidate): candidate is NovexSeasonActivationCandidate =>
      candidate !== undefined,
  );
}

function stockPriceFromShadow(price: StockMarketShadowPrice): StockPrice {
  return {
    ticker: price.ticker,
    price: price.price,
    prevPrice: price.prevPrice,
    eventText: price.eventText,
    lastUpdate: price.lastUpdate,
    referencePrice: price.referencePrice,
    pendingBasePercent: price.pendingBasePercent,
    cumulativeSplitFactor: price.cumulativeSplitFactor,
    cumulativeCapitalIncreaseFactor: price.cumulativeCapitalIncreaseFactor,
    corporateActionHaltId: price.corporateActionHaltId,
    corporateActionHaltReason: price.corporateActionHaltReason,
    corporateActionResumeSlotKey: price.corporateActionResumeSlotKey,
    cooldownUntil: price.cooldownUntil ? new Date(price.cooldownUntil) : undefined,
    cooldownReason: price.cooldownReason,
  };
}

function stockPriceToShadow(price: StockPrice): StockMarketShadowPrice {
  return {
    ticker: price.ticker,
    price: price.price,
    prevPrice: price.prevPrice,
    eventText: price.eventText,
    lastUpdate: price.lastUpdate,
    referencePrice: price.referencePrice ?? price.price,
    pendingBasePercent: price.pendingBasePercent ?? 0,
    cumulativeSplitFactor: price.cumulativeSplitFactor ?? 1,
    cumulativeCapitalIncreaseFactor:
      price.cumulativeCapitalIncreaseFactor ?? 1,
    ...(price.corporateActionHaltId
      ? { corporateActionHaltId: price.corporateActionHaltId }
      : {}),
    ...(price.corporateActionHaltReason
      ? { corporateActionHaltReason: price.corporateActionHaltReason }
      : {}),
    ...(price.corporateActionResumeSlotKey
      ? { corporateActionResumeSlotKey: price.corporateActionResumeSlotKey }
      : {}),
    ...(price.cooldownUntil ? { cooldownUntil: price.cooldownUntil.toISOString() } : {}),
    ...(price.cooldownReason ? { cooldownReason: price.cooldownReason } : {}),
  };
}

function virtualStockDisclosure(
  input: ReturnType<typeof buildNovexAutoDisclosureQueue>[number],
): StockDisclosure {
  const createdAt = input.now ?? new Date(0);
  return {
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
    createdAt,
    updatedAt: createdAt,
  };
}

function buildShadowAutomaticDisclosures(
  mergedSlotKeys: readonly string[],
  existing: readonly StockDisclosure[],
): StockDisclosure[] {
  const generated: StockDisclosure[] = [];
  for (const date of new Set(mergedSlotKeys.map((slotKey) => slotKey.slice(0, 10)))) {
    const existingAutomatic = existing.filter((disclosure) =>
      disclosure.source === "AUTO" && disclosure.slotKey?.startsWith(`${date} `),
    );
    // 이미 실제 queue가 있으면 그것을 SSOT로 삼는다. 없을 때만 동일 seed로 가상 생성한다.
    if (existingAutomatic.length > 0) continue;
    generated.push(...buildNovexAutoDisclosureQueue({
      kstDate: date,
      tickers: STOCK_CATALOG.map((stock) => stock.ticker),
      random: seededNovexRandom(date),
      now: new Date(`${date}T00:00:00+09:00`),
    }).map(virtualStockDisclosure));
  }
  return generated;
}

/** shadow rollout용 read-only 누적 계산. 시장·경제 컬렉션은 변경하지 않는다. */
export async function previewNovexStockMarketTick(
  options: ApplyNovexStockMarketTickOptions = {},
): Promise<ScheduledStockTickSummary> {
  const now = options.now ?? new Date();
  const slotKey = options.slotKey ?? latestDueNovexSlot(now);
  if (!slotKey) throw new NovexStockTickNotDueError(new Date(`${novexKstDate(now)}T09:00:00+09:00`));
  const slotAt = parseNovexSlotKey(slotKey);
  if (slotAt.getTime() > now.getTime()) throw new NovexStockTickNotDueError(slotAt);
  const date = slotKey.slice(0, 10);
  const dayStart = new Date(`${date}T00:00:00+09:00`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const [livePrices, liveFlows, disclosures, actions, previous, exception, regularSessionStarts] = await Promise.all([
    getStockPrices(),
    listPendingStockOrderFlows({ occurredAtOrBefore: now }),
    listStockDisclosures({ now, limit: 500 }),
    listStockCorporateActions({
      statuses: ["SCHEDULED", "HALTED", "SNAPSHOTTED", "PROCESSING"],
      limit: 200,
    }),
    getLatestStockMarketShadowState(slotKey),
    getStockMarketCalendarException(date),
    listRegularSessionStartsForStockMarket({
      title: NOVEX_REGULAR_SESSION_TITLE,
      start: dayStart,
      end: dayEnd,
    }),
  ]);
  const window = resolveNovexTradingWindow({
    kstDate: date,
    regularSessionStarts,
    exception,
  });
  const previousByTicker = new Map(
    previous?.prices.map((price) => [price.ticker, stockPriceFromShadow(price)]),
  );
  const liveByTicker = new Map(livePrices.map((price) => [price.ticker, price]));
  const currentPrices = new Map(STOCK_CATALOG.map((stock) => {
    const current = previousByTicker.get(stock.ticker) ?? liveByTicker.get(stock.ticker);
    return [stock.ticker, current ?? {
      ticker: stock.ticker,
      price: stock.basePrice,
      prevPrice: stock.basePrice,
      referencePrice: stock.basePrice,
      cumulativeSplitFactor: 1,
      cumulativeCapitalIncreaseFactor: 1,
      eventText: "정기 시세 초기화",
      lastUpdate: slotKey,
    } satisfies StockPrice] as const;
  }));
  const seenFlowOperationKeys = new Set(previous?.seenFlowOperationKeys ?? []);
  let pendingFlows = [...(previous?.pendingFlows ?? [])];
  for (const flow of liveFlows) {
    if (seenFlowOperationKeys.has(flow.operationKey)) continue;
    seenFlowOperationKeys.add(flow.operationKey);
    pendingFlows.push(flow);
  }
  const mergedSlotKeys = enumerateNovexSlotsAfter(
    previous?.lastCompletedSlotKey,
    slotKey,
  );
  const baseShadowState = (): StockMarketShadowState => ({
    version: 1,
    lastCompletedSlotKey: previous?.lastCompletedSlotKey,
    completedAt: previous?.completedAt ?? now.toISOString(),
    prices: [...currentPrices.values()].map(stockPriceToShadow),
    rejectedDividendActionIds: [...(previous?.rejectedDividendActionIds ?? [])],
    pendingFlows,
    seenFlowOperationKeys: [...seenFlowOperationKeys],
  });
  if (shouldDeferNovexRoundForEarlyClose(slotKey, window.closesAt)) {
    return {
      date,
      slot: slotKey,
      mergedSlotKeys,
      results: [],
      skipDiscord: true,
      warning: window.warning,
      shadowState: baseShadowState(),
    };
  }

  const rejectedDividendActionIds = new Set(
    previous?.rejectedDividendActionIds ?? [],
  );
  const previousSlotKey = previous?.lastCompletedSlotKey;
  const normalizedActions = actions.map((action) => {
    if (!previousSlotKey) return action;
    if (action.type === "SPLIT" && previousSlotKey >= action.executeSlotKey) {
      return { ...action, status: "COMPLETED" as const };
    }
    if (action.type === "RIGHTS_OFFERING") {
      if (previousSlotKey >= action.executeSlotKey) {
        return { ...action, status: "COMPLETED" as const };
      }
      if (previousSlotKey >= action.announceSlotKey) {
        return { ...action, status: "HALTED" as const };
      }
    }
    if (action.type === "DIVIDEND") {
      if (rejectedDividendActionIds.has(action._id)) {
        return { ...action, status: "ERROR" as const };
      }
      if (previousSlotKey >= action.exDateSlotKey) {
        return { ...action, status: "COMPLETED" as const };
      }
      if (previousSlotKey >= action.recordSlotKey) {
        return { ...action, status: "SNAPSHOTTED" as const };
      }
    }
    return action;
  });
  const actionById = new Map(normalizedActions.map((action) => [action._id, action]));
  const actionPlan = buildStockCorporateActionExecutionPlan(
    normalizedActions,
    mergedSlotKeys,
    { allowCollapsedRightsOffering: true },
  );
  const applyShadowAction = (step: (typeof actionPlan)[number]) => {
    const action = actionById.get(step.actionId);
    if (!action) return;
    const current = currentPrices.get(action.ticker);
    if (!current) return;
    if (step.kind === "DIVIDEND_RECORD" && action.type === "DIVIDEND") {
      if (action.amountPerShare > current.price * 0.25) {
        rejectedDividendActionIds.add(action._id);
      }
      return;
    }
    if (step.kind === "DIVIDEND_EX_DATE" && action.type === "DIVIDEND") {
      if (rejectedDividendActionIds.has(action._id)) return;
      const adjusted = calculateStockDividendExDatePrices(current, action.amountPerShare);
      currentPrices.set(action.ticker, {
        ...current,
        prevPrice: current.price,
        price: adjusted.price,
        referencePrice: adjusted.referencePrice,
        eventText: `주당 ${action.amountPerShare.toFixed(2)} CR 배당락`,
        lastUpdate: action.exDateSlotKey,
      });
      return;
    }
    if (step.kind === "SPLIT" && action.type === "SPLIT") {
      const adjusted = calculateForwardStockSplitPrices(current, action.factor);
      currentPrices.set(action.ticker, {
        ...current,
        prevPrice: current.price,
        price: adjusted.price,
        referencePrice: adjusted.referencePrice,
        cumulativeSplitFactor: adjusted.cumulativeSplitFactor,
        eventText: `${action.factor}:1 액면분할`,
        lastUpdate: action.executeSlotKey,
      });
      return;
    }
    if (
      step.kind === "RIGHTS_OFFERING_ANNOUNCE" &&
      action.type === "RIGHTS_OFFERING"
    ) {
      currentPrices.set(action.ticker, {
        ...current,
        corporateActionHaltId: action._id,
        corporateActionHaltReason: action.reason,
        corporateActionResumeSlotKey: action.executeSlotKey,
        eventText: `${action.factor}배 유상증자 발표 · 거래정지`,
        lastUpdate: action.announceSlotKey,
      });
      return;
    }
    if (
      step.kind === "RIGHTS_OFFERING_EXECUTE" &&
      action.type === "RIGHTS_OFFERING"
    ) {
      const adjusted = calculateRightsOfferingPrices(current, action.factor);
      currentPrices.set(action.ticker, {
        ...current,
        prevPrice: current.price,
        price: adjusted.price,
        referencePrice: adjusted.referencePrice,
        cumulativeCapitalIncreaseFactor:
          adjusted.cumulativeCapitalIncreaseFactor,
        eventText: `${action.factor}배 유상증자 기계 조정`,
        lastUpdate: action.executeSlotKey,
        corporateActionHaltId: undefined,
        corporateActionHaltReason: undefined,
        corporateActionResumeSlotKey: undefined,
      });
    }
  };
  for (const step of actionPlan.filter((item) =>
    item.kind !== "DIVIDEND_RECORD" || item.slotKey !== slotKey,
  )) applyShadowAction(step);

  const dueDisclosures = [
    ...disclosures,
    ...buildShadowAutomaticDisclosures(mergedSlotKeys, disclosures),
  ].filter((disclosure) =>
    disclosure.status === "SCHEDULED" &&
    disclosure.kind === "PRICE" &&
    disclosure.slotKey !== undefined &&
    mergedSlotKeys.includes(disclosure.slotKey),
  );
  const flowMap = new Map(
    aggregateStockOrderFlow(pendingFlows).map((flow) => [flow.ticker, flow]),
  );
  const random = options.random ?? seededNovexRandom(slotKey);
  const samples = new Map(STOCK_CATALOG.map((stock) => [stock.ticker, random()]));
  const results = [...currentPrices.values()].map((current) => {
    const applicable = dueDisclosures.filter((disclosure) =>
      disclosure.effects.some((effect) =>
        effect.scope === "MARKET" ||
        (effect.scope === "TICKER" && effect.ticker === current.ticker),
      ),
    );
    const combined = combineStockDisclosuresForTicker(applicable, current.ticker);
    const calculated = current.corporateActionHaltId
      ? {
          price: current.price,
          referencePrice: current.referencePrice ?? current.price,
          basePercent: 0,
          flowPercent: 0,
          disclosurePercent: 0,
          finalPercent: 0,
          eventTier: "scenario" as const,
          eventText: "유상증자 거래정지 · 가격 동결",
          pendingBasePercent: current.pendingBasePercent ?? 0,
          consumeFlow: false,
        }
      : calculateNovexPrice({
          current,
          flowPercent: flowMap.get(current.ticker)?.percent ?? 0,
          disclosure: combined?.disclosure,
          structuralDisclosurePercent: combined?.structuralDisclosurePercent,
          random: () => samples.get(current.ticker) ?? 0.5,
          now,
        });
    currentPrices.set(current.ticker, {
      ...current,
      prevPrice: current.price,
      price: calculated.price,
      referencePrice: calculated.referencePrice,
      eventText: calculated.eventText,
      lastUpdate: slotKey,
      pendingBasePercent: calculated.pendingBasePercent,
      cooldownUntil: calculated.cooldownUntil,
      cooldownReason: calculated.cooldownReason,
    });
    if (calculated.consumeFlow) {
      pendingFlows = pendingFlows.filter((flow) => flow.ticker !== current.ticker);
    }
    return {
      ticker: current.ticker,
      previousPrice: current.price,
      price: calculated.price,
      changePercent: calculated.finalPercent * 100,
      eventText: `[shadow] ${calculated.eventText}`,
      eventTier: calculated.eventTier,
      status: "updated" as const,
      cumulativeSplitFactor:
        currentPrices.get(current.ticker)?.cumulativeSplitFactor ?? 1,
      cumulativeCapitalIncreaseFactor:
        currentPrices.get(current.ticker)?.cumulativeCapitalIncreaseFactor ?? 1,
    };
  });
  for (const step of actionPlan.filter((item) =>
    item.kind === "DIVIDEND_RECORD" && item.slotKey === slotKey,
  )) applyShadowAction(step);
  const shadowState: StockMarketShadowState = {
    version: 1,
    lastCompletedSlotKey: slotKey,
    completedAt: now.toISOString(),
    prices: [...currentPrices.values()].map(stockPriceToShadow),
    rejectedDividendActionIds: [...rejectedDividendActionIds].sort(),
    pendingFlows,
    seenFlowOperationKeys: [...seenFlowOperationKeys].sort(),
  };
  const shadowComparison = results.map((shadow) => {
    const legacyPrice = liveByTicker.get(shadow.ticker)?.price ?? null;
    return {
      ticker: shadow.ticker,
      shadowPrice: shadow.price,
      legacyPrice,
      deltaPercent: legacyPrice && legacyPrice > 0
        ? ((shadow.price - legacyPrice) / legacyPrice) * 100
        : null,
    };
  });
  return {
    date,
    slot: slotKey,
    mergedSlotKeys,
    sourceRevision: shadowState.prices
      .map((price) => `${price.ticker}:${price.price}`)
      .join("|"),
    results,
    skipDiscord: true,
    warning: window.warning,
    shadowState,
    shadowComparison,
  };
}

/**
 * 09·13·18·23 가격 회차 실행. 누락 회차는 최신 회차 하나로 합치며 Mongo transaction
 * 하나가 9종목·수급·공시·history·시장 상태를 함께 확정한다.
 */
export async function applyNovexStockMarketTick(
  options: ApplyNovexStockMarketTickOptions = {},
): Promise<ScheduledStockTickSummary> {
  const now = options.now ?? new Date();
  const slotKey = options.slotKey ?? latestDueNovexSlot(now);
  if (!slotKey) {
    throw new NovexStockTickNotDueError(
      new Date(`${novexKstDate(now)}T09:00:00+09:00`),
    );
  }
  const slotAt = parseNovexSlotKey(slotKey);
  if (slotAt.getTime() > now.getTime()) throw new NovexStockTickNotDueError(slotAt);
  const date = slotKey.slice(0, 10);
  const dayStart = new Date(`${date}T00:00:00+09:00`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  await ensureRemainingNovexAutoQueue(
    date,
    Number(slotKey.slice(11, 13)),
    now,
  );
  const [exception, regularSessionStarts] = await Promise.all([
    getStockMarketCalendarException(date),
    listRegularSessionStartsForStockMarket({
      title: NOVEX_REGULAR_SESSION_TITLE,
      start: dayStart,
      end: dayEnd,
    }),
  ]);
  const window = resolveNovexTradingWindow({
    kstDate: date,
    regularSessionStarts,
    exception,
  });
  const random = options.random ?? seededNovexRandom(slotKey);
  const samples = new Map(
    STOCK_CATALOG.map((stock) => [stock.ticker, random()]),
  );
  const deferForEarlyClose = shouldDeferNovexRoundForEarlyClose(
    slotKey,
    window.closesAt,
  );
  const closeAfterRound =
    !deferForEarlyClose && slotAt.getTime() >= window.closesAt.getTime();
  const seasonActivationCandidates =
    await buildNovexSeasonActivationCandidates(slotKey, now);

  // 조기폐장 뒤의 일요일 잔여 회차는 가격을 굴리지 않는다. 월요일 09시에 병합된다.
  if (deferForEarlyClose) {
    const tomorrow = novexKstDate(new Date(dayStart.getTime() + 24 * 60 * 60 * 1000));
    await closeStockMarketWithoutRound({
      tradingDate: date,
      opensAt: window.opensAt,
      closesAt: window.closesAt,
      nextOpenAt: new Date(`${tomorrow}T09:00:00+09:00`),
      closureReason: window.closureReason,
      finalizeSeason: isNovexRegularSessionDate(date),
      now,
    });
    if (slotKey.endsWith("23:00")) await ensureNextDayNovexAutoQueue(date, now);
    return {
      date,
      slot: slotKey,
      results: [],
      marketStateChanged: true,
      skipDiscord: true,
      warning: window.warning,
    };
  }

  const outcome = await applyStockMarketRoundTransaction({
    slotKey,
    resolveMergedSlotKeys: (lastCompletedSlotKey) =>
      enumerateNovexSlotsAfter(lastCompletedSlotKey, slotKey),
    delayed: now.getTime() > slotAt.getTime() + 60_000,
    now,
    tradingDate: date,
    opensAt: window.opensAt,
    closesAt: window.closesAt,
    nextSlotAt: nextNovexMarketActionAt(slotKey, closeAfterRound),
    closeAfterRound,
    closureReason: closeAfterRound ? window.closureReason : undefined,
    season: {
      resolveActivation: (mergedSlotKeys) =>
        selectNovexSeasonActivationForMergedSlots(
          seasonActivationCandidates,
          mergedSlotKeys,
        ),
      endsAt: isNovexRegularSessionDate(date) ? window.closesAt : undefined,
      finalize: closeAfterRound && isNovexRegularSessionDate(date),
    },
    seeds: STOCK_CATALOG.map((stock) => ({ ticker: stock.ticker, price: stock.basePrice })),
    calculate(current, context) {
      const calculated = calculateNovexPrice({
        current,
        flowPercent: context.flow.percent,
        disclosure: context.disclosure,
        structuralDisclosurePercent: context.structuralDisclosurePercent,
        random: () => samples.get(current.ticker) ?? 0.5,
        now,
      });
      return {
        price: calculated.price,
        referencePrice: calculated.referencePrice,
        eventText: calculated.eventText,
        eventTier: calculated.eventTier,
        basePercent: calculated.basePercent,
        flowPercent: calculated.flowPercent,
        disclosurePercent: calculated.disclosurePercent,
        cooldownUntil: calculated.cooldownUntil,
        cooldownReason: calculated.cooldownReason,
        pendingBasePercent: calculated.pendingBasePercent,
        consumeFlow: calculated.consumeFlow,
      };
    },
  });
  if (slotKey.endsWith("23:00")) await ensureNextDayNovexAutoQueue(date, now);

  return {
    date,
    slot: slotKey,
    mergedSlotKeys:
      outcome.histories[0]?.mergedSlotKeys ?? outcome.state.mergedSlotKeys,
    sourceRevision: outcome.histories
      .map((history) => `${history.ticker}:${history.price}:${history.createdAt.toISOString()}`)
      .join("|"),
    results: outcome.histories.map((history) => ({
      ticker: history.ticker,
      previousPrice: history.prevPrice,
      price: history.price,
      changePercent: changePercent(history.prevPrice, history.price),
      eventText: history.eventText ?? "정기 변동",
      eventTier: history.eventTier ?? "routine",
      status: outcome.applied ? "updated" : "skipped",
      cumulativeSplitFactor:
        outcome.prices.find((price) => price.ticker === history.ticker)
          ?.cumulativeSplitFactor ?? 1,
      cumulativeCapitalIncreaseFactor:
        outcome.prices.find((price) => price.ticker === history.ticker)
          ?.cumulativeCapitalIncreaseFactor ?? 1,
    })),
    skipDiscord: shouldSkipNovexClosingBriefing(slotKey, now),
    warning: window.warning,
  };
}

function randomMagnitude(random: () => number): number {
  // Average of multiple random samples gives fewer extreme spikes than pure uniform.
  const samples = 4;
  let sum = 0;
  for (let i = 0; i < samples; i += 1) {
    sum += random();
  }
  return sum / samples;
}

function volatilityForBasePrice(basePrice: number): number {
  if (basePrice >= 500) return 0.08;
  if (basePrice >= 100) return 0.1;
  return 0.14;
}

function signForDirection(direction: StockPriceDirection): 1 | -1 {
  return direction === "up" ? 1 : -1;
}

function rollDirection(random: () => number): StockPriceDirection {
  return random() < UP_DIRECTION_CHANCE ? "up" : "down";
}

function kstDateBounds(dateTag: string): { start: Date; end: Date } {
  const start = new Date(`${dateTag}T00:00:00+09:00`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

function calculateRoutinePercent(
  currentPrice: number,
  basePrice: number,
  direction: StockPriceDirection,
  random: () => number,
): number {
  const volatility = volatilityForBasePrice(basePrice);
  const directionSign = signForDirection(direction);
  const distanceFromBase = (basePrice - currentPrice) / Math.max(basePrice, 1);
  const movesTowardBase = directionSign * distanceFromBase > 0;
  const meanReversionBias = Math.min(0.25, Math.abs(distanceFromBase) * 0.12);
  const baseMagnitude = Math.max(0.006, randomMagnitude(random) * volatility);
  const adjustedMagnitude =
    baseMagnitude * (movesTowardBase ? 1 + meanReversionBias : 1 - meanReversionBias);
  const rawPercent = directionSign * adjustedMagnitude;
  return Math.max(-0.18, Math.min(0.18, rawPercent));
}

function calculateNextPrice(
  currentPrice: number,
  basePrice: number,
  percent: number,
): number {
  const upperBound = Math.max(basePrice * 5, basePrice + 10);
  return normalizeStockPrice(Math.min(upperBound, currentPrice * (1 + percent)));
}

function changePercent(prevPrice: number, price: number): number {
  return prevPrice > 0 ? ((price - prevPrice) / prevPrice) * 100 : 0;
}

const STOCK_TICK_RANDOM_SAMPLE_COUNT = 8;

function collectRandomSamples(random: () => number): number[] {
  return Array.from(
    { length: STOCK_TICK_RANDOM_SAMPLE_COUNT },
    () => random(),
  );
}

function replayRandom(samples: readonly number[]): () => number {
  let index = 0;
  return () => {
    const value = samples[index] ?? samples[samples.length - 1] ?? 0.5;
    index += 1;
    return value;
  };
}

function calculateScheduledMutation(
  current: StockPrice,
  meta: (typeof STOCK_CATALOG)[number],
  scheduledEvent: ScheduledTickContext["scheduledEvent"],
  randomSamples: readonly number[],
  stockImpact: { soldQuantity: number; eventIds: string[] } | undefined,
) {
  if (scheduledEvent) {
    const nextPrice = normalizeStockPrice(
      current.price * scheduledEvent.priceMultiplier,
    );
    const percent = changePercent(current.price, nextPrice);
    return {
      price: nextPrice,
      eventText: `${scheduledEvent.text} ${percent >= 0 ? "+" : ""}${percent.toFixed(2)}%`,
      eventTier: scheduledEvent.tier,
    };
  }

  const random = replayRandom(randomSamples);
  const direction = rollDirection(random);
  const routinePercent = calculateRoutinePercent(
    current.price,
    meta.basePrice,
    direction,
    random,
  );
  const rolledEvent = rollStockMarketEvent(
    meta.ticker,
    routinePercent,
    direction,
    random,
  );
  const stockImpactPercent = calculateMrBeastSodaStockImpactPercent(
    stockImpact?.soldQuantity ?? 0,
  );
  const combinedPercent = rolledEvent.percent + stockImpactPercent;
  const nextPrice = calculateNextPrice(
    current.price,
    meta.basePrice,
    combinedPercent,
  );
  const percent = changePercent(current.price, nextPrice);
  const stockImpactText =
    stockImpactPercent > 0
      ? ` · 미스터비스트 소다 ${stockImpact!.soldQuantity.toLocaleString("ko-KR")}개 판매 +${(stockImpactPercent * 100).toFixed(2)}%p`
      : "";
  return {
    price: nextPrice,
    eventText:
      stockImpactPercent > 0
        ? `${rolledEvent.text}${stockImpactText} · 최종 ${percent >= 0 ? "+" : ""}${percent.toFixed(2)}%`
        : `${rolledEvent.text} ${percent >= 0 ? "+" : ""}${percent.toFixed(2)}%`,
    eventTier: rolledEvent.tier,
  };
}

function skippedTickResult(
  meta: (typeof STOCK_CATALOG)[number],
  outcome: ApplyScheduledStockPriceMutationResult,
): ScheduledStockTickResult {
  return {
    ticker: meta.ticker,
    previousPrice: outcome.price.prevPrice ?? meta.basePrice,
    price: outcome.price.price ?? meta.basePrice,
    changePercent: 0,
    eventText: "오늘 정기 변동 처리됨",
    eventTier: "routine",
    status: "skipped",
  };
}

export async function applyScheduledStockTick(
  options: ApplyScheduledStockTickOptions = {},
  dependencies: ApplyScheduledStockTickDependencies = {},
): Promise<ScheduledStockTickSummary> {
  const now = options.now ?? new Date();
  const today = kstDateTag(now);
  const executeAt = new Date(`${today}T12:00:00+09:00`);
  if (!options.force && now.getTime() < executeAt.getTime()) {
    throw new ScheduledStockTickNotDueError(today, executeAt);
  }
  const slot = `${today} 12:00`;
  const lastUpdate = kstNowTag(now);
  const results: ScheduledStockTickResult[] = [];
  const applyMutation =
    dependencies.applyMutation ?? applyScheduledStockPriceMutation;
  const consumeStockImpact =
    dependencies.consumeStockImpact ?? consumeMrBeastSodaStockImpactDemand;
  const claimScheduledEvent =
    dependencies.claimScheduledEvent ?? claimPendingStockScheduledEvent;
  const random = dependencies.random ?? Math.random;
  const forceRunId = options.force
    ? options.operationId ??
      dependencies.createRunId?.() ??
      crypto.randomUUID()
    : null;

  for (const meta of STOCK_CATALOG) {
    const operationKey = forceRunId
      ? `stocks.tick.manual:${today}:${forceRunId}:${meta.ticker}`
      : `stocks.tick:${today}:${meta.ticker}`;
    const randomSamples = collectRandomSamples(random);
    const builtInEvent = !options.force
      ? findScheduledStockMarketEvent(today, meta.ticker, now)
      : undefined;
    const loadContext = !options.force
      ? async (
          session: Parameters<typeof claimScheduledEvent>[0]["session"],
        ): Promise<ScheduledTickContext> => {
          if (builtInEvent) return { scheduledEvent: builtInEvent };

          const claimed = await claimScheduledEvent({
            ticker: meta.ticker,
            kstDate: today,
            operationKey,
            now,
            session,
          });
          if (claimed) {
            return {
              scheduledEvent: {
                priceMultiplier: 1 + claimed.changePercent / 100,
                tier: claimed.eventTier,
                text: claimed.eventText,
              },
            };
          }

          if (
            options.sodaStockImpactEnabled === true &&
            meta.ticker === MRBEAST_SODA_STOCK_IMPACT_TICKER
          ) {
            return {
              stockImpact: await consumeStockImpact({
                operationKey,
                now,
                session,
              }),
            };
          }
          return {};
        }
      : undefined;
    const outcome = await applyMutation({
      ticker: meta.ticker,
      operationKey,
      initialPrice: meta.basePrice,
      initialLastUpdateKst: lastUpdate,
      initialEventText: "정기 시세 초기화",
      loadContext,
      calculate: (current, context: ScheduledTickContext | undefined) =>
        calculateScheduledMutation(
          current,
          meta,
          context?.scheduledEvent,
          randomSamples,
          context?.stockImpact,
        ),
    });

    if (!outcome.applied) {
      results.push(skippedTickResult(meta, outcome));
      continue;
    }

    if (outcome.initialized) {
      results.push({
        ticker: meta.ticker,
        previousPrice: outcome.history.prevPrice,
        price: outcome.history.price,
        changePercent: 0,
        eventText: outcome.history.eventText ?? "정기 시세 초기화",
        eventTier: "routine",
        status: "initialized",
      });
      continue;
    }

    const percent = changePercent(
      outcome.history.prevPrice,
      outcome.history.price,
    );
    results.push({
      ticker: meta.ticker,
      previousPrice: outcome.history.prevPrice,
      price: outcome.history.price,
      changePercent: percent,
      eventText: outcome.history.eventText ?? "정기 변동",
      eventTier: outcome.history.eventTier ?? "routine",
      status: "updated",
    });
  }

  return { date: today, slot, results };
}

/**
 * 오늘 가격은 이미 반영됐지만 Discord desired-state 저장만 실패한 경우를 복구한다.
 * force 실행으로 같은 ticker의 scheduled 행이 여러 개면 가장 최근 행을 사용한다.
 */
export async function rebuildScheduledStockTickSummary(
  date = kstDateTag(),
): Promise<ScheduledStockTickSummary | null> {
  const { start, end } = kstDateBounds(date);
  const rows = await listScheduledStockPriceHistoryRange(start, end);
  return buildScheduledStockTickSummaryFromHistory(date, rows);
}

export function buildScheduledStockTickSummaryFromHistory(
  date: string,
  rows: readonly StockPriceHistory[],
  options: { requireComplete?: boolean } = {},
): ScheduledStockTickSummary | null {
  if (rows.length === 0) return null;

  const latestByTicker = new Map(rows.map((row) => [row.ticker, row]));
  const results: ScheduledStockTickResult[] = [];
  for (const meta of STOCK_CATALOG) {
    const row = latestByTicker.get(meta.ticker);
    if (!row) continue;
    const percent = changePercent(row.prevPrice, row.price);
    const fallbackTier: StockEventTier =
      row.eventText?.startsWith("정기 변동") ||
      row.eventText === "정기 시세 초기화"
        ? "routine"
        : "scenario";
    results.push({
      ticker: row.ticker,
      previousPrice: row.prevPrice,
      price: row.price,
      changePercent: percent,
      eventText: row.eventText ?? "정기 변동",
      eventTier: row.eventTier ?? fallbackTier,
      status:
        row.eventText === "정기 시세 초기화" ? "initialized" : "updated",
    });
  }

  if (results.length === 0) return null;
  if (
    options.requireComplete !== false &&
    results.length !== STOCK_CATALOG.length
  ) {
    return null;
  }
  const sourceRevision = results
    .map((result) => {
      const row = latestByTicker.get(result.ticker)!;
      return [
        result.ticker,
        row._id ? String(row._id) : "no-id",
        row.createdAt.toISOString(),
        row.price,
      ].join(":");
    })
    .join("|");
  return { date, slot: `${date} 12:00`, sourceRevision, results };
}
