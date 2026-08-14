import "server-only";

import { executeEconomicOperationResult } from "@/lib/db/execute-economic-operation";
import {
  claimAdministrativeStockPrice,
  recordStockSeasonFlow,
} from "@/lib/db/stock-market";
import { buyHolding } from "@/lib/db/stocks";
import { findStockByTicker } from "@/lib/stocks/catalog";
import { isNovexV2Enabled } from "@/lib/stocks/market";
import { roundStockValue } from "@/lib/stocks/pricing";

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
  requestId: string;
  actorId: string;
}): Promise<StockRewardGrantResult> {
  const ticker = input.ticker.trim().toUpperCase();
  const meta = findStockByTicker(ticker);
  if (!meta) {
    throw new Error("등록되지 않은 주식 종목입니다.");
  }
  if (!Number.isInteger(input.shares) || input.shares <= 0) {
    throw new Error("주식 보상 수량은 0보다 큰 정수여야 합니다.");
  }
  if (!input.requestId.trim()) {
    throw new Error("주식 보상 멱등 키가 필요합니다.");
  }

  const operation = await executeEconomicOperationResult({
    requestId: input.requestId,
    domain: "stock-reward-grant",
    actorId: input.actorId,
    payload: {
      characterId: input.characterId,
      ticker,
      shares: input.shares,
    },
    run: async (session) => {
      const priceRow = await claimAdministrativeStockPrice(ticker, session);
      const price = priceRow.price;
      // 가격 fence를 실제로 획득한 시각을 기록해야 지연된 23시 배당 snapshot이
      // 폐장 뒤 지급분을 정확히 제외할 수 있다.
      const occurredAt = new Date();
      const holding = await buyHolding(
        input.characterId,
        ticker,
        input.shares,
        price,
        { session },
      );
      if (isNovexV2Enabled()) {
        await recordStockSeasonFlow(
          {
            operationKey: `season:gm-grant:${input.requestId}`,
            characterId: input.characterId,
            ticker,
            kind: "GM_GRANT",
            shares: input.shares,
            marketPrice: price,
            externalAmount: roundStockValue(input.shares * price),
            returnAmount: 0,
            occurredAt,
          },
          session,
        );
      }

      return {
        status: 200,
        body: {
          ticker,
          stockName: meta.name,
          shares: input.shares,
          price,
          holding,
        },
      };
    },
  });

  return operation.body;
}
