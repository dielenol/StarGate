import { listScheduledStockMarketEvents } from "@stargate/core/domain/stock-events";
import { MongoServerError } from "mongodb";
import { NextResponse } from "next/server";

import { readIdempotencyKey } from "@/lib/api/idempotency";
import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import {
  EconomicOperationConflictError,
  executeEconomicOperationResult,
} from "@/lib/db/execute-economic-operation";
import {
  createStockScheduledEvent,
  fenceStockScheduledEventCreation,
  listStockScheduledEvents,
  StockScheduledEventConflictError,
  StockScheduledEventCreationError,
  type StockScheduledEvent,
  type StockScheduledEventTier,
} from "@/lib/db/stock-scheduled-events";
import { enqueueGmAdminAudit } from "@/lib/outbox/integration";
import { findStockByTicker } from "@/lib/stocks/catalog";
import {
  getNextStockScheduledEventDate,
  normalizeStockScheduledEventChangePercent,
  resolveStockScheduledEventExecuteAt,
  STOCK_SCHEDULED_EVENT_MAX_CHANGE_PERCENT,
  STOCK_SCHEDULED_EVENT_MIN_CHANGE_PERCENT,
  STOCK_SCHEDULED_EVENT_TEXT_MAX_LENGTH,
} from "@/lib/stocks/scheduled-event";

interface CreateEventBody {
  ticker?: string;
  kstDate?: string;
  changePercent?: number;
  eventText?: string;
  eventTier?: string;
}

interface ScheduledEventItem {
  id: string;
  ticker: string;
  stockName: string;
  kstDate: string;
  executeAt: string;
  changePercent: number;
  eventText: string;
  eventTier: StockScheduledEventTier;
  status: "PENDING" | "APPLIED" | "CANCELLED" | "SYSTEM";
  source: "gm" | "built-in";
  canCancel: boolean;
  createdBy?: string;
  createdAt?: string;
}

interface CreateEventOperationBody {
  item: ScheduledEventItem;
}

const HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function toDynamicItem(event: StockScheduledEvent): ScheduledEventItem {
  return {
    id: event._id,
    ticker: event.ticker,
    stockName: findStockByTicker(event.ticker)?.name ?? event.ticker,
    kstDate: event.kstDate,
    executeAt: event.executeAt.toISOString(),
    changePercent: event.changePercent,
    eventText: event.eventText,
    eventTier: event.eventTier,
    status: event.status,
    source: "gm",
    canCancel: event.status === "PENDING",
    createdBy: event.createdBy.displayName,
    createdAt: event.createdAt.toISOString(),
  };
}

