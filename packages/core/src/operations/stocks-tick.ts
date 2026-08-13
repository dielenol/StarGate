import {
  applyScheduledStockPriceMutation,
  claimPendingStockScheduledEvent,
  consumeMrBeastSodaStockImpactDemand,
  listScheduledStockPriceHistoryRange,
  type ApplyScheduledStockPriceMutationResult,
} from "@stargate/shared-db";
import type {
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
}

export interface ScheduledStockTickSummary {
  date: string;
  slot: string;
  sourceRevision?: string;
  results: ScheduledStockTickResult[];
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
