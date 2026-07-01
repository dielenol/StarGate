import { NextResponse } from "next/server";

import { grantDailyCreditAllowances } from "@/lib/credits/daily-allowance";
import { notifyScheduledStockMarketWire } from "@/lib/stocks/market-wire";
import { applyScheduledStockTick } from "@/lib/stocks/scheduled-tick";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function runScheduledStockTick() {
  const summary = await applyScheduledStockTick();
  const marketWire = await notifyScheduledStockMarketWire(summary);
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

  const [stocks, dailyCredits] = await Promise.allSettled([
    runScheduledStockTick(),
    grantDailyCreditAllowances(),
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
      stocks: stocks.status === "fulfilled" ? stocks.value : null,
      dailyCredits:
        dailyCredits.status === "fulfilled" ? dailyCredits.value : null,
      ...(errors.length > 0 ? { errors } : {}),
    },
    { status: errors.length > 0 ? 500 : 200 },
  );
}
