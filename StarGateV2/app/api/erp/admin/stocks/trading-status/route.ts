/**
 * POST /api/erp/admin/stocks/trading-status — GM 개별 종목 거래정지/재개.
 *
 * stock_prices 상태 변경과 GM 감사 outbox를 하나의 멱등 transaction으로 커밋한다.
 */

import { NextResponse } from "next/server";

import { readIdempotencyKey } from "@/lib/api/idempotency";
import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import {
  EconomicOperationConflictError,
  executeEconomicOperationResult,
} from "@/lib/db/execute-economic-operation";
import { setStockTradingHalted } from "@/lib/db/stocks";
import { enqueueGmAdminAudit } from "@/lib/outbox/integration";
import { findStockByTicker } from "@/lib/stocks/catalog";

interface TradingStatusBody {
  ticker?: string;
  isTradingHalted?: boolean;
}

interface TradingStatusOperationBody {
  item: {
    ticker: string;
    isTradingHalted: boolean;
  };
}

class StockTradingStatusTargetError extends Error {
  constructor() {
    super("PRICE_NOT_FOUND");
    this.name = "StockTradingStatusTargetError";
  }
}

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
      {
        error: "유효한 Idempotency-Key 헤더가 필요합니다.",
        code: "INVALID_IDEMPOTENCY_KEY",
      },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | TradingStatusBody
    | null;
  if (!body) {
    return NextResponse.json(
      { error: "요청 본문이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const ticker = body.ticker?.trim().toUpperCase();
  if (!ticker || !findStockByTicker(ticker)) {
    return NextResponse.json(
      { error: "주식 카탈로그에 없는 종목입니다." },
      { status: 400 },
    );
  }
  if (typeof body.isTradingHalted !== "boolean") {
    return NextResponse.json(
      { error: "isTradingHalted는 boolean이어야 합니다." },
      { status: 400 },
    );
  }
  const isTradingHalted = body.isTradingHalted;
  const occurredAt = new Date();

  try {
    const operation =
      await executeEconomicOperationResult<TradingStatusOperationBody>({
        requestId,
        domain: "stock-trading-status",
        actorId: session.user.id,
        payload: { ticker, isTradingHalted },
        run: async (dbSession) => {
          const result = await setStockTradingHalted(
            ticker,
            isTradingHalted,
            dbSession,
          );
          if (!result) throw new StockTradingStatusTargetError();

          await enqueueGmAdminAudit(
            {
              action: isTradingHalted
                ? "개별 종목 거래정지"
                : "개별 종목 거래재개",
              actor: {
                id: session.user.id,
                displayName: session.user.displayName,
                role: session.user.role,
              },
              summary: `${
                result.previousIsTradingHalted ? "거래정지" : "거래 가능"
              } → ${isTradingHalted ? "거래정지" : "거래 가능"}`,
              target: ticker,
              details: [],
              timestamp: occurredAt,
            },
            {
              session: dbSession,
              dedupeKey: `stock-trading-status:${requestId}:audit`,
            },
          );

          return {
            status: 200,
            body: { item: { ticker, isTradingHalted } },
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
    if (error instanceof StockTradingStatusTargetError) {
      return NextResponse.json(
        {
          error: "운영 시세가 등록되지 않은 종목은 거래 상태를 변경할 수 없습니다.",
          code: "PRICE_NOT_FOUND",
        },
        { status: 404 },
      );
    }
    if (error instanceof EconomicOperationConflictError) {
      return NextResponse.json(
        {
          error:
            error.reason === "processing"
              ? "동일한 거래 상태 변경 요청이 처리 중입니다."
              : "동일 Idempotency-Key가 다른 요청에 사용되었습니다.",
          code: "DUPLICATE_REQUEST",
        },
        { status: 409 },
      );
    }
    console.error("[stocks/trading-status] update failed:", error);
    return NextResponse.json(
      { error: "종목 거래 상태 변경에 실패했습니다." },
      { status: 500 },
    );
  }
}
