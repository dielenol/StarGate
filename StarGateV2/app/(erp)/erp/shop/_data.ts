/**
 * shop 섹션 server-only 데이터 빌더.
 *
 * `/erp/shop` 페이지와 `/api/erp/shop/catalog` 라우트가 같은 응답 형식을 쓴다 —
 * 동일 fetch 블록이 두 곳에 사본으로 있던 것을 통합 (stock/_data 선례).
 *
 * server-only — 클라이언트 import 금지 (lib/db/* 사이드이펙트 + Mongo 호출).
 */

import "server-only";

import { getAllDailyStocks } from "@/lib/db/shop";
import { getShopOpenState } from "@/lib/shop/open-state";
import { ensureDailyStockRefresh } from "@/lib/shop/refresh-stock";
import { loadRuntimeShopCatalog } from "@/lib/shop/runtime-catalog";

import type { ShopCatalogResponse } from "@/hooks/queries/useShopQuery";

/**
 * 카탈로그 + 당일 재고 + 영업 상태 응답.
 *
 * @param playerServiceTestAccess 플레이어 서비스 테스트 권한 —
 *   영업 판정(`isOpen`)과 mode/forceOpen/forceClosed 오버라이드에 반영
 *   (`resolvePlayerServiceAvailability(isOpen, user)` 와 동일한 OR semantics).
 * @param options.readOnly 조회 자체가 재고 갱신을 일으키면 안 되는 호출자용.
 *   게스트 페이지/API는 스케줄러가 준비한 현재 재고만 읽는다.
 */
export async function buildShopCatalogResponse(
  playerServiceTestAccess: boolean,
  options: { readOnly?: boolean } = {},
): Promise<ShopCatalogResponse> {
  const catalog = await loadRuntimeShopCatalog();
  // 일반 사용자는 refresh 완료 후 읽고, 게스트는 조회 중 DB 쓰기가 없도록 현재값만 읽는다.
  const [stocks, openState] = await Promise.all([
    options.readOnly
      ? getAllDailyStocks()
      : ensureDailyStockRefresh(new Date(), { catalog }).then(() =>
          getAllDailyStocks(),
        ),
    getShopOpenState(),
  ]);
  const stockBySlug = new Map(stocks.map((s) => [s.itemId, s.stock]));
  const isOpen = openState.isOpen || playerServiceTestAccess;

  const items = catalog.map((item) => {
    const stock = stockBySlug.get(item.slug) ?? 0;
    return {
      ...item,
      stock,
      available: isOpen && stock > 0,
    };
  });

  return {
    items,
    isOpen,
    mode: playerServiceTestAccess && !openState.isOpen ? "open" : openState.mode,
    scheduledOpen: openState.scheduledOpen,
    forceOpen: openState.forceOpen || playerServiceTestAccess,
    forceClosed: openState.forceClosed && !playerServiceTestAccess,
  };
}
