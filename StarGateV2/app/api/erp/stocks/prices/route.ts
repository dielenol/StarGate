/**
 * GET /api/erp/stocks/prices — 9 종목의 현재 시세 + 변동률.
 *
 * 응답:
 * - items: STOCK_CATALOG 의 9 종목 + price/prevPrice/eventText/changePercent/lastUpdate.
 *   시드 미적재 종목은 basePrice fallback (changePercent=0). 정상 운영 시 모두 시드 매칭.
 *
 * 권한: ERP 로그인이면 OK (별도 RBAC 게이트 없음).
 *
 * 캐시: private 30s + SWR 60s — 매수/매도 후 클라이언트 invalidate 로 즉시 갱신.
 */

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { buildPricesResponse } from "@/app/(erp)/erp/stock/_data";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await buildPricesResponse(), {
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "시세 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
