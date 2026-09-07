import { NextResponse } from "next/server";

import { StockMarketAutomationStoppedError } from "@/lib/db/stocks";

export function stockMarketShutdownResponse(error: unknown) {
  if (!(error instanceof StockMarketAutomationStoppedError)) return null;
  return NextResponse.json(
    {
      code: "MARKET_SELL_ONLY",
      error: "주식 매수가 영구 중단되었습니다. 최종 시세 확정 후 가격은 영구 동결되며, 보유 주식 매도만 가능합니다.",
    },
    { status: 423 },
  );
}
