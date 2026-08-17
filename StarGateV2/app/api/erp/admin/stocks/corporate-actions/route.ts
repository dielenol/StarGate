import { NextResponse } from "next/server";

import { readIdempotencyKey } from "@/lib/api/idempotency";
import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import {
  EconomicOperationConflictError,
  executeEconomicOperationResult,
} from "@/lib/db/execute-economic-operation";
import {
  claimStockMarketMigrationReady,
  createStockCorporateAction,
  listStockCorporateActions,
  StockCorporateActionCutoffError,
  StockCorporateActionConflictError,
  StockDisclosureConflictError,
  StockDisclosureCutoffError,
  StockMarketMigrationNotReadyError,
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
    announceAt?: unknown;
    perShare?: unknown;
    ratio?: unknown;
    reason?: unknown;
    priceAdjustmentPercent?: unknown;
  } | null;
  const type = body?.type;
  const ticker =
    typeof body?.ticker === "string" ? body.ticker.trim().toUpperCase() : "";
  const executeAt = new Date(
    typeof body?.executeAt === "string" ? body.executeAt : "invalid",
  );
  const announceAt = new Date(
    typeof body?.announceAt === "string" ? body.announceAt : "invalid",
  );
  const stock = findStockByTicker(ticker);
  if (
    (type !== "DIVIDEND" &&
      type !== "SPLIT" &&
      type !== "RIGHTS_OFFERING") ||
    !stock ||
    Number.isNaN(executeAt.getTime()) ||
    (type === "RIGHTS_OFFERING" && Number.isNaN(announceAt.getTime()))
  ) {
    return NextResponse.json(
      { error: "기업행동 예약 입력이 올바르지 않습니다." },
      { status: 400 },
    );
  }
  const slotKey = toStockSlotKey(
    executeAt,
    type === "DIVIDEND" ? 23 : type === "SPLIT" ? 9 : undefined,
  );
  if (!slotKey) {
    return NextResponse.json(
      {
        error:
          type === "DIVIDEND"
            ? "배당 기준일은 23시 가격 회차여야 합니다."
            : type === "SPLIT"
              ? "액면분할은 09시 개장 회차여야 합니다."
              : "유상증자 실행은 NOVEX 가격 회차(09·13·18·23시)여야 합니다.",
      },
      { status: 400 },
    );
  }

  let amountPerShare: number | undefined;
  let factor: number | undefined;
  let announceSlotKey: string | undefined;
  let reason: string | undefined;
  let priceAdjustmentPercent: number | undefined;
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
        {
          error:
            type === "RIGHTS_OFFERING"
              ? "유상증자 총 주식 수 배수는 2~10 정수여야 합니다."
              : "액면분할 비율은 2:1~10:1 정수여야 합니다.",
        },
        { status: 400 },
      );
    }
    factor = ratio;
    if (type === "RIGHTS_OFFERING") {
      announceSlotKey = toStockSlotKey(announceAt) ?? undefined;
      reason = typeof body?.reason === "string" ? body.reason.trim() : "";
      const adjustment = body?.priceAdjustmentPercent;
      if (
        !announceSlotKey ||
        announceAt.getTime() >= executeAt.getTime() ||
        !reason ||
        reason.length > 500 ||
        typeof adjustment !== "number" ||
        !Number.isFinite(adjustment) ||
        adjustment < -50 ||
        adjustment > 75
      ) {
        return NextResponse.json(
          {
            error:
              "발표·실행은 NOVEX 회차여야 하며 실행은 발표 이후여야 합니다. 사유와 -50~+75% 가격조정률도 입력해 주세요.",
          },
          { status: 400 },
        );
      }
      priceAdjustmentPercent = adjustment;
    }
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
        ...(type === "DIVIDEND"
          ? { amountPerShare }
          : type === "RIGHTS_OFFERING"
            ? {
                factor,
                announceSlotKey,
                reason,
                priceAdjustmentPercent,
              }
            : { factor }),
      },
      prepare: async () => {
        if (
          executeAt.getTime() <= Date.now() ||
          (type === "RIGHTS_OFFERING" && announceAt.getTime() <= Date.now())
        ) {
          throw new CorporateActionScheduleError();
        }
      },
      run: async (dbSession) => {
        await claimStockMarketMigrationReady(dbSession);
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
            : type === "RIGHTS_OFFERING"
              ? createStockCorporateAction(
                  {
                    _id: actionId,
                    type,
                    ticker,
                    factor: factor!,
                    reason: reason!,
                    priceAdjustmentPercent: priceAdjustmentPercent!,
                    announceSlotKey: announceSlotKey!,
                    executeSlotKey: slotKey,
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
    if (error instanceof StockMarketMigrationNotReadyError) {
      return NextResponse.json(
        { error: "NOVEX 2.0 migration READY 확인 전에는 기업행동을 예약할 수 없습니다." },
        { status: 409 },
      );
    }
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
    if (
      error instanceof StockCorporateActionConflictError ||
      error instanceof StockDisclosureConflictError
    ) {
      return NextResponse.json(
        {
          error:
            "같은 종목에 기업행동 예약 또는 수동/기업행동 거래정지가 존재합니다.",
        },
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
