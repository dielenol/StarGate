/**
 * GET /api/erp/stocks/history?ticker=&days= — 종목별 가격 시계열 (차트용).
 *
 * - ticker: STOCK_CATALOG 검증 (미존재 → 400).
 * - days: 1~30 정수 (기본 30, TTL 과 동일).
 * - 응답 items 는 createdAt 오름차순 (chart X 축 정합).
 *   빈 배열 가능 (시드 미적재 / 신규 종목).
 *
 * 캐시: private 120s + SWR 300s — history 는 거의 변동 없음.
 */

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { listStockPriceHistory } from "@/lib/db/stocks";
import { findStockByTicker } from "@/lib/stocks/catalog";

const DEFAULT_DAYS = 30;
const MIN_DAYS = 1;
const MAX_DAYS = 30;

interface HistoryItem {
  price: number;
  prevPrice: number;
  eventText?: string;
  source: "scheduled" | "trade" | "gm-event";
  /** ISO 8601 — 클라이언트에서 new Date() 로 파싱. */
  createdAt: string;
}

interface HistoryResponse {
  items: HistoryItem[];
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const ticker = url.searchParams.get("ticker")?.trim() ?? "";
  if (!ticker) {
    return NextResponse.json(
      { error: "ticker는 필수입니다." },
      { status: 400 },
    );
  }
  if (!findStockByTicker(ticker)) {
    return NextResponse.json(
      { error: "주식 카탈로그에 없는 종목입니다." },
      { status: 400 },
    );
  }

  // days 가 누락되면 DEFAULT_DAYS, 정수 1~30 외의 값은 400.
  let days = DEFAULT_DAYS;
  const daysParam = url.searchParams.get("days");
  if (daysParam !== null) {
    const parsed = Number.parseInt(daysParam, 10);
    if (!Number.isInteger(parsed) || parsed < MIN_DAYS || parsed > MAX_DAYS) {
      return NextResponse.json(
        { error: `days는 ${MIN_DAYS}~${MAX_DAYS} 사이의 정수여야 합니다.` },
        { status: 400 },
      );
    }
    days = parsed;
  }

  try {
    const rows = await listStockPriceHistory(ticker, days);
    const items: HistoryItem[] = rows.map((r) => ({
      price: r.price,
      prevPrice: r.prevPrice,
      eventText: r.eventText,
      source: r.source,
      createdAt: r.createdAt.toISOString(),
    }));
    const response: HistoryResponse = { items };
    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "private, max-age=900, stale-while-revalidate=3600",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "시세 이력 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
