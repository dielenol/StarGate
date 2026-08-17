import { NextResponse } from "next/server";

import { readIdempotencyKey } from "@/lib/api/idempotency";
import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import {
  EconomicOperationConflictError,
  executeEconomicOperationResult,
} from "@/lib/db/execute-economic-operation";
import {
  cancelStockCorporateAction,
  StockMarketMigrationNotReadyError,
} from "@/lib/db/stock-market";
import { enqueueGmAdminAudit } from "@/lib/outbox/integration";
import { serializeStockCorporateAction } from "@/lib/stocks/corporate-actions";

interface RouteContext {
  params: Promise<{ actionId: string }>;
}

export async function DELETE(request: Request, context: RouteContext) {
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
  const { actionId } = await context.params;
  try {
    const operation = await executeEconomicOperationResult({
      requestId,
      domain: "stock-corporate-action-cancel",
      actorId: session.user.id,
      payload: { actionId },
      run: async (dbSession) => {
        const now = new Date();
        const item = await cancelStockCorporateAction(actionId, now, dbSession);
        if (!item) throw new Error("ACTION_NOT_CANCELLABLE");
        const cancelledRemainingDisclosures =
          item.type === "RIGHTS_OFFERING" &&
          item.status === "COMPLETED" &&
          item.remainingDisclosuresCancelledAt !== undefined;
        await enqueueGmAdminAudit(
          {
            action: cancelledRemainingDisclosures
              ? "NOVEX 기업행동 연계 후속 공시 취소"
              : "NOVEX 기업행동 취소",
            actor: {
              id: session.user.id,
              displayName: session.user.displayName,
              role: session.user.role,
            },
            summary: `${item.ticker} · ${item.type}`,
            target: actionId,
            details: cancelledRemainingDisclosures
              ? [
                  {
                    name: "취소 공시 수",
                    value: String(item.remainingDisclosuresCancelledCount ?? 0),
                  },
                ]
              : [],
            timestamp: now,
          },
          {
            session: dbSession,
            dedupeKey: `stock-corporate-action:${requestId}:cancel-audit`,
          },
        );
        return {
          status: 200,
          body: { items: [serializeStockCorporateAction(item)] },
        };
      },
    });
    return NextResponse.json(operation.body, {
      status: operation.status,
      headers: operation.replayed
        ? { "X-Idempotency-Replayed": "true" }
        : undefined,
    });
  } catch (error) {
    if (error instanceof StockMarketMigrationNotReadyError) {
      return NextResponse.json(
        { error: "NOVEX 2.0 migration READY 상태에서만 기업행동을 취소할 수 있습니다." },
        { status: 409 },
      );
    }
    if (error instanceof EconomicOperationConflictError) {
      return NextResponse.json(
        { error: "동일 Idempotency-Key 요청이 처리 중이거나 충돌했습니다." },
        { status: 409 },
      );
    }
    if (error instanceof Error && error.message === "ACTION_NOT_CANCELLABLE") {
      return NextResponse.json(
        { error: "이미 처리되었거나 취소된 기업행동입니다." },
        { status: 409 },
      );
    }
    console.error("[admin/stocks/corporate-actions] cancel failed:", error);
    return NextResponse.json(
      { error: "기업행동 취소에 실패했습니다." },
      { status: 500 },
    );
  }
}
