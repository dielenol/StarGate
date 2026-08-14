/**
 * GET /api/erp/stocks/history?ticker=&days= — 종목별 가격 시계열 (차트용).
 *
 * - ticker: STOCK_CATALOG 검증 (미존재 → 400).
 * - days: 1~365 정수 (기본 30), 또는 range=1d|1w|1m|3m|1y|all.
 * - 응답 items 는 createdAt 오름차순 (chart X 축 정합).
 *   빈 배열 가능 (시드 미적재 / 신규 종목).
 *
 * 캐시: 사용자별 영구 이력 범위를 다루므로 no-store.
 */

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { buildHistoryResponse } from "@/app/(erp)/erp/stock/_data";
import { findStockByTicker } from "@/lib/stocks/catalog";

const DEFAULT_DAYS = 30;
const MIN_DAYS = 1;
const MAX_DAYS = 365;
const RANGE_DAYS = {
  "1d": 1,
  "1w": 7,
  "1m": 30,
  "3m": 90,
  "1y": 365,
  all: null,
} as const;

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

  // range가 있으면 NOVEX 범위를 우선한다. 기존 days 호출은 1~365 호환.
  let days: number | null = DEFAULT_DAYS;
  const range = url.searchParams.get("range");
  if (range !== null) {
    if (!(range in RANGE_DAYS)) {
      return NextResponse.json(
        { error: "range는 1d|1w|1m|3m|1y|all 중 하나여야 합니다." },
        { status: 400 },
      );
    }
    days = RANGE_DAYS[range as keyof typeof RANGE_DAYS];
  }
  const daysParam = url.searchParams.get("days");
  if (range === null && daysParam !== null) {
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
    return NextResponse.json(await buildHistoryResponse(ticker, days), {
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "시세 이력 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
