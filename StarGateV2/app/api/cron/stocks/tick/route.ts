import { NextResponse } from "next/server";
import { isMrBeastSodaStockImpactTickEnabled } from "@stargate/core/domain/mrbeast-soda-stock-impact";

import { grantDailyCreditAllowances } from "@/lib/credits/daily-allowance";
import { notifyScheduledStockMarketWire } from "@/lib/stocks/market-wire";
import { isNovexV2Enabled } from "@/lib/stocks/market";
import {
  applyNovexStockMarketTick,
  applyScheduledStockTick,
} from "@/lib/stocks/scheduled-tick";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function runScheduledStockTick() {
  const summary = isNovexV2Enabled()
    ? await applyNovexStockMarketTick()
    : await applyScheduledStockTick({
        sodaStockImpactEnabled: isMrBeastSodaStockImpactTickEnabled(
          process.env.MRBEAST_SODA_STOCK_IMPACT_TICK_ENABLED,
        ),
      });
  const marketWire = await notifyScheduledStockMarketWire(summary);
  if (marketWire.status === "failed") {
    throw new Error(marketWire.error ?? "Discord 정기 공시 교체에 실패했습니다.");
  }
  return { ...summary, marketWire };
}

function failedMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestedJob = new URL(request.url).searchParams.get("job");
  if (
    requestedJob !== "stocks" &&
    requestedJob !== "daily-allowance" &&
    requestedJob !== "all"
  ) {
    return NextResponse.json(
      {
        error:
          "수동 복구 작업을 job=stocks|daily-allowance|all 중 하나로 지정해 주세요.",
      },
      { status: 400 },
    );
  }

  const runStocks = requestedJob === "stocks" || requestedJob === "all";
  const runDailyAllowance =
    requestedJob === "daily-allowance" || requestedJob === "all";

  const [stocks, dailyCredits] = await Promise.allSettled([
    runStocks ? runScheduledStockTick() : Promise.resolve(null),
    runDailyAllowance
      ? grantDailyCreditAllowances()
      : Promise.resolve(null),
  ]);

  const errors = [
    stocks.status === "rejected"
      ? { task: "stocks", message: failedMessage(stocks.reason) }
      : null,
    dailyCredits.status === "rejected"
      ? { task: "dailyCredits", message: failedMessage(dailyCredits.reason) }
      : null,
  ].filter(
    (error): error is { task: string; message: string } => error !== null,
  );

  return NextResponse.json(
    {
      ok: errors.length === 0,
      owner: "manual-recovery",
      requestedJob,
      stocks: stocks.status === "fulfilled" ? stocks.value : null,
      dailyCredits:
        dailyCredits.status === "fulfilled" ? dailyCredits.value : null,
      ...(errors.length > 0 ? { errors } : {}),
    },
    { status: errors.length > 0 ? 500 : 200 },
  );
}
