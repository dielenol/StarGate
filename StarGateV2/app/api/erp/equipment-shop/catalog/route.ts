/**
 * GET /api/erp/equipment-shop/catalog — 병기부 카탈로그.
 *
 * master_items 의 병기부 장비 중 공개·판매 가능한 항목만 병기부 품목으로 변환한다.
 * 별도 재고 시스템은 두지 않고, 카탈로그 가격이 숫자로 확정된 항목만 구매 가능하다.
 */

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import {
  EQUIPMENT_SHOP_CATEGORIES,
  toEquipmentShopCatalogItem,
} from "@/lib/equipment-shop/catalog";
import { listMasterItemsByCategoryFilter } from "@/lib/db/inventory";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const isGM = hasRole(session.user.role, "GM");
  const requestedScope = new URL(request.url).searchParams.get("scope");
  if (requestedScope !== null && !["all", "towaski"].includes(requestedScope)) {
    return NextResponse.json(
      { error: "지원하지 않는 카탈로그 scope입니다." },
      { status: 400 },
    );
  }
  const scope = !isGM || requestedScope === "towaski" ? "towaski" : "all";

  try {
    const masterItems = await listMasterItemsByCategoryFilter(
      EQUIPMENT_SHOP_CATEGORIES,
    );
    const items = masterItems
      .map(toEquipmentShopCatalogItem)
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .filter((item) => scope === "all" || item.zone === "towaski");

    return NextResponse.json(
      {
        items,
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
    const message =
      err instanceof Error ? err.message : "장비 카탈로그 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
