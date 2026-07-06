import {
  formatBillionToKor,
  getStockInfo,
} from "@/app/(erp)/erp/stock/_stockInfo";
import { STOCK_CATALOG } from "@/lib/stocks/catalog";
import { roundStockValue } from "@/lib/stocks/pricing";

export const STOCK_MARKET_INDEX_CODE = "NOVEX";
export const STOCK_MARKET_INDEX_NAME = "NOVEX 종합지수";
export const STOCK_MARKET_INDEX_BASE_VALUE = 1000;

const MARKET_CAP_UNIT = 100_000_000;

export interface StockMarketIndexQuote {
  ticker: string;
  price: number;
  prevPrice: number;
}

export interface StockMarketIndexComponent {
  ticker: string;
  name: string;
  price: number;
  prevPrice: number;
  basePrice: number;
  sharesOutstanding: number;
  marketCap: number;
  prevMarketCap: number;
  baseMarketCap: number;
  weightPercent: number;
  changePercent: number;
}

export interface StockMarketIndexSnapshot {
  code: typeof STOCK_MARKET_INDEX_CODE;
  name: typeof STOCK_MARKET_INDEX_NAME;
  value: number;
  prevValue: number;
  change: number;
  changePercent: number;
  totalMarketCap: number;
  prevTotalMarketCap: number;
  baseMarketCap: number;
  averageChangePercent: number;
  upCount: number;
  downCount: number;
  flatCount: number;
  dominantComponent: StockMarketIndexComponent | null;
  components: StockMarketIndexComponent[];
}

export interface StockMarketIndexHistoryEntry {
  ticker: string;
  price: number;
  prevPrice: number;
  createdAt: Date;
}

export interface StockMarketIndexHistoryPoint {
  /** ISO 8601. */
  ts: string;
  value: number;
  totalMarketCap: number;
}

function safePrice(value: number, fallback: number): number {
  if (Number.isFinite(value) && value > 0) return value;
  return fallback;
}

