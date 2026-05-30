import { NextResponse } from "next/server";

import { ensureDailyStockRefresh } from "@/lib/shop/refresh-stock";
import { notifyDailyShopRestock } from "@/lib/shop/restock-notification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await ensureDailyStockRefresh();
  const notification = await notifyDailyShopRestock(summary.today);

  return NextResponse.json({ ok: true, ...summary, notification });
}
