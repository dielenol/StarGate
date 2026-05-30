/**
 * GET /api/erp/shop/catalog — 편의점 카탈로그 + 일자별 재고 + 영업 여부.
 *
 * 응답:
 * - items: SHOP_CATALOG 13 품목 + stock(0 fallback) + available(isOpen && stock>0).
 * - isOpen: 영업 시간 판정 (`isShopOpen` — 20시 이후 / 일 종일 마감).
 *
 * 권한: ERP 로그인이면 OK (별도 RBAC 게이트 없음).
 *
 * 캐시: private 60s + SWR 120s — 짧은 트래픽 모음 최적화. 재고 변동은 buy 라우트에서
 * 클라이언트 query invalidate 로 우회.
 */

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { getAllDailyStocks } from "@/lib/db/shop";
import { isShopOpen, SHOP_CATALOG } from "@/lib/shop/catalog";
import { ensureDailyStockRefresh } from "@/lib/shop/refresh-stock";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 일일 재고 lazy refresh — KST 자정 기준 stale 이면 SHOP_CATALOG 룰로 자동 채움.
    await ensureDailyStockRefresh().catch((err) => {
      console.error("[api/erp/shop/catalog] ensureDailyStockRefresh 실패", err);
    });
    const stocks = await getAllDailyStocks();
    const stockBySlug = new Map(stocks.map((s) => [s.itemId, s.stock]));
    const isOpen = isShopOpen(new Date());

    const items = SHOP_CATALOG.map((item) => {
      const stock = stockBySlug.get(item.slug) ?? 0;
      return {
        ...item,
        stock,
        available: isOpen && stock > 0,
      };
    });

    return NextResponse.json(
      { items, isOpen },
      {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "카탈로그 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
