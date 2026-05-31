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
import { getStockPrices } from "@/lib/db/stocks";
import { STOCK_CATALOG } from "@/lib/stocks/catalog";

interface PriceItem {
  ticker: string;
  name: string;
  basePrice: number;
  description: string;
  price: number;
  prevPrice: number;
  eventText: string;
  /** 정수 / 소수 모두 허용. 음수면 하락. prevPrice=0 fallback 시 0. */
  changePercent: number;
  /** KST 'YYYY-MM-DD HH:mm' 또는 빈 문자열(시드 fallback). */
  lastUpdate: string;
  /** stock_prices row 존재 여부. false 면 catalog basePrice fallback. */
  isSeeded: boolean;
}

interface PricesResponse {
  items: PriceItem[];
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const prices = await getStockPrices();
    const priceByTicker = new Map(prices.map((p) => [p.ticker, p]));

    const items: PriceItem[] = STOCK_CATALOG.map((meta) => {
      const row = priceByTicker.get(meta.ticker);
      const price = row?.price ?? meta.basePrice;
      const prevPrice = row?.prevPrice ?? meta.basePrice;
      const eventText = row?.eventText ?? "";
      const lastUpdate = row?.lastUpdate ?? "";
      const changePercent =
        prevPrice > 0 ? ((price - prevPrice) / prevPrice) * 100 : 0;
      return {
        ticker: meta.ticker,
        name: meta.name,
        basePrice: meta.basePrice,
        description: meta.description,
        price,
        prevPrice,
        eventText,
        changePercent,
        lastUpdate,
        isSeeded: Boolean(row),
      };
    });

    const response: PricesResponse = { items };
    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "private, max-age=60, stale-while-revalidate=180",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "시세 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
