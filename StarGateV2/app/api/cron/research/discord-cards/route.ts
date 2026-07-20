import { NextResponse } from "next/server";

import { syncPendingEquipmentResearchDiscordCards } from "@/lib/notifications/equipment-research-discord";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await syncPendingEquipmentResearchDiscordCards();
  return NextResponse.json(
    { ok: result.failed === 0, ...result },
    { status: result.failed === 0 ? 200 : 500 },
  );
}
