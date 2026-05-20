import { NextResponse } from "next/server";

import { applyScheduledStockTick } from "@/lib/stocks/scheduled-tick";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await applyScheduledStockTick();
  return NextResponse.json(summary);
}