async function requireGm() {
  const session = await auth();
  if (!session?.user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  try {
    requireRole(session.user.role, "GM");
  } catch {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session };
}

export async function GET() {
  const access = await requireGm();
  if ("response" in access) return access.response;

  const now = new Date();
  const dynamic = await listStockScheduledEvents({
    from: new Date(now.getTime() - HISTORY_WINDOW_MS),
  });
  const builtIn: ScheduledEventItem[] = listScheduledStockMarketEvents().map(
    (event) => ({
      id: `built-in:${event.date}:${event.ticker}`,
      ticker: event.ticker,
      stockName: findStockByTicker(event.ticker)?.name ?? event.ticker,
      kstDate: event.date,
      executeAt: event.executeAt.toISOString(),
      changePercent: normalizeStockScheduledEventChangePercent(
        (event.priceMultiplier - 1) * 100,
      ),
      eventText: event.text,
      eventTier: event.tier,
      status: "SYSTEM",
      source: "built-in",
      canCancel: false,
    }),
  );
  const items = [...builtIn, ...dynamic.map(toDynamicItem)].sort(
    (a, b) =>
      a.executeAt.localeCompare(b.executeAt) || a.ticker.localeCompare(b.ticker),
  );

  return NextResponse.json({
    items,
    nextTickDate: getNextStockScheduledEventDate(now),
  });
}

export async function POST(request: Request) {
  const access = await requireGm();
  if ("response" in access) return access.response;
  const { session } = access;

  const requestId = readIdempotencyKey(request);
  if (!requestId) {
    return NextResponse.json(
      { error: "유효한 Idempotency-Key 헤더가 필요합니다." },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => null)) as CreateEventBody | null;
  if (!body) {
    return NextResponse.json(
      { error: "요청 본문이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const ticker = body.ticker?.trim().toUpperCase();
  const stock = ticker ? findStockByTicker(ticker) : undefined;
  if (!ticker || !stock) {
    return NextResponse.json(
      { error: "주식 카탈로그에 없는 종목입니다." },
      { status: 400 },
    );
  }

  const kstDate = body.kstDate?.trim() ?? "";
  const executeAt = resolveStockScheduledEventExecuteAt(kstDate);
  if (!executeAt) {
    return NextResponse.json(
      { error: "정기 공시일이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const rawChangePercent = body.changePercent;
  if (
    typeof rawChangePercent !== "number" ||
    !Number.isFinite(rawChangePercent) ||
    rawChangePercent < STOCK_SCHEDULED_EVENT_MIN_CHANGE_PERCENT ||
    rawChangePercent > STOCK_SCHEDULED_EVENT_MAX_CHANGE_PERCENT
  ) {
    return NextResponse.json(
      {
        error: `변동률은 ${STOCK_SCHEDULED_EVENT_MIN_CHANGE_PERCENT}%~+${STOCK_SCHEDULED_EVENT_MAX_CHANGE_PERCENT}% 범위여야 합니다.`,
      },
      { status: 400 },
    );
  }
  const changePercent = normalizeStockScheduledEventChangePercent(
    rawChangePercent,
  );

  const eventText = body.eventText?.trim() ?? "";
  if (
    eventText.length < 1 ||
    eventText.length > STOCK_SCHEDULED_EVENT_TEXT_MAX_LENGTH
  ) {
    return NextResponse.json(
      {
        error: `공시 사유는 1~${STOCK_SCHEDULED_EVENT_TEXT_MAX_LENGTH}자로 입력해주세요.`,
      },
      { status: 400 },
    );
  }

  const eventTier = body.eventTier;
  if (eventTier !== "scenario" && eventTier !== "shock") {
    return NextResponse.json(
      { error: "공시 등급은 scenario 또는 shock이어야 합니다." },
      { status: 400 },
    );
  }

  const builtInConflict = listScheduledStockMarketEvents().some(
    (event) => event.date === kstDate && event.ticker === ticker,
  );
  if (builtInConflict) {
    return NextResponse.json(
      { error: "해당 종목과 공시일에는 시스템 예약 이벤트가 이미 있습니다." },
      { status: 409 },
    );
  }

  try {
    const operation = await executeEconomicOperationResult<CreateEventOperationBody>({
      requestId,
      domain: "stock-scheduled-event-create",
      actorId: session.user.id,
      payload: { ticker, kstDate, changePercent, eventText, eventTier },
      run: async (dbSession) => {
        const transactionNow = new Date();
        await fenceStockScheduledEventCreation({
          ticker,
          executeAt,
          now: transactionNow,
          session: dbSession,
        });
        const event = await createStockScheduledEvent(
          {
            ticker,
            kstDate,
            executeAt,
            changePercent,
            eventText,
            eventTier,
            actor: {
              id: session.user.id,
              displayName: session.user.displayName,
            },
            now: transactionNow,
          },
          dbSession,
        );
        await enqueueGmAdminAudit(
          {
            action: "주식 일회성 이벤트 예약",
            actor: {
              id: session.user.id,
              displayName: session.user.displayName,
              role: session.user.role,
            },
            summary: `${stock.name} · ${changePercent > 0 ? "+" : ""}${changePercent.toFixed(2)}%`,
            target: `${ticker} · ${kstDate} 12:00 KST`,
            details: [
              { name: "공시 등급", value: eventTier },
              { name: "공시 사유", value: eventText },
            ],
            timestamp: transactionNow,
          },
          {
            session: dbSession,
            dedupeKey: `stock-scheduled-event:${requestId}:create-audit`,
          },
        );
        return { status: 201, body: { item: toDynamicItem(event) } };
      },
    });

    return NextResponse.json(operation.body, {
      status: operation.status,
      headers: operation.replayed
        ? { "X-Idempotency-Replayed": "true" }
        : undefined,
    });
  } catch (error) {
    if (error instanceof StockScheduledEventCreationError) {
      return NextResponse.json(
        {
          error:
            error.code === "CUTOFF_REACHED"
              ? "해당 정기 공시 슬롯의 예약 마감 시각이 지났습니다."
              : "시세가 초기화되지 않은 종목에는 이벤트를 예약할 수 없습니다.",
        },
        { status: 409 },
      );
    }
    if (
      error instanceof StockScheduledEventConflictError ||
      (error instanceof MongoServerError && error.code === 11_000)
    ) {
      return NextResponse.json(
        { error: "해당 종목과 공시일에 예약 이력이 이미 있습니다." },
        { status: 409 },
      );
    }
    if (error instanceof EconomicOperationConflictError) {
      return NextResponse.json(
        {
          error:
            error.reason === "processing"
              ? "동일한 예약 요청이 처리 중입니다."
              : "동일 Idempotency-Key가 다른 요청에 사용되었습니다.",
        },
        { status: 409 },
      );
    }
    console.error("[stocks/events] create failed:", error);
    return NextResponse.json(
      { error: "주식 일회성 이벤트 예약에 실패했습니다." },
      { status: 500 },
    );
  }
}
