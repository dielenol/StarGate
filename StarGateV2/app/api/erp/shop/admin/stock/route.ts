/**
 * GET/PATCH /api/erp/shop/admin/stock — GM 전용 편의점 재고 관리.
 *
 * GET: SHOP_CATALOG 전체 품목 + 현재 stock + lastRefresh.
 * PATCH: { itemId, stock } — 단일 item stock 직접 set (lastRefresh=todayKst 동기화).
 *
 * 권한: GM 만 통과. requireRole("GM") 위반 시 403.
 */

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import { getAllDailyStocks, getStock, refreshStock } from "@/lib/db/shop";
import { findShopItemBySlug, SHOP_CATALOG } from "@/lib/shop/catalog";
import { getTodayKst } from "@/lib/shop/refresh-stock";
import { listPendingShopReorderRequests } from "@/lib/shop/reorder-requests";
import { recordShopStockAuditLog } from "@/lib/shop/stock-audit";

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
    const [stocks, reorders] = await Promise.all([
      getAllDailyStocks(),
      listPendingShopReorderRequests(),
    ]);
    const byId = new Map(stocks.map((s) => [s.itemId, s]));
    const reordersBySlug = new Map<string, typeof reorders>();
    for (const reorder of reorders) {
      const list = reordersBySlug.get(reorder.slug) ?? [];
      list.push(reorder);
      reordersBySlug.set(reorder.slug, list);
    }
    const today = getTodayKst();

    const items = SHOP_CATALOG.map((item) => {
      const doc = byId.get(item.slug);
      const pendingReorders = (reordersBySlug.get(item.slug) ?? []).map(
        (reorder) => ({
          id: reorder._id,
          date: reorder.date,
          userName: reorder.userName,
          characterCodename: reorder.characterCodename ?? null,
          createdAt: reorder.createdAt,
          defaultQuantity: item.stockMax,
        }),
      );
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
        pendingReorders,
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
  const catalogItem = findShopItemBySlug(itemId);
  if (!catalogItem) {
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
    const before = (await getStock(itemId))?.stock ?? 0;
    await refreshStock(itemId, stock, today);
    await recordShopStockAuditLog({
      action: "ADMIN_SET",
      itemSlug: itemId,
      itemName: catalogItem.name,
      delta: stock - before,
      stockBefore: before,
      stockAfter: stock,
      actorId: session.user.id,
      actorName: session.user.displayName,
      actorType: "GM",
      source: "shop_admin_stock",
    });
    return NextResponse.json({ ok: true, itemId, stock, lastRefresh: today });
  } catch (err) {
    const message = err instanceof Error ? err.message : "재고 업데이트 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
