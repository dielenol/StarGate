/**
 * GET /api/erp/equipment-shop/catalog — 병기부 카탈로그.
 *
 * master_items 의 병기부 장비 중 공개·판매 가능한 항목만 병기부 품목으로 변환한다.
 * 별도 재고 시스템은 두지 않고, 카탈로그 가격이 숫자로 확정된 항목만 구매 가능하다.
 */

import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { findMainCharacterByOwner } from "@/lib/db/characters";
import { listRecentEquipmentShopActivity } from "@/lib/db/equipment-shop-activity";
import { listOwnedTowaskiLicenseSlugs } from "@/lib/db/equipment-licenses";
import { listMasterItemsByCategoryFilter } from "@/lib/db/inventory";
import {
  applyAcheronArmorReferrals,
  ARMOR_REFERRAL_COOKIE_NAME,
} from "@/lib/equipment-shop/armor-referral";
import {
  applyEquipmentShopLicenseContext,
  EQUIPMENT_SHOP_CATEGORIES,
  expandEquipmentShopCatalogZones,
  toEquipmentShopCatalogItem,
} from "@/lib/equipment-shop/catalog";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const isGM = hasRole(session.user.role, "GM");
  const requestedScope = new URL(request.url).searchParams.get("scope");
  if (
    requestedScope !== null &&
    !["all", "towaski", "acheron", "strategic"].includes(requestedScope)
  ) {
    return NextResponse.json(
      { error: "지원하지 않는 카탈로그 scope입니다." },
      { status: 400 },
    );
  }
  const scope =
    requestedScope === "acheron" || requestedScope === "strategic"
      ? requestedScope
      : !isGM || requestedScope === "towaski"
        ? "towaski"
        : "all";

  try {
    const mainCharacter = await findMainCharacterByOwner(session.user.id);
    const mainAgent = mainCharacter?.type === "AGENT" ? mainCharacter : null;
    const [masterItems, ownedLicenseSlugs, recentActivity] = await Promise.all([
      listMasterItemsByCategoryFilter(EQUIPMENT_SHOP_CATEGORIES),
      mainAgent?._id
        ? listOwnedTowaskiLicenseSlugs(String(mainAgent._id))
        : Promise.resolve(new Set<string>()),
      mainAgent?._id
        ? listRecentEquipmentShopActivity(String(mainAgent._id)).catch(() => [])
        : Promise.resolve([]),
    ]);
    const catalogItems = expandEquipmentShopCatalogZones(
      masterItems
        .map(toEquipmentShopCatalogItem)
        .filter((item): item is NonNullable<typeof item> => item !== null),
    );
    const scopedItems = catalogItems.filter(
      (item) => scope === "all" || item.zone === scope,
    );
    const licensedItems = applyEquipmentShopLicenseContext(scopedItems, {
      character: mainAgent,
      ownedLicenseSlugs,
    });
    const secret = process.env.AUTH_SECRET;
    const characterId = mainAgent?._id ? String(mainAgent._id) : null;
    const items =
      secret && characterId
        ? applyAcheronArmorReferrals(licensedItems, {
            token: request.cookies.get(ARMOR_REFERRAL_COOKIE_NAME)?.value,
            userId: session.user.id,
            characterId,
            secret,
          })
        : licensedItems;

    return NextResponse.json(
      {
        items,
        recentActivity,
        isOpen: true,
        mode: "open",
        scheduledOpen: true,
        forceOpen: true,
        forceClosed: false,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (err) {
    console.error("[equipment-shop/catalog] failed to build catalog", err);
    return NextResponse.json(
      { error: "장비 카탈로그를 불러올 수 없습니다." },
      { status: 500 },
    );
  }
}
