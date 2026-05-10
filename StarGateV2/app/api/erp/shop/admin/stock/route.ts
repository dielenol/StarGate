/**
 * GET/PATCH /api/erp/shop/admin/stock — GM 전용 편의점 재고 관리.
 *
 * GET: SHOP_CATALOG 12종 + 현재 stock + lastRefresh.
 * PATCH: { itemId, stock } — 단일 item stock 직접 set (lastRefresh=todayKst 동기화).
 *
 * 권한: GM 만 통과. requireRole("GM") 위반 시 403.
 */

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import { getAllDailyStocks, refreshStock } from "@/lib/db/shop";
import { findShopItemBySlug, SHOP_CATALOG } from "@/lib/shop/catalog";
import { getTodayKst } from "@/lib/shop/refresh-stock";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    requireRole(session.user.role, "GM");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const stocks = await getAllDailyStocks();
    const byId = new Map(stocks.map((s) => [s.itemId, s]));
    const today = getTodayKst();

    const items = SHOP_CATALOG.map((item) => {
      const doc = byId.get(item.slug);
      return {
        slug: item.slug,
        name: item.name,
        icon: item.icon,
        stockMin: item.stockMin,
        stockMax: item.stockMax,
        appearRate: item.appearRate,
        currentStock: doc?.stock ?? 0,
        lastRefresh: doc?.lastRefresh ?? null,
        isStaleToday: (doc?.lastRefresh ?? null) !== today,
      };
    });

    return NextResponse.json({ items, today });
  } catch (err) {
    const message = err instanceof Error ? err.message : "재고 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    requireRole(session.user.role, "GM");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { itemId?: unknown; stock?: unknown };
  try {
    body = (await request.json()) as { itemId?: unknown; stock?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  const stock = typeof body.stock === "number" ? body.stock : NaN;

  if (!itemId) {
    return NextResponse.json({ error: "itemId 누락" }, { status: 400 });
  }
  if (!findShopItemBySlug(itemId)) {
    return NextResponse.json(
      { error: `unknown itemId: ${itemId}` },
      { status: 400 },
    );
  }
  if (!Number.isInteger(stock) || stock < 0) {
    return NextResponse.json(
      { error: "stock 은 0 이상의 정수여야 합니다." },
      { status: 400 },
    );
  }

  try {
    const today = getTodayKst();
    await refreshStock(itemId, stock, today);
    return NextResponse.json({ ok: true, itemId, stock, lastRefresh: today });
  } catch (err) {
    const message = err instanceof Error ? err.message : "재고 업데이트 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
