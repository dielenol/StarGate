import { NextResponse } from "next/server";

import { readIdempotencyKey } from "@/lib/api/idempotency";
import { auth } from "@/lib/auth/config";
import {
  EconomicOperationConflictError,
  executeEconomicOperationResult,
} from "@/lib/db/execute-economic-operation";
import {
  getStockMarketPreference,
  mergeStockMarketPreferenceFromLocalStorage,
  upsertStockMarketPreference,
  type StockMarketAlertRule,
} from "@/lib/db/stock-market";
import { findStockByTicker } from "@/lib/stocks/catalog";
import { isNovexV2Enabled } from "@/lib/stocks/market";

const MAX_WATCHLIST = 9;
const MAX_ALERTS = 50;
const MAX_ALERT_ID_LENGTH = 128;

interface PreferencePatch {
  watchlist?: unknown;
  alerts?: unknown;
  legacy?: {
    watchlist?: unknown;
    alerts?: unknown;
  };
}

function serializePreference(
  preference: Awaited<ReturnType<typeof getStockMarketPreference>>,
) {
  return {
    novexEnabled: isNovexV2Enabled(),
    watchlist: preference?.watchlist ?? [],
    alerts: (preference?.alerts ?? [])
      .filter((alert) => Boolean(alert.ticker))
      .map((alert) => ({
        id: alert.id,
        ticker: alert.ticker!,
        kind: alert.kind,
        ...(alert.threshold === undefined
          ? {}
          : { threshold: alert.threshold }),
        enabled: alert.enabled,
      })),
    migratedLocalStorageAt:
      preference?.migratedLocalStorageAt?.toISOString() ?? null,
  };
}

function parseWatchlist(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const tickers = Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean),
    ),
  ).sort();
  if (
    tickers.length > MAX_WATCHLIST ||
    tickers.some((ticker) => !findStockByTicker(ticker))
  ) {
    return null;
  }
  return tickers;
}

function parseAlerts(value: unknown): StockMarketAlertRule[] | null {
  if (!Array.isArray(value) || value.length > MAX_ALERTS) return null;
  const seen = new Set<string>();
  const alerts: StockMarketAlertRule[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const input = raw as Record<string, unknown>;
    const id = typeof input.id === "string" ? input.id.trim() : "";
    const ticker =
      typeof input.ticker === "string"
        ? input.ticker.trim().toUpperCase()
        : "";
    const kind = input.kind;
    const threshold = input.threshold;
    if (
      id.length < 1 ||
      id.length > MAX_ALERT_ID_LENGTH ||
      seen.has(id) ||
      !ticker ||
      !findStockByTicker(ticker) ||
      (kind !== "BELOW_PRICE" &&
        kind !== "MOVE_PERCENT" &&
        kind !== "DISCLOSURE") ||
      ((kind === "BELOW_PRICE" || kind === "MOVE_PERCENT") &&
        (typeof threshold !== "number" ||
          !Number.isFinite(threshold) ||
          threshold <= 0))
    ) {
      return null;
    }
    seen.add(id);
    alerts.push({
      id,
      ticker,
      kind,
      ...(kind !== "DISCLOSURE" && typeof threshold === "number"
        ? { threshold: Math.round(threshold * 100) / 100 }
        : {}),
      enabled: input.enabled !== false,
    });
  }
  return alerts;
}

function preserveAlertRuntime(
  next: readonly StockMarketAlertRule[],
  current: readonly StockMarketAlertRule[],
): StockMarketAlertRule[] {
  const currentById = new Map(current.map((alert) => [alert.id, alert]));
  return next.map((alert) => {
    const previous = currentById.get(alert.id);
    const sameRule =
      previous?.kind === alert.kind &&
      previous.ticker === alert.ticker &&
      previous.threshold === alert.threshold;
    return {
      ...alert,
      ...(alert.kind === "BELOW_PRICE"
        ? { armed: sameRule ? previous.armed !== false : true }
        : {}),
      ...(sameRule && previous.lastTriggeredSlotKey
        ? { lastTriggeredSlotKey: previous.lastTriggeredSlotKey }
        : {}),
      ...(sameRule && previous.lastTriggeredDisclosureId
        ? { lastTriggeredDisclosureId: previous.lastTriggeredDisclosureId }
        : {}),
    };
  });
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(
    serializePreference(await getStockMarketPreference(session.user.id)),
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isNovexV2Enabled()) {
    return NextResponse.json(
      { error: "NOVEX 2.0 시장 설정 기능이 활성화되지 않았습니다." },
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
  const body = (await request.json().catch(() => null)) as PreferencePatch | null;
  if (!body) {
    return NextResponse.json(
      { error: "요청 본문이 올바르지 않습니다." },
      { status: 400 },
    );
  }
  let parsedWatchlist: string[] | undefined;
  let parsedAlerts: StockMarketAlertRule[] | undefined;
  if (body.watchlist !== undefined) {
    const parsed = parseWatchlist(body.watchlist);
    if (!parsed) {
      return NextResponse.json(
        { error: "관심종목 설정이 올바르지 않습니다." },
        { status: 400 },
      );
    }
    parsedWatchlist = parsed;
  }
  if (body.alerts !== undefined) {
    const parsed = parseAlerts(body.alerts);
    if (!parsed) {
      return NextResponse.json(
        { error: "주식 알림 설정이 올바르지 않습니다." },
        { status: 400 },
      );
    }
    parsedAlerts = parsed;
  }
  let legacy:
    | { watchlist: string[]; alerts: StockMarketAlertRule[] }
    | undefined;
  if (body.legacy) {
    if (body.watchlist !== undefined || body.alerts !== undefined) {
      return NextResponse.json(
        { error: "이전 설정 병합과 일반 설정 저장은 나누어 요청해야 합니다." },
        { status: 400 },
      );
    }
    const legacyWatchlist = parseWatchlist(body.legacy.watchlist ?? []);
    const legacyAlerts = parseAlerts(body.legacy.alerts ?? []);
    if (!legacyWatchlist || !legacyAlerts) {
      return NextResponse.json(
        { error: "이전 주식 설정이 올바르지 않습니다." },
        { status: 400 },
      );
    }
    legacy = { watchlist: legacyWatchlist, alerts: legacyAlerts };
  }

  try {
    const operation = await executeEconomicOperationResult({
      requestId,
      domain: "stock-market-preference",
      actorId: session.user.id,
      payload: legacy
        ? { legacy }
        : { watchlist: parsedWatchlist, alerts: parsedAlerts },
      run: async (dbSession) => {
        const saved = legacy
          ? await mergeStockMarketPreferenceFromLocalStorage(
              session.user.id,
              legacy,
              new Date(),
              dbSession,
            )
          : await (async () => {
              const current = await getStockMarketPreference(session.user.id, {
                session: dbSession,
              });
              const alerts = parsedAlerts
                ? preserveAlertRuntime(parsedAlerts, current?.alerts ?? [])
                : (current?.alerts ?? []);
              return upsertStockMarketPreference(
                session.user.id,
                {
                  watchlist: parsedWatchlist ?? current?.watchlist ?? [],
                  alerts,
                  ...(current?.migratedLocalStorageAt
                    ? {
                        migratedLocalStorageAt:
                          current.migratedLocalStorageAt,
                      }
                    : {}),
                },
                { session: dbSession },
              );
            })();
        return { status: 200, body: serializePreference(saved) };
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
    console.error("[stocks/preferences] save failed:", error);
    return NextResponse.json(
      { error: "주식 설정을 저장하지 못했습니다." },
      { status: 500 },
    );
  }
}
