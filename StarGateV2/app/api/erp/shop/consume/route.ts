/**
 * POST /api/erp/shop/consume — 보유 편의점 아이템 N개 소비 (인벤토리 차감만).
 *
 * - 본인 메인 캐릭의 보유 인벤토리에서 quantity 만큼 차감.
 * - quantity > 보유량 거절 (race-aware: removeFromInventory 가 false 반환 시 400).
 * - 일괄 비우기 금지 — 수량 입력 N개 차감만 (D7).
 * - 영업시간과 무관 (보유 아이템 사용은 24/7).
 *
 * 응답: { remaining: number } — 차감 후 잔여 quantity.
 */

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { findMainCharacterLiteByOwner as findMainCharacterByOwner } from "@/lib/db/characters";
import {
  findMasterItemBySlug,
  removeFromInventory,
} from "@/lib/db/inventory";
import { findShopItemBySlug } from "@/lib/shop/catalog";

/* ── 상수 ── */

const MIN_QUANTITY = 1;
const MAX_QUANTITY = 1000;

/* ── 타입 ── */

interface ConsumeBody {
  slug?: string;
  quantity?: number;
}

/* ── 핸들러 ── */

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as ConsumeBody | null;
  if (!body) {
    return NextResponse.json(
      { error: "요청 본문이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const slug = body.slug?.trim();
  const quantity = body.quantity;

  if (!slug) {
    return NextResponse.json(
      { error: "slug는 필수입니다." },
      { status: 400 },
    );
  }
  if (!findShopItemBySlug(slug)) {
    return NextResponse.json(
      { error: "편의점 카탈로그에 없는 아이템입니다." },
      { status: 400 },
    );
  }

  if (
    typeof quantity !== "number" ||
    !Number.isInteger(quantity) ||
    quantity < MIN_QUANTITY ||
    quantity > MAX_QUANTITY
  ) {
    return NextResponse.json(
      {
        error: `quantity는 ${MIN_QUANTITY}~${MAX_QUANTITY} 사이의 정수여야 합니다.`,
      },
      { status: 400 },
    );
  }

  // 메인 캐릭터 가드.
  let mainChar;
  try {
    mainChar = await findMainCharacterByOwner(session.user.id);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "메인 캐릭터 조회 실패 (정합성 위반)";
    return NextResponse.json(
      { error: message, code: "MAIN_CHARACTER_INTEGRITY" },
      { status: 409 },
    );
  }
  if (!mainChar) {
    return NextResponse.json(
      {
        error: "메인 AGENT 캐릭터가 등록되어 있지 않아 사용할 수 없습니다.",
        code: "NO_MAIN_CHARACTER",
      },
      { status: 400 },
    );
  }

  // master_items lookup — slug → _id (character_inventory.itemId 가 ObjectId hex).
  const masterItem = await findMasterItemBySlug(slug);
  if (!masterItem || !masterItem._id) {
    return NextResponse.json(
      {
        error:
          "마스터 아이템 시드가 없습니다 (운영자에게 seed:shop 실행을 요청하세요).",
      },
      { status: 500 },
    );
  }
  const itemId = String(masterItem._id);

  // 차감 — atomic + remaining 동시 반환 (race window 차단).
  // removeFromInventory 가 보유 부족 시 ok:false → INSUFFICIENT_QUANTITY 로 매핑.
  const characterId = String(mainChar._id);
  const { ok, remaining } = await removeFromInventory(
    characterId,
    itemId,
    quantity,
  );
  if (!ok) {
    return NextResponse.json(
      {
        error: "보유한 수량이 부족합니다.",
        code: "INSUFFICIENT_QUANTITY",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ remaining });
}
