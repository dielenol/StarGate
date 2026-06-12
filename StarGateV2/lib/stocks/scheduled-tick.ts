import {
  ensureStockPrice,
  getStockPrices,
  listScheduledStockPriceHistoryBulk,
  recordStockPriceHistory,
  updateStockPrice,
} from "@/lib/db/stocks";
import { STOCK_CATALOG } from "@/lib/stocks/catalog";
import {
  rollStockMarketEvent,
  type StockEventTier,
  type StockPriceDirection,
} from "@/lib/stocks/events";
import { normalizeStockPrice } from "@/lib/stocks/pricing";
import { kstDateTag, kstNowTag } from "@/lib/stocks/time";

interface ApplyScheduledStockTickOptions {
  /** Re-run even if today's scheduled row already exists. GM manual trigger only. */
  force?: boolean;
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
  results: ScheduledStockTickResult[];
}

function randomMagnitude(): number {
  // Average of multiple random samples gives fewer extreme spikes than pure uniform.
  const samples = 4;
  let sum = 0;
  for (let i = 0; i < samples; i += 1) {
    sum += Math.random();
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

function rollDirection(): StockPriceDirection {
  return Math.random() < 0.5 ? "up" : "down";
}

function currentKstSlotTag(): string {
  return `${kstDateTag()} 12:00`;
}

function slotTagForDate(date: Date): string {
  return `${kstDateTag(date)} 12:00`;
}

function calculateRoutinePercent(
  currentPrice: number,
  basePrice: number,
  direction: StockPriceDirection,
): number {
  const volatility = volatilityForBasePrice(basePrice);
  const directionSign = signForDirection(direction);
  const distanceFromBase = (basePrice - currentPrice) / Math.max(basePrice, 1);
  const movesTowardBase = directionSign * distanceFromBase > 0;
  const meanReversionBias = Math.min(0.25, Math.abs(distanceFromBase) * 0.12);
  const baseMagnitude = Math.max(0.006, randomMagnitude() * volatility);
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

export async function applyScheduledStockTick(
  options: ApplyScheduledStockTickOptions = {},
): Promise<ScheduledStockTickSummary> {
  const today = kstDateTag();
  const slot = currentKstSlotTag();
  const lastUpdate = kstNowTag();
  const results: ScheduledStockTickResult[] = [];

  // 종목별 개별 조회(슬롯 검사 1 + 가격 1 왕복)를 사전 일괄 조회 2회로 대체.
  // 루프는 종목당 자기 가격만 1회 갱신하므로 선조회 값과 루프 시점 값이 동일하다.
  const tickers = STOCK_CATALOG.map((meta) => meta.ticker);
  const [prices, scheduledRows] = await Promise.all([
    getStockPrices(),
    options.force
      ? Promise.resolve([])
      : listScheduledStockPriceHistoryBulk(tickers, 2),
  ]);
  const priceByTicker = new Map(prices.map((price) => [price.ticker, price]));
  // 기존 종목별 hasScheduledTickInSlot 과 동일 판정 —
  // 최근 2일 내 scheduled 행 중 오늘 슬롯 태그와 일치하는 종목은 스킵.
  const tickedInSlot = new Set(
    scheduledRows
      .filter((row) => slotTagForDate(row.createdAt) === slot)
      .map((row) => row.ticker),
  );

  for (const meta of STOCK_CATALOG) {
    const direction = rollDirection();
    if (!options.force && tickedInSlot.has(meta.ticker)) {
      const current = priceByTicker.get(meta.ticker) ?? null;
      results.push({
        ticker: meta.ticker,
        previousPrice: current?.prevPrice ?? meta.basePrice,
        price: current?.price ?? meta.basePrice,
        changePercent: 0,
        eventText: "오늘 정기 변동 처리됨",
        eventTier: "routine",
        status: "skipped",
      });
      continue;
    }

    const current = priceByTicker.get(meta.ticker) ?? null;
    if (!current) {
      const initialized = await ensureStockPrice(
        meta.ticker,
        meta.basePrice,
        lastUpdate,
        "정기 시세 초기화",
      );
      await recordStockPriceHistory({
        ticker: meta.ticker,
        price: initialized.price,
        prevPrice: initialized.prevPrice,
        eventText: initialized.eventText,
        source: "scheduled",
      });
      results.push({
        ticker: meta.ticker,
        previousPrice: initialized.prevPrice,
        price: initialized.price,
        changePercent: 0,
        eventText: initialized.eventText,
        eventTier: "routine",
        status: "initialized",
      });
      continue;
    }

    const routinePercent = calculateRoutinePercent(
      current.price,
      meta.basePrice,
      direction,
    );
    const rolledEvent = rollStockMarketEvent(
      meta.ticker,
      routinePercent,
      direction,
    );
    const nextPrice = calculateNextPrice(
      current.price,
      meta.basePrice,
      rolledEvent.percent,
    );
    const percent = changePercent(current.price, nextPrice);
    const eventText = `${rolledEvent.text} ${percent >= 0 ? "+" : ""}${percent.toFixed(2)}%`;
    const updated = await updateStockPrice(
      meta.ticker,
      nextPrice,
      eventText,
      lastUpdate,
    );
    await recordStockPriceHistory({
      ticker: meta.ticker,
      price: updated.price,
      prevPrice: current.price,
      eventText,
      source: "scheduled",
    });
    results.push({
      ticker: meta.ticker,
      previousPrice: current.price,
      price: updated.price,
      changePercent: percent,
      eventText,
      eventTier: rolledEvent.tier,
      status: "updated",
    });
  }

  return { date: today, slot, results };
}
