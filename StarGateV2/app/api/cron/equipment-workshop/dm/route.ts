import { NextResponse } from "next/server";

import { drainEquipmentWorkshopDiscordDms } from "@/lib/notifications/equipment-workshop-discord-dm-delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Vercel Hobby는 5분 cron을 지원하지 않아 Dokploy Schedule이 이 경로를 호출한다.
  // 전용 secret이 아직 없는 로컬 환경에서는 기존 CRON_SECRET을 폴백으로 허용한다.
  const secret =
    process.env.WORKSHOP_DM_CRON_SECRET ?? process.env.CRON_SECRET;
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
