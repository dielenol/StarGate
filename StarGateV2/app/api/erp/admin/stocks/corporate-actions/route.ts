import { NextResponse } from "next/server";

import { readIdempotencyKey } from "@/lib/api/idempotency";
import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import {
  EconomicOperationConflictError,
  executeEconomicOperationResult,
} from "@/lib/db/execute-economic-operation";
import {
  createStockCorporateAction,
  listStockCorporateActions,
  StockCorporateActionCutoffError,
  StockCorporateActionConflictError,
  StockDisclosureCutoffError,
} from "@/lib/db/stock-market";
import { enqueueGmAdminAudit } from "@/lib/outbox/integration";
import { findStockByTicker } from "@/lib/stocks/catalog";
import {
  nextKstOpenSlot,
  serializeStockCorporateAction,
  toStockSlotKey,
} from "@/lib/stocks/corporate-actions";
import { isNovexV2Enabled } from "@/lib/stocks/market";
import { roundStockValue } from "@/lib/stocks/pricing";

class CorporateActionScheduleError extends Error {
  constructor() {
    super("CORPORATE_ACTION_EXECUTION_NOT_FUTURE");
    this.name = "CorporateActionScheduleError";
  }
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
  const rows = await listStockCorporateActions({ limit: 200 });
  return { items: rows.map(serializeStockCorporateAction) };
}

export async function GET() {
  const access = await requireGm();
  if ("response" in access) return access.response;
  return NextResponse.json(await listResponse());
}

export async function POST(request: Request) {
  const access = await requireGm();
  if ("response" in access) return access.response;
  const { session } = access;
  if (!isNovexV2Enabled()) {
    return NextResponse.json(
      { error: "NOVEX 2.0 enabled 모드에서만 기업행동을 예약할 수 있습니다." },
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
    type?: unknown;
    ticker?: unknown;
    executeAt?: unknown;
    perShare?: unknown;
    ratio?: unknown;
  } | null;
  const type = body?.type;
  const ticker =
    typeof body?.ticker === "string" ? body.ticker.trim().toUpperCase() : "";
  const executeAt = new Date(
    typeof body?.executeAt === "string" ? body.executeAt : "invalid",
  );
  const stock = findStockByTicker(ticker);
  if (
    (type !== "DIVIDEND" && type !== "SPLIT") ||
    !stock ||
    Number.isNaN(executeAt.getTime())
  ) {
    return NextResponse.json(
      { error: "기업행동 예약 입력이 올바르지 않습니다." },
      { status: 400 },
    );
  }
  const slotKey = toStockSlotKey(executeAt, type === "DIVIDEND" ? 23 : 9);
  if (!slotKey) {
    return NextResponse.json(
      {
        error:
          type === "DIVIDEND"
            ? "배당 기준일은 23시 가격 회차여야 합니다."
            : "액면분할은 09시 개장 회차여야 합니다.",
      },
      { status: 400 },
    );
  }

  let amountPerShare: number | undefined;
  let factor: number | undefined;
  if (type === "DIVIDEND") {
    const perShare = body?.perShare;
    if (
      typeof perShare !== "number" ||
      !Number.isFinite(perShare) ||
      perShare <= 0
    ) {
      return NextResponse.json(
        { error: "주당 배당은 0보다 큰 수여야 합니다." },
        { status: 400 },
      );
    }
    amountPerShare = roundStockValue(perShare);
  } else {
    const ratio = body?.ratio;
    if (
      typeof ratio !== "number" ||
      !Number.isInteger(ratio) ||
      ratio < 2 ||
      ratio > 10
    ) {
      return NextResponse.json(
        { error: "액면분할 비율은 2:1~10:1 정수여야 합니다." },
        { status: 400 },
      );
    }
    factor = ratio;
  }

  try {
    const operation = await executeEconomicOperationResult({
      requestId,
      domain: "stock-corporate-action-create",
      actorId: session.user.id,
      payload: {
        type,
        ticker,
        slotKey,
        ...(type === "DIVIDEND" ? { amountPerShare } : { factor }),
      },
      prepare: async () => {
        if (executeAt.getTime() <= Date.now()) {
          throw new CorporateActionScheduleError();
        }
      },
      run: async (dbSession) => {
        const now = new Date();
        const actionId = `stock-corporate-action:${requestId}`;
        const saved = await (
          type === "DIVIDEND"
            ? createStockCorporateAction(
                {
                  _id: actionId,
                  type,
                  ticker,
                  amountPerShare: amountPerShare!,
                  recordSlotKey: slotKey,
                  exDateSlotKey: nextKstOpenSlot(executeAt),
                  status: "SCHEDULED",
                  createdById: session.user.id,
                  createdAt: now,
                  updatedAt: now,
                },
                dbSession,
              )
            : createStockCorporateAction(
                {
                  _id: actionId,
                  type,
                  ticker,
                  factor: factor!,
                  executeSlotKey: slotKey,
                  status: "SCHEDULED",
                  createdById: session.user.id,
                  createdAt: now,
                  updatedAt: now,
                },
                dbSession,
              )
        );
        await enqueueGmAdminAudit(
          {
            action: "NOVEX 기업행동 예약",
            actor: {
              id: session.user.id,
              displayName: session.user.displayName,
              role: session.user.role,
            },
            summary: `${ticker} · ${type}`,
            target: slotKey,
            details: [],
            timestamp: now,
          },
          {
            session: dbSession,
            dedupeKey: `stock-corporate-action:${requestId}:audit`,
          },
        );
        return {
          status: 201,
          body: { items: [serializeStockCorporateAction(saved)] },
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
    if (
      error instanceof CorporateActionScheduleError ||
      error instanceof StockCorporateActionCutoffError ||
      error instanceof StockDisclosureCutoffError
    ) {
      return NextResponse.json(
        { error: "기업행동 실행 회차는 현재보다 미래여야 합니다." },
        { status: 400 },
      );
    }
    if (error instanceof StockCorporateActionConflictError) {
      return NextResponse.json(
        { error: "같은 종목·기업행동·회차 예약이 이미 존재합니다." },
        { status: 409 },
      );
    }
    if (
      error instanceof Error &&
      error.message === "Dividend prior 23:00 close not found"
    ) {
      return NextResponse.json(
        { error: "배당 한도 기준이 되는 직전 23시 종가가 없습니다." },
        { status: 409 },
      );
    }
    if (
      error instanceof Error &&
      error.message === "Dividend amount exceeds 25% of the prior close"
    ) {
      return NextResponse.json(
        { error: "주당 배당은 직전 23시 종가의 25% 이하여야 합니다." },
        { status: 400 },
      );
    }
    if (
      error instanceof Error &&
      error.message === "Corporate action stock price not found"
    ) {
      return NextResponse.json(
        { error: "기업행동 예약 전에 해당 종목 시세를 초기화해야 합니다." },
        { status: 409 },
      );
    }
    if (error instanceof EconomicOperationConflictError) {
      return NextResponse.json(
        { error: "동일 Idempotency-Key 요청이 처리 중이거나 충돌했습니다." },
        { status: 409 },
      );
    }
    console.error("[admin/stocks/corporate-actions] create failed:", error);
    return NextResponse.json(
      { error: "기업행동 예약에 실패했습니다." },
      { status: 500 },
    );
  }
}
