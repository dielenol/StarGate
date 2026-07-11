import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import { notifyScheduledStockMarketWire } from "@/lib/stocks/market-wire";
import { applyScheduledStockTick } from "@/lib/stocks/scheduled-tick";
import { scheduleGmAdminAudit } from "@/lib/notifications/gm-admin-audit";

interface PostBody {
  force?: boolean;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireRole(session.user.role, "GM");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as PostBody;
  const summary = await applyScheduledStockTick({ force: Boolean(body.force) });
  if (summary.results.some((result) => result.status !== "skipped")) {
    scheduleGmAdminAudit({
      action: "주식 정기 변동 수동 실행",
      actor: {
        id: session.user.id,
        displayName: session.user.displayName,
        role: session.user.role,
      },
      summary: `변동 ${summary.results.filter((result) => result.status !== "skipped").length}종목 · force=${Boolean(body.force)}`,
      target: `${summary.date} · ${summary.slot}`,
      timestamp: new Date(),
    });
  }
  const marketWire = await notifyScheduledStockMarketWire(summary);
  return NextResponse.json({ ...summary, marketWire });
}
