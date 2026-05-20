import {
  ensureStockPrice,
  getStockPrice,
  listStockPriceHistory,
  recordStockPriceHistory,
  updateStockPrice,
} from "@/lib/db/stocks";
import { STOCK_CATALOG } from "@/lib/stocks/catalog";
import { rollStockMarketEvent, type StockEventTier } from "@/lib/stocks/events";
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
  results: ScheduledStockTickResult[];
}

function randomCentered(): number {
  // Average of multiple random samples gives fewer extreme spikes than pure uniform.
  const samples = 4;
  let sum = 0;
  for (let i = 0; i < samples; i += 1) {
    sum += Math.random();
  }
  return sum / samples - 0.5;
}

function volatilityForBasePrice(basePrice: number): number {
  if (basePrice >= 500) return 0.08;
  if (basePrice >= 100) return 0.1;
  return 0.14;
}

function calculateRoutinePercent(currentPrice: number, basePrice: number): number {
  const driftToBase = ((basePrice - currentPrice) / Math.max(basePrice, 1)) * 0.012;
  const volatility = volatilityForBasePrice(basePrice);
  const rawPercent = randomCentered() * 2 * volatility + driftToBase;
  return Math.max(-0.18, Math.min(0.18, rawPercent));
}

function calculateNextPrice(
  currentPrice: number,
  basePrice: number,
  percent: number,
): number {
  let delta = Math.round(currentPrice * percent);

  // Low-price stocks would often round to zero; keep scheduled ticks visible.
  if (delta === 0 && Math.abs(percent) >= 0.01) {
    delta = percent > 0 ? 1 : -1;
  }

  const upperBound = Math.max(basePrice * 5, basePrice + 10);
  return Math.max(1, Math.min(upperBound, currentPrice + delta));
}

function changePercent(prevPrice: number, price: number): number {
  return prevPrice > 0 ? ((price - prevPrice) / prevPrice) * 100 : 0;
}

async function hasScheduledTickToday(ticker: string, today: string): Promise<boolean> {
  const history = await listStockPriceHistory(ticker, 2);
  return history.some(
    (row) => row.source === "scheduled" && kstDateTag(row.createdAt) === today,
  );
}

export async function applyScheduledStockTick(
  options: ApplyScheduledStockTickOptions = {},
): Promise<ScheduledStockTickSummary> {
  const today = kstDateTag();
  const lastUpdate = kstNowTag();
  const results: ScheduledStockTickResult[] = [];

  for (const meta of STOCK_CATALOG) {
    if (!options.force && (await hasScheduledTickToday(meta.ticker, today))) {
      const current = await getStockPrice(meta.ticker);
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

    const current = await getStockPrice(meta.ticker);
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

    const routinePercent = calculateRoutinePercent(current.price, meta.basePrice);
    const rolledEvent = rollStockMarketEvent(meta.ticker, routinePercent);
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

  return { date: today, results };
}
