/**
 * GET /api/erp/shop/catalog — 편의점 카탈로그 + 일자별 재고 + 영업 여부.
 *
 * 응답:
 * - items: SHOP_CATALOG 전체 품목 + stock(0 fallback) + available(isOpen && stock>0).
 * - isOpen: 영업 시간 판정 (`isShopOpen` — 06:00~20:00 / 일요일 마감).
 *
 * 권한: ERP 로그인이면 OK (별도 RBAC 게이트 없음).
 *
 * 캐시: no-store. GM 운영 모드 전환 직후 이전 영업 상태가 되살아나면 구매 UI가
 * 실제 서버 가드와 어긋나므로 브라우저/프록시 캐시를 쓰지 않는다.
 */

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { getAllDailyStocks } from "@/lib/db/shop";
import { SHOP_CATALOG } from "@/lib/shop/catalog";
import { getShopOpenState } from "@/lib/shop/open-state";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stocks = await getAllDailyStocks();
    const stockBySlug = new Map(stocks.map((s) => [s.itemId, s.stock]));
    const openState = await getShopOpenState();

    const items = SHOP_CATALOG.map((item) => {
      const stock = stockBySlug.get(item.slug) ?? 0;
      return {
        ...item,
        stock,
        available: openState.isOpen && stock > 0,
      };
    });

    return NextResponse.json(
      {
        items,
        isOpen: openState.isOpen,
        mode: openState.mode,
        scheduledOpen: openState.scheduledOpen,
        forceOpen: openState.forceOpen,
        forceClosed: openState.forceClosed,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "카탈로그 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
