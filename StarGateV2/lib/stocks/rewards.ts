import "server-only";

import { buyHolding, getStockPrice } from "@/lib/db/stocks";
import { findStockByTicker } from "@/lib/stocks/catalog";

import type { StockHolding } from "@/lib/db/stocks";

export interface StockRewardGrantResult {
  ticker: string;
  stockName: string;
  shares: number;
  price: number;
  holding: StockHolding;
}

export async function grantStockReward(input: {
  characterId: string;
  ticker: string;
  shares: number;
}): Promise<StockRewardGrantResult> {
  const ticker = input.ticker.trim().toUpperCase();
  const meta = findStockByTicker(ticker);
  if (!meta) {
    throw new Error("등록되지 않은 주식 종목입니다.");
  }
  if (!Number.isInteger(input.shares) || input.shares <= 0) {
    throw new Error("주식 보상 수량은 0보다 큰 정수여야 합니다.");
  }

  const priceRow = await getStockPrice(ticker);
  const price = priceRow?.price ?? meta.basePrice;
  const holding = await buyHolding(input.characterId, ticker, input.shares, price);

  return {
    ticker,
    stockName: meta.name,
    shares: input.shares,
    price,
    holding,
  };
}
