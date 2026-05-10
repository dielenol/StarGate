/**
 * GM 크레딧 운영 대시보드 KPI.
 *
 * 응답: CreditKpiSnapshot { totalBalance, activeAgentCount, totalGranted24h,
 * totalDeducted24h, opPoolBalance, opPoolUpdatedAt, generatedAt }
 *
 * 응답 코드: 401 (미인증) / 403 (GM 미만) / 500 (집계 실패).
 * Cache: no-store (실시간 운영 정보).
 */

import { NextResponse } from "next/server";

import type { CreditKpiSnapshot } from "@/types/credit-admin";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import { listAgentCharacters } from "@/lib/db/characters";
import {
  OPERATION_POOL_ID,
  getCreditPool,
} from "@/lib/db/credit-pools";
import {
  getCreditsActivity24h,
  sumLatestBalancesByCharacterIds,
} from "@/lib/db/credits";

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
    // MAIN AGENT 만 ledger 대상 (Phase 2 정책 — 1인 1 MAIN, MINI/NPC 제외).
    const mainCharacters = await listAgentCharacters("MAIN");
    const characterIds = mainCharacters.map((c) => String(c._id));

    const [balanceAgg, activity24h, opPool] = await Promise.all([
      sumLatestBalancesByCharacterIds(characterIds),
      getCreditsActivity24h(),
      getCreditPool(OPERATION_POOL_ID),
    ]);

    const snapshot: CreditKpiSnapshot = {
      totalBalance: balanceAgg.totalBalance,
      activeAgentCount: characterIds.length,
      totalGranted24h: activity24h.granted,
      totalDeducted24h: activity24h.deducted,
      opPoolBalance: opPool?.balance ?? null,
      opPoolUpdatedAt: opPool?.updatedAt?.toISOString() ?? null,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "KPI 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
