/**
 * GM 크레딧 운영 대시보드 — 모든 MAIN AGENT 캐릭터 잔액 보드.
 *
 * 응답: { rows: AgentBalanceRow[]; generatedAt: string }
 * - rows 정렬: balance 내림차순 → codename 오름차순.
 * - owner 정보(ownerName / ownerDiscordId) 비정규화. ownerId 가 null 이면 owner 필드 모두 null.
 *
 * 응답 코드: 401 (미인증) / 403 (GM 미만) / 500 (집계 실패).
 * Cache: no-store (실시간 운영 정보).
 */

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";

import { buildAgentBalanceRows } from "@/app/(erp)/erp/admin/credits/_data";

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
    // 행 구성은 admin/credits/_data 의 buildAgentBalanceRows 와 단일 구현 공유 —
    // balance+lastTxAt 단일 aggregation + owner 단일 $in 조회 (N+1 제거).
    const payload = await buildAgentBalanceRows();

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "잔액 보드 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
