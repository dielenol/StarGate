/**
 * POST /api/erp/shop/reorder-request — 품절 상품 추가 발주 요청.
 *
 * 품절 상태인 편의점 상품에 대해 사용자/일자/상품 단위로 1회 요청을 기록한다.
 * 실제 재입고 처리는 운영자가 GM 재고 관리에서 수행한다.
 */

import "@/lib/db/init";

import { getDb } from "@stargate/shared-db";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { findMainCharacterByOwner } from "@/lib/db/characters";
import { getStock } from "@/lib/db/shop";
import { findShopItemBySlug } from "@/lib/shop/catalog";
import { getTodayKst } from "@/lib/shop/refresh-stock";

interface ReorderRequestBody {
  slug?: unknown;
}

interface ShopReorderRequestDoc {
  _id: string;
  kind: "shop-reorder-request";
  date: string;
  slug: string;
  itemName: string;
  userId: string;
  userName: string;
  characterId?: string;
  characterCodename?: string;
  status: "REQUESTED";
  createdAt: Date;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

async function reorderRequestsCol() {
  const db = await getDb();
  return db.collection<ShopReorderRequestDoc>("shop_reorder_requests");
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | ReorderRequestBody
    | null;
  const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
  const item = findShopItemBySlug(slug);
  if (!slug || !item) {
    return NextResponse.json(
      { error: "편의점 카탈로그에 없는 아이템입니다." },
      { status: 400 },
    );
  }

  const stock = await getStock(slug);
  if ((stock?.stock ?? 0) > 0) {
    return NextResponse.json(
      {
        error: "아직 품절이 아닌 상품은 발주 요청할 수 없습니다.",
        code: "REORDER_NOT_AVAILABLE",
      },
      { status: 400 },
    );
  }

  let mainChar: Awaited<ReturnType<typeof findMainCharacterByOwner>> | null =
    null;
  try {
    mainChar = await findMainCharacterByOwner(session.user.id);
  } catch {
    mainChar = null;
  }

  const today = getTodayKst();
  const doc: ShopReorderRequestDoc = {
    _id: `shop-reorder:${today}:${session.user.id}:${slug}`,
    kind: "shop-reorder-request",
    date: today,
    slug,
    itemName: item.name,
    userId: session.user.id,
    userName: session.user.displayName,
    ...(mainChar?._id
      ? {
          characterId: String(mainChar._id),
          characterCodename: mainChar.codename,
        }
      : {}),
    status: "REQUESTED",
    createdAt: new Date(),
  };

  try {
    await (await reorderRequestsCol()).insertOne(doc);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return NextResponse.json(
        {
          ok: true,
          status: "already-requested",
          slug,
          message: "오늘 이미 발주 요청한 상품입니다.",
        },
        { status: 200 },
      );
    }
    throw error;
  }

  return NextResponse.json(
    {
      ok: true,
      status: "requested",
      slug,
      message: "발주 요청이 접수되었습니다.",
    },
    { status: 201 },
  );
}
