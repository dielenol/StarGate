import type { ClientSession } from "mongodb";
import type { StockPrice } from "@stargate/shared-db/types";

import {
  claimCompatibleTradableStockPrice,
  recordStockOrderFlow,
  StockMarketTradeClaimError,
} from "@/lib/db/stock-market";
import { StockPriceTradeClaimError } from "@/lib/db/stocks";
import { isNovexV2Enabled } from "@/lib/stocks/market";

export type StockTradeAvailabilityErrorCode =
  | "MARKET_CLOSED"
  | "MARKET_OPENING_PENDING"
  | "STOCK_TRADING_HALTED"
  | "STOCK_COOLING_DOWN"
  | "PRICE_NOT_FOUND";

export class StockTradeAvailabilityError extends Error {
  constructor(readonly code: StockTradeAvailabilityErrorCode) {
    super(code);
    this.name = "StockTradeAvailabilityError";
  }
}

export async function claimStockPriceForTrade(
  ticker: string,
  session: ClientSession,
  now = new Date(),
): Promise<StockPrice> {
  try {
    return await claimCompatibleTradableStockPrice(ticker, now, session, {
      novexV2Enabled: isNovexV2Enabled(),
    });
  } catch (error) {
    if (
      error instanceof StockMarketTradeClaimError ||
      error instanceof StockPriceTradeClaimError
    ) {
      throw new StockTradeAvailabilityError(error.code);
    }
    throw error;
  }
}

export async function recordSystemStockOrderFlow(input: {
  operationKey: string;
  characterId: string;
  ticker: string;
  side: "BUY" | "SELL";
  shares: number;
  price: number;
  occurredAt: Date;
  session: ClientSession;
}): Promise<void> {
  if (!isNovexV2Enabled()) return;
  await recordStockOrderFlow(
    {
      operationKey: input.operationKey,
      characterId: input.characterId,
      ticker: input.ticker,
      side: input.side,
      shares: input.shares,
      price: input.price,
      occurredAt: input.occurredAt,
    },
    input.session,
  );
}

export function stockTradeAvailabilityMessage(
  code: StockTradeAvailabilityErrorCode,
): string {
  if (code === "MARKET_OPENING_PENDING") {
    return "09시 가격 확정이 완료되기 전에는 거래할 수 없습니다.";
  }
  if (code === "MARKET_CLOSED") return "현재 NOVEX 시장이 폐장되어 있습니다.";
  if (code === "STOCK_TRADING_HALTED") {
    return "현재 이 종목의 거래가 정지되어 있습니다.";
  }
  if (code === "STOCK_COOLING_DOWN") {
    return "급격한 가격 변동으로 이 종목이 자동 냉각 중입니다.";
  }
  return "주식 시세가 초기화되지 않았습니다.";
}
