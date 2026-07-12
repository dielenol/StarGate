import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { findMainCharacterByOwner } from "@/lib/db/characters";
import { findMasterItemsBySlugsOrIds } from "@/lib/db/inventory";
import {
  ARMOR_REFERRAL_COOKIE_NAME,
  ARMOR_REFERRAL_DISCOUNT_PERCENT,
  ARMOR_REFERRAL_TTL_MS,
  issueArmorReferralToken,
} from "@/lib/equipment-shop/armor-referral";
import { toEquipmentShopCatalogItem } from "@/lib/equipment-shop/catalog";

interface ArmorReferralBody {
  key?: unknown;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "방어구 열람 기록 서명을 사용할 수 없습니다." },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | ArmorReferralBody
    | null;
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  if (!key) {
    return NextResponse.json(
      { error: "열람할 방어구 key가 필요합니다." },
      { status: 400 },
    );
  }

  const mainCharacter = await findMainCharacterByOwner(session.user.id);
  if (!mainCharacter?._id || mainCharacter.type !== "AGENT") {
    return NextResponse.json(
      { error: "메인 AGENT 캐릭터가 필요합니다.", code: "NO_MAIN_CHARACTER" },
      { status: 400 },
    );
  }

  const candidates = await findMasterItemsBySlugsOrIds([key]);
  const masterItem =
    candidates.find((item) => item.slug === key) ??
    candidates.find((item) => String(item._id) === key) ??
    null;
  const catalogItem = masterItem
    ? toEquipmentShopCatalogItem(masterItem)
    : null;
  if (
    !catalogItem ||
    catalogItem.zone !== "towaski" ||
    catalogItem.category !== "ARMOR"
  ) {
    return NextResponse.json(
      { error: "토와스키 방어구 품목을 찾을 수 없습니다." },
      { status: 400 },
    );
  }

  const characterId = String(mainCharacter._id);
  const referral = issueArmorReferralToken({
    itemKey: catalogItem.key,
    existingToken: request.cookies.get(ARMOR_REFERRAL_COOKIE_NAME)?.value,
    userId: session.user.id,
    characterId,
    secret,
  });
  const response = NextResponse.json({
    key: catalogItem.key,
    discountPercent: ARMOR_REFERRAL_DISCOUNT_PERCENT,
    expiresAt: new Date(referral.expiresAt).toISOString(),
  });
  response.cookies.set({
    name: ARMOR_REFERRAL_COOKIE_NAME,
    value: referral.token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(ARMOR_REFERRAL_TTL_MS / 1000),
  });
  return response;
}
