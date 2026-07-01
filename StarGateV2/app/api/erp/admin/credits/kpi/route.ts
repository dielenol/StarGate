/**
 * GM 크레딧 운영 대시보드 KPI.
 *
 * 응답: CreditKpiSnapshot { totalBalance, totalPointBalance, activeAgentCount,
 * totalGranted24h, totalDeducted24h, opPoolBalance, opPoolUpdatedAt, generatedAt }
 *
 * 응답 코드: 401 (미인증) / 403 (GM 미만) / 500 (집계 실패).
 * Cache: no-store (실시간 운영 정보).
 */

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";

import { buildInitialKpi } from "@/app/(erp)/erp/admin/credits/_data";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireRole(session.user.role, "GM");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const snapshot = await buildInitialKpi();

    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "KPI 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
