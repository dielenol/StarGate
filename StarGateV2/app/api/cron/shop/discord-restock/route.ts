import { NextResponse } from "next/server";

import { getTodayKst } from "@/lib/shop/refresh-stock";
import {
  recoverDailyShopRestockDiscordMessage,
  syncDailyShopRestockDiscordMessage,
} from "@/lib/shop/restock-notification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const recovery = await recoverDailyShopRestockDiscordMessage(getTodayKst());
  const result = await syncDailyShopRestockDiscordMessage();
  const ok = result === "synced" || result === "idle";
  return NextResponse.json(
    { ok, recovery, result },
    { status: ok ? 200 : 500 },
  );
}
