import { NextResponse } from "next/server";

import { getVttHostStatus } from "@/lib/vtt-runtime/host-control-client";
import { reconcileCompletedVttHostAudit } from "@/lib/vtt-runtime/host-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = await getVttHostStatus();
  if (!status.controlEnabled || status.state === "UNREACHABLE") {
    return NextResponse.json(
      {
        ok: false,
        error: "VTT 호스트 제어 상태를 확인할 수 없습니다.",
        reason: status.unavailableReason ?? "CONTROLLER_UNREACHABLE",
      },
      { status: 503 },
    );
  }

  try {
    const reconciliation = await reconcileCompletedVttHostAudit(status);
    return NextResponse.json({ ok: true, reconciliation });
  } catch (error) {
    console.error("[cron/vtt-host-audits] completion audit reconcile failed", {
      requestId: status.lastAction?.requestId ?? null,
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { ok: false, error: "VTT 호스트 전환 감사 기록에 실패했습니다." },
      { status: 500 },
    );
  }
}
