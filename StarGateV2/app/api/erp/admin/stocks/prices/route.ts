/**
 * POST /api/erp/admin/stocks/prices — GM stock quote override.
 */

import { NextResponse } from "next/server";

import { readIdempotencyKey } from "@/lib/api/idempotency";
import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import {
  EconomicOperationConflictError,
  executeEconomicOperationResult,
} from "@/lib/db/execute-economic-operation";
import {
  ensureStockPrice,
  getStockPrice,
  recordStockPriceHistory,
  updateStockPrice,
} from "@/lib/db/stocks";
import {
  enqueueGmAdminAudit,
  enqueueStockManualInterventionWebhook,
} from "@/lib/outbox/integration";
import { findStockByTicker } from "@/lib/stocks/catalog";
import { isNovexV2Enabled } from "@/lib/stocks/market";
import {
  MAX_STOCK_PRICE,
  MIN_STOCK_PRICE,
  formatStockValue,
  isValidStockPrice,
  normalizeStockPrice,
} from "@/lib/stocks/pricing";
import { kstNowTag } from "@/lib/stocks/time";

interface PostBody {
  ticker?: string;
  price?: number;
  eventText?: string;
}

interface ManualStockPriceOperationBody {
  item: {
    ticker: string;
    price: number;
    prevPrice: number;
    eventText: string;
    lastUpdate: string;
  };
  marketWire: { status: "queued" };
  outboxOccurredAt: string;
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

  if (isNovexV2Enabled()) {
    return NextResponse.json(
      {
        error:
          "NOVEX 2.0에서는 공시 센터에서 가격 효과를 회차에 예약해야 합니다.",
      },
      { status: 409 },
    );
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

  const body = (await request.json().catch(() => null)) as PostBody | null;
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

  const rawPrice = body.price;
  if (
    typeof rawPrice !== "number" ||
    !isValidStockPrice(rawPrice)
  ) {
    return NextResponse.json(
      {
        error: `price는 ${formatStockValue(MIN_STOCK_PRICE)}~${formatStockValue(
          MAX_STOCK_PRICE,
        )} 사이의 숫자여야 합니다.`,
      },
      { status: 400 },
    );
  }
  const price = normalizeStockPrice(rawPrice);

  const eventText = body.eventText?.trim() || "GM 시세 조정";
  if (eventText.length > 80) {
    return NextResponse.json(
      { error: "eventText는 80자 이하로 입력해주세요." },
      { status: 400 },
    );
  }

  const lastUpdate = kstNowTag();
  const occurredAt = new Date();
  const auditDedupeKey = `stock-manual:${requestId}:audit`;
  const webhookDedupeKey = `stock-manual:${requestId}:market-wire`;
  const createAuditPayload = (
    previousPrice: number,
    currentPrice: number,
    timestamp: Date,
  ) => ({
    action: "주식 시세 수동 조정",
    actor: {
      id: session.user.id,
      displayName: session.user.displayName,
      role: session.user.role,
    },
    summary: `${formatStockValue(previousPrice)} → ${formatStockValue(currentPrice)}`,
    target: ticker,
    details: [{ name: "공시 문구", value: eventText }],
    timestamp,
  });
  const createWebhookPayload = (
    previousPrice: number,
    currentPrice: number,
    timestamp: Date,
  ) => ({
    ticker,
    previousPrice,
    price: currentPrice,
    eventText,
    actor: {
      displayName: session.user.displayName,
      role: session.user.role,
    },
    occurredAt: timestamp,
  });

  try {
    const operation =
      await executeEconomicOperationResult<ManualStockPriceOperationBody>({
        requestId,
        domain: "stock-price-manual",
        actorId: session.user.id,
        payload: { ticker, price, eventText },
        run: async (dbSession) => {
          const previous = await getStockPrice(ticker, {
            session: dbSession,
          });
          const updated = previous
            ? await updateStockPrice(
                ticker,
                price,
                eventText,
                lastUpdate,
                { session: dbSession },
              )
            : await ensureStockPrice(
                ticker,
                price,
                lastUpdate,
                eventText,
                { session: dbSession },
              );
          const previousPrice = previous?.price ?? updated.prevPrice;

          await recordStockPriceHistory(
            {
              operationKey: `stocks.manual:${requestId}`,
              ticker,
              price: updated.price,
              prevPrice: previousPrice,
              eventText,
              source: "gm-event",
            },
            { session: dbSession, createdAt: occurredAt },
          );
          await enqueueGmAdminAudit(
            createAuditPayload(previousPrice, updated.price, occurredAt),
            { session: dbSession, dedupeKey: auditDedupeKey },
          );
          await enqueueStockManualInterventionWebhook(
            createWebhookPayload(previousPrice, updated.price, occurredAt),
            webhookDedupeKey,
            { session: dbSession },
          );

          return {
            status: 200,
            body: {
              item: {
                ticker: updated.ticker,
                price: updated.price,
                prevPrice: updated.prevPrice,
                eventText: updated.eventText,
                lastUpdate: updated.lastUpdate,
              },
              marketWire: { status: "queued" },
              outboxOccurredAt: occurredAt.toISOString(),
            },
          };
        },
      });

    if (operation.replayed) {
      const replayOccurredAt = new Date(operation.body.outboxOccurredAt);
      await Promise.all([
        enqueueGmAdminAudit(
          createAuditPayload(
            operation.body.item.prevPrice,
            operation.body.item.price,
            replayOccurredAt,
          ),
          { dedupeKey: auditDedupeKey },
        ),
        enqueueStockManualInterventionWebhook(
          createWebhookPayload(
            operation.body.item.prevPrice,
            operation.body.item.price,
            replayOccurredAt,
          ),
          webhookDedupeKey,
        ),
      ]);
    }

    return NextResponse.json(
      {
        item: operation.body.item,
        marketWire: operation.body.marketWire,
      },
      {
        status: operation.status,
        headers: operation.replayed
          ? { "X-Idempotency-Replayed": "true" }
          : undefined,
      },
    );
  } catch (error) {
    if (error instanceof EconomicOperationConflictError) {
      return NextResponse.json(
        {
          error:
            error.reason === "processing"
              ? "동일한 시세 조정 요청이 처리 중입니다."
              : "동일 Idempotency-Key가 다른 요청에 사용되었습니다.",
          code: "DUPLICATE_REQUEST",
        },
        { status: 409 },
      );
    }
    console.error("[stocks/prices] manual update failed:", error);
    return NextResponse.json(
      { error: "주식 시세 조정에 실패했습니다." },
      { status: 500 },
    );
  }
}
