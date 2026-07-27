import { NextResponse } from "next/server";

import { grantDailyCreditAllowances } from "@/lib/credits/daily-allowance";
import { isLegacyCronJobEnabled } from "@/lib/runtime/legacy-cron";
import { notifyScheduledStockMarketWire } from "@/lib/stocks/market-wire";
import { applyScheduledStockTick } from "@/lib/stocks/scheduled-tick";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function runScheduledStockTick() {
  const summary = await applyScheduledStockTick();
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

  const stocksEnabled = isLegacyCronJobEnabled(
    process.env.LEGACY_CRON_STOCKS_ENABLED,
  );
  const dailyAllowanceEnabled = isLegacyCronJobEnabled(
    process.env.LEGACY_CRON_DAILY_ALLOWANCE_ENABLED,
  );

  const [stocks, dailyCredits] = await Promise.allSettled([
    stocksEnabled ? runScheduledStockTick() : Promise.resolve(null),
    dailyAllowanceEnabled
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
      owners: {
        stocks: stocksEnabled ? "vercel" : "disabled",
        dailyAllowance: dailyAllowanceEnabled ? "vercel" : "disabled",
      },
      stocks: stocks.status === "fulfilled" ? stocks.value : null,
      dailyCredits:
        dailyCredits.status === "fulfilled" ? dailyCredits.value : null,
      ...(errors.length > 0 ? { errors } : {}),
    },
    { status: errors.length > 0 ? 500 : 200 },
  );
}
