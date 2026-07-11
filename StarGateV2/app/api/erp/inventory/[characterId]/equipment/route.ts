import { NextResponse } from "next/server";

import type { EquipmentSlot } from "@/types/inventory";

import { canViewPersonalInventory } from "@/lib/auth/access-policy";
import { getActiveSession } from "@/lib/auth/active-session";
import { findCharacterById } from "@/lib/db/characters";
import {
  equipCharacterInventoryItem,
  findMasterItemById,
  listCharacterInventoryEntries,
  normalizedInventoryCategory,
} from "@/lib/db/inventory";
import { isValidObjectId } from "@/lib/db/utils";

interface RouteContext {
  params: Promise<{ characterId: string }>;
}

interface EquipmentRequestBody {
  itemId?: unknown;
}

function equipmentSlotForCategory(
  category: string,
): EquipmentSlot | null {
  if (category === "WEAPON") return "WEAPON";
  if (category === "ARMOR") return "ARMOR";
  return null;
}

export async function PUT(request: Request, context: RouteContext) {
  const session = await getActiveSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { characterId } = await context.params;
  if (!isValidObjectId(characterId)) {
    return NextResponse.json(
      { error: "잘못된 캐릭터 ID 형식입니다." },
      { status: 400 },
    );
  }

  const character = await findCharacterById(characterId);
  if (
    !character ||
    character.type !== "AGENT" ||
    !canViewPersonalInventory(
      session.user.id,
      session.user.role,
      character,
    )
  ) {
    return NextResponse.json(
      { error: "캐릭터를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | EquipmentRequestBody
    | null;
  const itemId = typeof body?.itemId === "string" ? body.itemId.trim() : "";
  if (!itemId || !isValidObjectId(itemId)) {
    return NextResponse.json(
      { error: "올바른 itemId가 필요합니다.", code: "INVALID_ITEM_ID" },
      { status: 400 },
    );
  }

  const masterItem = await findMasterItemById(itemId);
  if (!masterItem) {
    return NextResponse.json(
      { error: "마스터 아이템을 찾을 수 없습니다.", code: "ITEM_NOT_FOUND" },
      { status: 404 },
    );
  }

  const slot = equipmentSlotForCategory(normalizedInventoryCategory(masterItem));
  if (!slot) {
    return NextResponse.json(
      {
        error: "무기 또는 방어구만 장착할 수 있습니다.",
        code: "ITEM_NOT_EQUIPPABLE",
      },
      { status: 400 },
    );
  }

  try {
    const result = await equipCharacterInventoryItem(
      characterId,
      itemId,
      slot,
    );
    if (!result.ok) {
      return NextResponse.json(
        {
          error: "보유 중인 장비만 장착할 수 있습니다.",
          code: "ITEM_NOT_OWNED",
        },
        { status: 409 },
      );
    }

    const { entries } = await listCharacterInventoryEntries(characterId);
    const equipped = Object.fromEntries(
      entries
        .filter((entry) => entry.equippedSlot)
        .map((entry) => [entry.equippedSlot, entry]),
    );

    return NextResponse.json({
      success: true,
      slot,
      previousItemId: result.previousItemId,
      equippedItem: entries.find((entry) => entry.itemId === itemId) ?? null,
      equipped,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "장비 교체 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
