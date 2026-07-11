/**
 * POST /api/erp/shop/admin/reorder-requests/fulfill-batch — GM 전용 발주 묶음 처리.
 *
 * 같은 품목의 여러 대기 발주 요청을 한 번에 닫고, 총 입고 수량만큼 재고를 증가시킨다.
 */

import { NextResponse, after } from "next/server";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import { notifyShopReorderFulfilled } from "@/lib/discord";
import { notifyUsers } from "@/lib/notifications/events";
import { scheduleGmAdminAudit } from "@/lib/notifications/gm-admin-audit";
import { findShopItemBySlug } from "@/lib/shop/catalog";
import { getTodayKst } from "@/lib/shop/refresh-stock";
import {
  fulfillShopReorderRequestsAndIncrementStock,
  ShopReorderRequestNotPendingError,
} from "@/lib/shop/reorder-requests";
import { recordShopStockAuditLog } from "@/lib/shop/stock-audit";

interface FulfillBatchRequestBody {
  slug?: unknown;
  requestIds?: unknown;
  quantity?: unknown;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    requireRole(session.user.role, "GM");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | FulfillBatchRequestBody
    | null;
  const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
  const requestIds = Array.isArray(body?.requestIds)
    ? Array.from(
        new Set(
          body.requestIds
            .map((id) => (typeof id === "string" ? id.trim() : ""))
            .filter(Boolean),
        ),
      )
    : [];

  if (!slug) {
    return NextResponse.json({ error: "slug 누락" }, { status: 400 });
  }
  if (requestIds.length === 0 || requestIds.length > 50) {
    return NextResponse.json(
      { error: "requestIds 는 1~50개여야 합니다." },
      { status: 400 },
    );
  }

  const item = findShopItemBySlug(slug);
  if (!item) {
    return NextResponse.json(
      { error: `편의점 카탈로그에 없는 발주 품목입니다: ${slug}` },
      { status: 409 },
    );
  }

  const quantity =
    typeof body?.quantity === "number" ? body.quantity : item.stockMax;
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 999) {
    return NextResponse.json(
      { error: "quantity 는 1~999 사이의 정수여야 합니다." },
      { status: 400 },
    );
  }

  try {
    const today = getTodayKst();
    const fulfilledAt = new Date();
    const { requests, stock } =
      await fulfillShopReorderRequestsAndIncrementStock({
        requestIds,
        quantity,
        fulfilledById: session.user.id,
        fulfilledByName: session.user.displayName,
        fulfilledAt,
        itemId: item.slug,
        today,
      });

    scheduleGmAdminAudit({
      action: "편의점 발주 묶음 처리",
      actor: {
        id: session.user.id,
        displayName: session.user.displayName,
        role: session.user.role,
      },
      summary: `${requests.length}건 완료 · +${quantity.toLocaleString()} EA · 현재 ${stock.stock.toLocaleString()} EA`,
      target: item.name,
      timestamp: fulfilledAt,
    });

    await recordShopStockAuditLog({
      action: "REORDER_FULFILL",
      itemSlug: item.slug,
      itemName: item.name,
      delta: quantity,
      stockAfter: stock.stock,
      actorId: session.user.id,
      actorName: session.user.displayName,
      actorType: "GM",
      source: "shop_reorder_fulfill_batch",
      metadata: {
        requestCount: requests.length,
        requestIds,
      },
    });

    after(async () => {
      await notifyUsers(
        requests.map((fulfilled) => ({
          userId: fulfilled.userId,
          type: "SYSTEM",
          title: "편의점 추가 발주가 완료되었습니다",
          message: [
            fulfilled.characterCodename
              ? `${fulfilled.characterCodename} · ${item.name}`
              : item.name,
            `+${quantity.toLocaleString("ko-KR")} EA 입고`,
            "편의점에서 확인하세요",
          ].join(" · "),
          link: "/erp/shop",
        })),
      );

      await notifyShopReorderFulfilled({
        today,
        item: {
          slug: item.slug,
          name: item.name,
          icon: item.icon,
          price: item.price,
          pageGroup: item.pageGroup,
        },
        quantity,
        stock: stock.stock,
        fulfilledAt,
      });
    });
    return NextResponse.json({
      ok: true,
      status: "fulfilled",
      requestIds,
      slug: item.slug,
      itemName: item.name,
      quantity,
      stock: stock.stock,
      lastRefresh: stock.lastRefresh,
      message: "발주 요청 묶음에 따라 추가 입고가 완료되었습니다.",
    });
  } catch (error) {
    if (error instanceof ShopReorderRequestNotPendingError) {
      return NextResponse.json(
        {
          error: "이미 처리되었거나 품목이 다른 발주 요청이 포함되어 있습니다.",
          code: "REORDER_ALREADY_FULFILLED",
        },
        { status: 409 },
      );
    }

    console.error("[shop reorder fulfill batch] stock update failed", {
      slug,
      requestIds,
      error: getErrorMessage(error),
    });
    return NextResponse.json(
      { error: "발주 묶음 처리 중 재고 업데이트에 실패했습니다." },
      { status: 500 },
    );
  }
}
