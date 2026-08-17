import { NextResponse } from "next/server";

import { readIdempotencyKey } from "@/lib/api/idempotency";
import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import {
  EconomicOperationConflictError,
  executeEconomicOperationResult,
} from "@/lib/db/execute-economic-operation";
import {
  cancelStockScheduledEvent,
  StockScheduledEventConflictError,
  StockScheduledEventCutoverError,
  StockScheduledEventNotFoundError,
} from "@/lib/db/stock-scheduled-events";
import { enqueueGmAdminAudit } from "@/lib/outbox/integration";

interface RouteContext {
  params: Promise<{ eventId: string }>;
}
interface CancelEventOperationBody {
  eventId: string;
  status: "CANCELLED";
}

const EVENT_ID_PATTERN = /^stock-event:\d{4}-\d{2}-\d{2}:[A-Z0-9]+$/;

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

  const { eventId: rawEventId } = await context.params;
  const eventId = decodeURIComponent(rawEventId);
  if (!EVENT_ID_PATTERN.test(eventId)) {
    return NextResponse.json(
      { error: "취소할 예약 이벤트 ID가 올바르지 않습니다." },
      { status: 400 },
    );
  }
  const now = new Date();

  try {
    const operation = await executeEconomicOperationResult<CancelEventOperationBody>({
      requestId,
      domain: "stock-scheduled-event-cancel",
      actorId: session.user.id,
      payload: { eventId },
      run: async (dbSession) => {
        const cancelled = await cancelStockScheduledEvent({
          eventId,
          actor: {
            id: session.user.id,
            displayName: session.user.displayName,
          },
          now,
          session: dbSession,
        });
        await enqueueGmAdminAudit(
          {
            action: "주식 일회성 이벤트 취소",
            actor: {
              id: session.user.id,
              displayName: session.user.displayName,
              role: session.user.role,
            },
            summary: `${cancelled.ticker} · ${cancelled.kstDate} 예약 취소`,
            target: eventId,
            details: [{ name: "공시 사유", value: cancelled.eventText }],
            timestamp: now,
          },
          {
            session: dbSession,
            dedupeKey: `stock-scheduled-event:${requestId}:cancel-audit`,
          },
        );
        return { status: 200, body: { eventId, status: "CANCELLED" } };
      },
    });
    return NextResponse.json(operation.body, {
      status: operation.status,
      headers: operation.replayed
        ? { "X-Idempotency-Replayed": "true" }
        : undefined,
    });
  } catch (error) {
    if (error instanceof StockScheduledEventCutoverError) {
      return NextResponse.json(
        { error: "NOVEX 2.0 전환 처리 중에는 레거시 예약 이벤트를 취소할 수 없습니다." },
        { status: 409 },
      );
    }
    if (error instanceof StockScheduledEventNotFoundError) {
      return NextResponse.json(
        { error: "예약 이벤트를 찾을 수 없습니다." },
        { status: 404 },
      );
    }
    if (error instanceof StockScheduledEventConflictError) {
      return NextResponse.json(
        {
          error:
            error.status === "APPLIED"
              ? "이미 정기 공시에 적용된 이벤트는 취소할 수 없습니다."
              : "이미 취소된 예약 이벤트입니다.",
        },
        { status: 409 },
      );
    }
    if (error instanceof EconomicOperationConflictError) {
      return NextResponse.json(
        {
          error:
            error.reason === "processing"
              ? "동일한 취소 요청이 처리 중입니다."
              : "동일 Idempotency-Key가 다른 요청에 사용되었습니다.",
        },
        { status: 409 },
      );
    }
    console.error("[stocks/events] cancel failed:", error);
    return NextResponse.json(
      { error: "주식 일회성 이벤트 취소에 실패했습니다." },
      { status: 500 },
    );
  }
}