function roundIndexValue(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatIndexValue(value: number): string {
  return value.toLocaleString("ko-KR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatMarketCapCredits(value: number): string {
  return formatBillionToKor(Math.round(value / MARKET_CAP_UNIT));
}

function buildIndexComponentSeed() {
  return STOCK_CATALOG.map((meta) => {
    const info = getStockInfo(meta.ticker);
    return {
      ticker: meta.ticker,
      basePrice: meta.basePrice,
      sharesOutstanding: info?.sharesOutstanding ?? 0,
    };
  });
}

function calculateTotalMarketCap(
  prices: ReadonlyMap<string, number>,
  components = buildIndexComponentSeed(),
): number {
  return roundStockValue(
    components.reduce((sum, item) => {
      const price = safePrice(
        prices.get(item.ticker) ?? item.basePrice,
        item.basePrice,
      );
      return sum + price * item.sharesOutstanding;
    }, 0),
  );
}

function calculateBaseMarketCap(
  components = buildIndexComponentSeed(),
): number {
  return roundStockValue(
    components.reduce(
      (sum, item) => sum + item.basePrice * item.sharesOutstanding,
      0,
    ),
  );
}

function buildIndexHistoryPoint(
  ts: Date,
  prices: ReadonlyMap<string, number>,
  baseMarketCap: number,
  components = buildIndexComponentSeed(),
): StockMarketIndexHistoryPoint {
  const totalMarketCap = calculateTotalMarketCap(prices, components);
  const value =
    baseMarketCap > 0
      ? roundIndexValue(
          (totalMarketCap / baseMarketCap) * STOCK_MARKET_INDEX_BASE_VALUE,
        )
      : STOCK_MARKET_INDEX_BASE_VALUE;
  return {
    ts: ts.toISOString(),
    value,
    totalMarketCap,
  };
}

export function buildStockMarketIndexHistory(
  entries: readonly StockMarketIndexHistoryEntry[],
  currentQuotes: readonly StockMarketIndexQuote[],
): StockMarketIndexHistoryPoint[] {
  const sortedEntries = [...entries].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const currentByTicker = new Map(
    currentQuotes.map((quote) => [quote.ticker, quote]),
  );
  const firstEntryByTicker = new Map<string, StockMarketIndexHistoryEntry>();
  for (const entry of sortedEntries) {
    if (!firstEntryByTicker.has(entry.ticker)) {
      firstEntryByTicker.set(entry.ticker, entry);
    }
  }
  const metaByTicker = new Map(STOCK_CATALOG.map((meta) => [meta.ticker, meta]));
  const components = buildIndexComponentSeed();
  const workingPrices = new Map<string, number>();

  for (const meta of STOCK_CATALOG) {
    const firstEntry = firstEntryByTicker.get(meta.ticker);
    const currentQuote = currentByTicker.get(meta.ticker);
    workingPrices.set(
      meta.ticker,
      safePrice(
        firstEntry?.prevPrice ?? currentQuote?.price ?? meta.basePrice,
        meta.basePrice,
      ),
    );
  }

  const baseMarketCap = calculateBaseMarketCap(components);
  const points: StockMarketIndexHistoryPoint[] = [];
  const firstEntry = sortedEntries[0];
  const now = new Date();
  if (firstEntry) {
    points.push(
      buildIndexHistoryPoint(
        new Date(firstEntry.createdAt.getTime() - 1),
        workingPrices,
        baseMarketCap,
        components,
      ),
    );
  } else {
    const previousPrices = new Map<string, number>();
    for (const meta of STOCK_CATALOG) {
      const currentQuote = currentByTicker.get(meta.ticker);
      previousPrices.set(
        meta.ticker,
        safePrice(
          currentQuote?.prevPrice ?? currentQuote?.price ?? meta.basePrice,
          meta.basePrice,
        ),
      );
    }
    points.push(
      buildIndexHistoryPoint(
        new Date(now.getTime() - 60 * 1000),
        previousPrices,
        baseMarketCap,
        components,
      ),
    );
  }

  for (const entry of sortedEntries) {
    const meta = metaByTicker.get(entry.ticker);
    if (!meta) continue;
    workingPrices.set(entry.ticker, safePrice(entry.price, meta.basePrice));
    points.push(
      buildIndexHistoryPoint(
        entry.createdAt,
        workingPrices,
        baseMarketCap,
        components,
      ),
    );
  }

  const nowPrices = new Map(workingPrices);
  for (const meta of STOCK_CATALOG) {
    const currentQuote = currentByTicker.get(meta.ticker);
    nowPrices.set(
      meta.ticker,
      safePrice(
        currentQuote?.price ?? nowPrices.get(meta.ticker) ?? meta.basePrice,
        meta.basePrice,
      ),
    );
  }
  points.push(buildIndexHistoryPoint(now, nowPrices, baseMarketCap, components));

  return points;
}

export function buildStockMarketIndexSnapshot(
  quotes: readonly StockMarketIndexQuote[],
): StockMarketIndexSnapshot {
  const quoteByTicker = new Map(quotes.map((quote) => [quote.ticker, quote]));
  const components = STOCK_CATALOG.map((meta) => {
    const info = getStockInfo(meta.ticker);
    const sharesOutstanding = info?.sharesOutstanding ?? 0;
    const quote = quoteByTicker.get(meta.ticker);
    const price = safePrice(quote?.price ?? meta.basePrice, meta.basePrice);
    const prevPrice = safePrice(quote?.prevPrice ?? price, price);
    const marketCap = roundStockValue(price * sharesOutstanding);
    const prevMarketCap = roundStockValue(prevPrice * sharesOutstanding);
    const baseMarketCap = roundStockValue(meta.basePrice * sharesOutstanding);
    const changePercent =
      prevPrice > 0 ? ((price - prevPrice) / prevPrice) * 100 : 0;

    return {
      ticker: meta.ticker,
      name: meta.name,
      price,
      prevPrice,
      basePrice: meta.basePrice,
      sharesOutstanding,
      marketCap,
      prevMarketCap,
      baseMarketCap,
      weightPercent: 0,
      changePercent,
    };
  });

  const totalMarketCap = roundStockValue(
    components.reduce((sum, item) => sum + item.marketCap, 0),
  );
  const prevTotalMarketCap = roundStockValue(
    components.reduce((sum, item) => sum + item.prevMarketCap, 0),
  );
  const baseMarketCap = roundStockValue(
    components.reduce((sum, item) => sum + item.baseMarketCap, 0),
  );

  const weightedComponents = components.map((item) => ({
    ...item,
    weightPercent:
      totalMarketCap > 0 ? (item.marketCap / totalMarketCap) * 100 : 0,
  }));
  const upCount = weightedComponents.filter(
    (item) => item.price > item.prevPrice,
  ).length;
  const downCount = weightedComponents.filter(
    (item) => item.price < item.prevPrice,
  ).length;
  const flatCount = weightedComponents.length - upCount - downCount;
  const value =
    baseMarketCap > 0
      ? roundIndexValue((totalMarketCap / baseMarketCap) * STOCK_MARKET_INDEX_BASE_VALUE)
      : STOCK_MARKET_INDEX_BASE_VALUE;
  const prevValue =
    baseMarketCap > 0
      ? roundIndexValue((prevTotalMarketCap / baseMarketCap) * STOCK_MARKET_INDEX_BASE_VALUE)
      : value;
  const change = roundIndexValue(value - prevValue);
  const changePercent =
    prevValue > 0 ? ((value - prevValue) / prevValue) * 100 : 0;
  const averageChangePercent =
    weightedComponents.length > 0
      ? weightedComponents.reduce((sum, item) => sum + item.changePercent, 0) /
        weightedComponents.length
      : 0;
  const dominantComponent =
    weightedComponents.reduce<StockMarketIndexComponent | null>(
      (selected, item) => {
        if (!selected || item.marketCap > selected.marketCap) return item;
        return selected;
      },
      null,
    );

  return {
    code: STOCK_MARKET_INDEX_CODE,
    name: STOCK_MARKET_INDEX_NAME,
    value,
    prevValue,
    change,
    changePercent,
    totalMarketCap,
    prevTotalMarketCap,
    baseMarketCap,
    averageChangePercent,
    upCount,
    downCount,
    flatCount,
    dominantComponent,
    components: weightedComponents,
  };
}
