/**
 * POST /api/erp/shop/reorder-request — 품절 상품 추가 발주 요청.
 *
 * 품절 상태인 편의점 상품에 대해 사용자/일자/상품 단위로 1회 요청을 기록한다.
 * 실제 재입고 처리는 운영자가 GM 재고 관리에서 수행한다.
 */

import { NextResponse, after } from "next/server";

import { auth } from "@/lib/auth/config";
import { findMainCharacterLiteByOwner as findMainCharacterByOwner } from "@/lib/db/characters";
import { listUsers } from "@/lib/db/users";
import { notifyShopReorderRequest } from "@/lib/discord";
import { getStock } from "@/lib/db/shop";
import { notifyUser, notifyUsers } from "@/lib/notifications/events";
import { findShopItemBySlug } from "@/lib/shop/catalog";
import { getTodayKst } from "@/lib/shop/refresh-stock";
import {
  buildShopReorderRequestId,
  insertShopReorderRequest,
  type ShopReorderRequestDoc,
} from "@/lib/shop/reorder-requests";

interface ReorderRequestBody {
  slug?: unknown;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function notifyShopReorderOperators(
  doc: ShopReorderRequestDoc,
): Promise<void> {
  try {
    const users = await listUsers();
    const gms = users.filter(
      (user) => user.status === "ACTIVE" && user.role === "GM",
    );

    await notifyUsers(
      gms.map((user) => ({
        userId: user._id,
        type: "SYSTEM",
        title: "편의점 발주 요청",
        message: [
          doc.characterCodename
            ? `${doc.characterCodename} · ${doc.itemName}`
            : doc.itemName,
          `${doc.userName} 요청`,
          "GM 재고 관리 확인 필요",
        ].join(" · "),
        link: "/erp/shop",
      })),
    );
  } catch (error) {
    console.warn("[shop reorder] operator notification failed", {
      requestId: doc._id,
      error: getErrorMessage(error),
    });
  }
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
    _id: buildShopReorderRequestId(today, session.user.id, slug),
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
    await insertShopReorderRequest(doc);
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

  await notifyUser({
    userId: session.user.id,
    type: "SYSTEM",
    title: "편의점 발주 요청이 접수되었습니다",
    message: [
      mainChar?.codename ? `${mainChar.codename} · ${item.name}` : item.name,
      "품절 상품 발주 요청",
      "운영자 확인 대기",
    ].join(" · "),
    link: "/erp/shop",
  });

  after(async () => {
    await notifyShopReorderOperators(doc);
    await notifyShopReorderRequest({
      today,
      item: {
        slug: item.slug,
        name: item.name,
        icon: item.icon,
        price: item.price,
        pageGroup: item.pageGroup,
      },
      requester: {
        id: session.user.id,
        displayName: session.user.displayName,
      },
      ...(doc.characterId && doc.characterCodename
        ? {
            character: {
              id: doc.characterId,
              codename: doc.characterCodename,
            },
          }
        : {}),
      requestedAt: doc.createdAt,
    });
  });

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
