/**
 * GET /api/erp/stocks/index-history?days= — NOVEX 종합지수 시계열.
 *
 * 종목별 가격 이력을 시간순으로 적용해 각 시점의 전체 시총 합계를 계산한다.
 * 권한은 시세 조회와 동일하게 ERP 로그인 사용자 전체 허용.
 */

import { NextResponse } from "next/server";

import { buildMarketIndexHistoryResponse } from "@/app/(erp)/erp/stock/_data";
import { auth } from "@/lib/auth/config";

const DEFAULT_DAYS = 7;
const MIN_DAYS = 1;
const MAX_DAYS = 30;

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
    const response = await buildMarketIndexHistoryResponse(days);
    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "private, max-age=60, stale-while-revalidate=180",
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "NOVEX 지수 시계열 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
