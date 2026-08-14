import { NextResponse } from "next/server";

import { readIdempotencyKey } from "@/lib/api/idempotency";
import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import {
  EconomicOperationConflictError,
  executeEconomicOperationResult,
} from "@/lib/db/execute-economic-operation";
import {
  deleteStockMarketCalendarException,
  listStockMarketCalendarExceptions,
  upsertStockMarketCalendarException,
} from "@/lib/db/stock-market";
import { enqueueGmAdminAudit } from "@/lib/outbox/integration";
import { serializeStockCalendarException } from "@/lib/stocks/corporate-actions";
import { isNovexV2Enabled } from "@/lib/stocks/market";

const KST_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const KST_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function isValidFutureMarketDate(kstDate: string): boolean {
  if (!KST_DATE_PATTERN.test(kstDate)) return false;
  const midnight = new Date(`${kstDate}T00:00:00+09:00`);
  const opensAt = new Date(`${kstDate}T09:00:00+09:00`);
  return (
    !Number.isNaN(midnight.getTime()) &&
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(midnight) === kstDate &&
    opensAt.getTime() > Date.now()
  );
}

function isEarlyCloseTime(value: string): boolean {
  return (
    KST_TIME_PATTERN.test(value) &&
    value >= "09:00" &&
    value < "23:00"
  );
}

async function requireGm() {
  const session = await auth();
  if (!session?.user) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  try {
    requireRole(session.user.role, "GM");
  } catch {
    return {
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { session };
}

async function listResponse() {
  const rows = await listStockMarketCalendarExceptions();
  return { items: rows.map(serializeStockCalendarException) };
}

export async function GET() {
  const access = await requireGm();
  if ("response" in access) return access.response;
  return NextResponse.json(await listResponse());
}

export async function PUT(request: Request) {
  const access = await requireGm();
  if ("response" in access) return access.response;
  const { session } = access;
  if (!isNovexV2Enabled()) {
    return NextResponse.json(
      { error: "NOVEX 2.0 enabled 모드에서만 시장 캘린더를 변경할 수 있습니다." },
      { status: 409 },
    );
  }
  const requestId = readIdempotencyKey(request);
  if (!requestId) {
    return NextResponse.json(
      { error: "유효한 Idempotency-Key 헤더가 필요합니다." },
      { status: 400 },
    );
  }
  const body = (await request.json().catch(() => null)) as {
    kstDate?: unknown;
    mode?: unknown;
    closeAt?: unknown;
    reason?: unknown;
  } | null;
  const kstDate = typeof body?.kstDate === "string" ? body.kstDate.trim() : "";
  const mode = body?.mode;
  const closeAt = typeof body?.closeAt === "string" ? body.closeAt.trim() : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (
    !isValidFutureMarketDate(kstDate) ||
    (mode !== "EARLY_CLOSE" && mode !== "NORMAL_HOURS") ||
    (mode === "EARLY_CLOSE" && !isEarlyCloseTime(closeAt)) ||
    reason.length < 1 ||
    reason.length > 300
  ) {
    return NextResponse.json(
      { error: "시장 캘린더 예외 입력이 올바르지 않습니다." },
      { status: 400 },
    );
  }
  const closeAtDate =
    mode === "EARLY_CLOSE"
      ? new Date(`${kstDate}T${closeAt}:00+09:00`)
      : undefined;
  if (closeAtDate && Number.isNaN(closeAtDate.getTime())) {
    return NextResponse.json(
      { error: "조기 폐장 시각이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  try {
    const operation = await executeEconomicOperationResult({
      requestId,
      domain: "stock-calendar-upsert",
      actorId: session.user.id,
      payload: { kstDate, mode, closeAt, reason },
      run: async (dbSession) => {
        const now = new Date();
        await upsertStockMarketCalendarException(
          {
            kstDate,
            mode:
              mode === "NORMAL_HOURS"
                ? "CANCEL_EARLY_CLOSE"
                : "EARLY_CLOSE",
            ...(closeAtDate ? { closeAt: closeAtDate } : {}),
            reason,
            createdById: session.user.id,
          },
          dbSession,
        );
        await enqueueGmAdminAudit(
          {
            action: "NOVEX 시장 캘린더 예외 저장",
            actor: {
              id: session.user.id,
              displayName: session.user.displayName,
              role: session.user.role,
            },
            summary: `${kstDate} · ${mode}`,
            target: closeAt || "정규 운영",
            details: [{ name: "사유", value: reason }],
            timestamp: now,
          },
          {
            session: dbSession,
            dedupeKey: `stock-calendar:${requestId}:audit`,
          },
        );
        return { status: 200, body: { ok: true } };
      },
    });
    return NextResponse.json(await listResponse(), {
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
    console.error("[admin/stocks/calendar] save failed:", error);
    return NextResponse.json(
      { error: "시장 캘린더 예외를 저장하지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const access = await requireGm();
  if ("response" in access) return access.response;
  const { session } = access;
  if (!isNovexV2Enabled()) {
    return NextResponse.json(
      { error: "NOVEX 2.0 enabled 모드에서만 시장 캘린더를 변경할 수 있습니다." },
      { status: 409 },
    );
  }
  const requestId = readIdempotencyKey(request);
  if (!requestId) {
    return NextResponse.json(
      { error: "유효한 Idempotency-Key 헤더가 필요합니다." },
      { status: 400 },
    );
  }
  const kstDate = new URL(request.url).searchParams.get("kstDate")?.trim() ?? "";
  if (!isValidFutureMarketDate(kstDate)) {
    return NextResponse.json(
      { error: "개장 전의 유효한 KST 날짜만 변경할 수 있습니다." },
      { status: 400 },
    );
  }
  try {
    const operation = await executeEconomicOperationResult({
      requestId,
      domain: "stock-calendar-delete",
      actorId: session.user.id,
      payload: { kstDate },
      run: async (dbSession) => {
        const now = new Date();
        await deleteStockMarketCalendarException(kstDate, dbSession);
        await enqueueGmAdminAudit(
          {
            action: "NOVEX 시장 캘린더 예외 삭제",
            actor: {
              id: session.user.id,
              displayName: session.user.displayName,
              role: session.user.role,
            },
            summary: kstDate,
            target: kstDate,
            details: [],
            timestamp: now,
          },
          {
            session: dbSession,
            dedupeKey: `stock-calendar:${requestId}:delete-audit`,
          },
        );
        return { status: 200, body: { ok: true } };
      },
    });
    return NextResponse.json(await listResponse(), {
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
    console.error("[admin/stocks/calendar] delete failed:", error);
    return NextResponse.json(
      { error: "시장 캘린더 예외를 삭제하지 못했습니다." },
      { status: 500 },
    );
  }
}
