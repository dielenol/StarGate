import { NextResponse } from "next/server";

import { drainEquipmentWorkshopDiscordDms } from "@/lib/notifications/equipment-workshop-discord-dm-delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await drainEquipmentWorkshopDiscordDms();
  const ok = summary.configured && summary.failed === 0;
  return NextResponse.json(
    { ok, ...summary },
    { status: ok ? 200 : 503 },
  );
}
