import { NextResponse } from "next/server";

import { readIdempotencyKey } from "@/lib/api/idempotency";
import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import {
  EconomicOperationConflictError,
  executeEconomicOperationResult,
} from "@/lib/db/execute-economic-operation";
import {
  enqueueGmAdminAudit,
  enqueueStockMarketRecoveryRequest,
} from "@/lib/outbox/integration";
import { isNovexV2Enabled } from "@/lib/stocks/market";

const SLOT_KEY_PATTERN = /^\d{4}-\d{2}-\d{2} (?:09|13|18|23):00$/;

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
  const requestId = readIdempotencyKey(request);
  if (!requestId) {
    return NextResponse.json(
      { error: "유효한 Idempotency-Key 헤더가 필요합니다." },
      { status: 400 },
    );
  }
  if (!isNovexV2Enabled()) {
    return NextResponse.json(
      { error: "NOVEX 2.0 enabled 모드에서만 회차를 복구할 수 있습니다." },
      { status: 409 },
    );
  }
  const body = (await request.json().catch(() => null)) as {
    slotKey?: unknown;
  } | null;
  const slotKey = typeof body?.slotKey === "string" ? body.slotKey.trim() : "";
  if (!SLOT_KEY_PATTERN.test(slotKey)) {
    return NextResponse.json(
      { error: "회차 키는 YYYY-MM-DD HH:mm 형식의 09·13·18·23시여야 합니다." },
      { status: 400 },
    );
  }
  const slotAt = new Date(`${slotKey.replace(" ", "T")}:00+09:00`);
  if (Number.isNaN(slotAt.getTime()) || slotAt.getTime() > Date.now()) {
    return NextResponse.json(
      { error: "아직 도래하지 않은 가격 회차입니다." },
      { status: 409 },
    );
  }

  try {
    const operation = await executeEconomicOperationResult({
      requestId,
      domain: "stock-market-round-recovery",
      actorId: session.user.id,
      payload: { slotKey },
      run: async (dbSession) => {
        const requestedAt = new Date();
        await enqueueStockMarketRecoveryRequest(
          {
            slotKey,
            requestedAt,
            actor: {
              id: session.user.id,
              displayName: session.user.displayName,
              role: session.user.role,
            },
          },
          `stock-recovery:${requestId}:request`,
          { session: dbSession },
        );
        await enqueueGmAdminAudit(
          {
            action: "NOVEX 지연 회차 복구",
            actor: {
              id: session.user.id,
              displayName: session.user.displayName,
              role: session.user.role,
            },
            summary: `${slotKey} · worker 복구 요청 접수`,
            target: slotKey,
            details: [],
            timestamp: requestedAt,
          },
          {
            session: dbSession,
            dedupeKey: `stock-recovery:${requestId}:audit`,
          },
        );
        return {
          status: 202,
          body: { slotKey, status: "QUEUED" as const },
        };
      },
    });
    return NextResponse.json(operation.body, {
      headers: operation.replayed
        ? { "X-Idempotency-Replayed": "true" }
        : undefined,
    });
  } catch (error) {
    if (error instanceof EconomicOperationConflictError) {
      return NextResponse.json(
        { error: "동일 Idempotency-Key 요청이 처리 중이거나 충돌했습니다." },
        { status: 409 },
      );
    }
    console.error(
      `[admin/stocks/recovery] failed (slot=${slotKey}, request=${requestId}):`,
      error,
    );
    return NextResponse.json(
      { error: "NOVEX 지연 회차 복구에 실패했습니다." },
      { status: 500 },
    );
  }
}
