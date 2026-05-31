/**
 * GET /api/erp/stocks/sparklines?days= — 카탈로그 전 종목의 sparkline 시계열.
 *
 * 카드 미니 차트용으로, 종목별 N+1 fetch 를 단일 호출로 묶기 위한 batch 엔드포인트.
 *
 * - days: 1~30 정수 (기본 7).
 * - 응답 items 는 ticker 별 points 배열 (오름차순). 시계열이 비어 있는 종목은 누락.
 *   (클라이언트는 누락 ticker 를 "데이터 없음" placeholder 로 처리.)
 *
 * 권한: ERP 로그인이면 OK (별도 RBAC 게이트 없음 — 시세는 사용자 조회 가능).
 *
 * 캐시: private 120s + SWR 300s — history route 와 동일 정책.
 */

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { listStockPriceHistoryBulk } from "@/lib/db/stocks";
import { STOCK_CATALOG } from "@/lib/stocks/catalog";

const DEFAULT_DAYS = 7;
const MIN_DAYS = 1;
const MAX_DAYS = 30;

interface SparklineItem {
  ticker: string;
  points: Array<{ ts: string; price: number }>;
}

interface SparklinesResponse {
  items: SparklineItem[];
  days: number;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
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
    const tickers = STOCK_CATALOG.map((meta) => meta.ticker);
    const rows = await listStockPriceHistoryBulk(tickers, days);
    const items: SparklineItem[] = rows.map((row) => ({
      ticker: row.ticker,
      points: row.points.map((p) => ({
        ts: p.ts.toISOString(),
        price: p.price,
      })),
    }));
    const response: SparklinesResponse = { items, days };
    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "private, max-age=900, stale-while-revalidate=3600",
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "스파크라인 시계열 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
