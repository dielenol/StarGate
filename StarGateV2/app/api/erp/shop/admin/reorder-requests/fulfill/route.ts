/**
 * POST /api/erp/shop/admin/reorder-requests/fulfill — GM 전용 발주 완료 처리.
 *
 * 대기 발주 요청을 FULFILLED 로 닫고, 해당 편의점 품목의 당일 재고를 증가시킨다.
 */

import { NextResponse, after } from "next/server";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import { notifyShopReorderFulfilled } from "@/lib/discord";
import { findShopItemBySlug } from "@/lib/shop/catalog";
import { getTodayKst } from "@/lib/shop/refresh-stock";
import {
  findShopReorderRequestById,
  fulfillShopReorderRequestAndIncrementStock,
  ShopReorderRequestNotPendingError,
} from "@/lib/shop/reorder-requests";

interface FulfillRequestBody {
  requestId?: unknown;
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
    | FulfillRequestBody
    | null;
  const requestId =
    typeof body?.requestId === "string" ? body.requestId.trim() : "";

  if (!requestId) {
    return NextResponse.json({ error: "requestId 누락" }, { status: 400 });
  }

  const reorder = await findShopReorderRequestById(requestId);
  if (!reorder) {
    return NextResponse.json(
      { error: "발주 요청을 찾을 수 없습니다." },
      { status: 404 },
    );
  }
  if (reorder.status !== "REQUESTED") {
    return NextResponse.json(
      { error: "이미 처리된 발주 요청입니다.", code: "REORDER_ALREADY_FULFILLED" },
      { status: 409 },
    );
  }

  const item = findShopItemBySlug(reorder.slug);
  if (!item) {
    return NextResponse.json(
      { error: `편의점 카탈로그에 없는 발주 품목입니다: ${reorder.slug}` },
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
    const { request: fulfilled, stock } =
      await fulfillShopReorderRequestAndIncrementStock({
        requestId,
        quantity,
        fulfilledById: session.user.id,
        fulfilledByName: session.user.displayName,
        fulfilledAt,
        itemId: item.slug,
        today,
      });

    after(async () => {
      await notifyShopReorderFulfilled({
        today,
        item: {
          slug: item.slug,
          name: item.name,
          icon: item.icon,
          price: item.price,
          pageGroup: item.pageGroup,
        },
        request: {
          userName: fulfilled.userName,
          ...(fulfilled.characterCodename
            ? { characterCodename: fulfilled.characterCodename }
            : {}),
        },
        fulfilledBy: {
          displayName: session.user.displayName,
        },
        quantity,
        stock: stock.stock,
        fulfilledAt,
      });
    });

    return NextResponse.json({
      ok: true,
      status: "fulfilled",
      requestId,
      slug: item.slug,
      itemName: item.name,
      quantity,
      stock: stock.stock,
      lastRefresh: stock.lastRefresh,
      message: "발주 요청에 따라 추가 입고가 완료되었습니다.",
    });
  } catch (error) {
    if (error instanceof ShopReorderRequestNotPendingError) {
      return NextResponse.json(
        {
          error: "이미 처리된 발주 요청입니다.",
          code: "REORDER_ALREADY_FULFILLED",
        },
        { status: 409 },
      );
    }

    console.error("[shop reorder fulfill] stock update failed", {
      requestId,
      error: getErrorMessage(error),
    });
    return NextResponse.json(
      { error: "발주 완료 처리 중 재고 업데이트에 실패했습니다." },
      { status: 500 },
    );
  }
}
