/**
 * GET /api/erp/shop/inventory — 본인 메인 캐릭의 편의점 카탈로그 보유 인벤토리.
 *
 * - character_inventory.itemId 는 master_items._id (ObjectId hex) 형식.
 *   slug 로 lookup 하려면 master_items 의 _id ↔ slug 매핑이 필요.
 * - runtime 편의점 catalog 의 slug 만 응답에 포함 (그 외 장비/소지품은 별도 페이지가 처리).
 *
 * 응답:
 * - items: { itemId(=master._id), slug, name, quantity, acquiredAt(ISO), icon, effect }
 * - hasMainCharacter: 메인 캐릭터 보유 여부.
 *
 * 메인 미등록 시 200 + 빈 items + hasMainCharacter:false (구매 페이지가 안내).
 * 1인 1 MAIN 정합성 위반 시 409 (credits 라우트와 일관).
 */

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { getOwnedDataViewerId } from "@/lib/auth/guest";
import { findMainCharacterLiteByOwner as findMainCharacterByOwner } from "@/lib/db/characters";
import {
  findMasterItemsBySlugs,
  listCharacterInventory,
} from "@/lib/db/inventory";
import { loadRuntimeShopCatalog } from "@/lib/shop/runtime-catalog";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ownerId = getOwnedDataViewerId(session.user);
  if (ownerId === null) {
    return NextResponse.json(
      { items: [], hasMainCharacter: false },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  let mainChar;
  try {
    mainChar = await findMainCharacterByOwner(ownerId);
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
      { items: [], hasMainCharacter: false },
      {
        headers: {
          "Cache-Control": "private, max-age=300, stale-while-revalidate=600",
        },
      },
    );
  }

  try {
    const catalog = await loadRuntimeShopCatalog();
    const catalogBySlug = new Map(catalog.map((item) => [item.slug, item]));
    // runtime catalog slug → master._id 매핑 (한 번에 $in 조회).
    const catalogSlugs = catalog.map((item) => item.slug);
    const masterDocs = await findMasterItemsBySlugs(catalogSlugs);

    // master._id(string) → slug
    const idToSlug = new Map<string, string>();
    for (const doc of masterDocs) {
      if (doc.slug && doc._id) idToSlug.set(String(doc._id), doc.slug);
    }

    const inventory = await listCharacterInventory(String(mainChar._id));
    const items = [];
    for (const row of inventory) {
      const slug = idToSlug.get(row.itemId);
      if (!slug) continue; // 편의점 카탈로그 외 아이템은 본 응답 대상 X
      const meta = catalogBySlug.get(slug);
      if (!meta) continue;
      items.push({
        itemId: row.itemId,
        slug,
        name: meta.name,
        quantity: row.quantity,
        acquiredAt: row.acquiredAt.toISOString(),
        icon: meta.icon,
        effect: meta.effect,
        ...(meta.previewImage ? { previewImage: meta.previewImage } : {}),
      });
    }

    return NextResponse.json(
      { items, hasMainCharacter: true },
      {
        headers: {
          "Cache-Control": "private, max-age=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "보유 인벤토리 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
