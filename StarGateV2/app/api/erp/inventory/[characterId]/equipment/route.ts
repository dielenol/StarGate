import { NextResponse } from "next/server";
import {
  charactersCol,
  getClient,
  prepareCharacterInventoryItemLocks,
  usersCol,
} from "@stargate/shared-db";
import { ObjectId } from "mongodb";

import type { EquipmentSlot } from "@/types/inventory";

import { canManageCharacterEquipment } from "@/lib/auth/access-policy";
import { getActiveSession } from "@/lib/auth/active-session";
import { findCharacterById } from "@/lib/db/characters";
import {
  equipCharacterInventoryItem,
  findMasterItemById,
  listCharacterInventoryEntries,
  normalizedInventoryCategory,
} from "@/lib/db/inventory";
import { isValidObjectId } from "@/lib/db/utils";
import { scheduleGmAdminAudit } from "@/lib/notifications/gm-admin-audit";

interface RouteContext {
  params: Promise<{ characterId: string }>;
}

interface EquipmentRequestBody {
  itemId?: unknown;
}

class EquipmentAccessChangedError extends Error {
  constructor() {
    super("장비 교체 권한 또는 캐릭터 소유권이 변경되었습니다.");
    this.name = "EquipmentAccessChangedError";
  }
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
    !canManageCharacterEquipment(
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
    await prepareCharacterInventoryItemLocks(characterId, [
      `@equipment-slot:${slot}`,
    ]);
    const client = await getClient();
    const mongoSession = client.startSession();
    let result;
    let characterCodename = character.codename;
    try {
      result = await mongoSession.withTransaction(async () => {
        if (!ObjectId.isValid(session.user.id)) {
          throw new EquipmentAccessChangedError();
        }
        const [transactionCharacter, transactionViewer] = await Promise.all([
          (await charactersCol()).findOne(
            { _id: new ObjectId(characterId) },
            { session: mongoSession },
          ),
          (await usersCol()).findOne(
            {
              _id: new ObjectId(session.user.id),
              status: "ACTIVE",
            },
            { session: mongoSession, projection: { role: 1 } },
          ),
        ]);
        if (
          !transactionCharacter ||
          !transactionViewer ||
          !canManageCharacterEquipment(
            session.user.id,
            transactionViewer.role,
            transactionCharacter,
          )
        ) {
          throw new EquipmentAccessChangedError();
        }
        characterCodename = transactionCharacter.codename;
        return equipCharacterInventoryItem(characterId, itemId, slot, {
          session: mongoSession,
        });
      });
    } finally {
      await mongoSession.endSession();
    }
    if (!result) {
      throw new Error("장비 교체 트랜잭션 결과가 없습니다.");
    }
    if (!result.ok) {
      return NextResponse.json(
        {
          error: "보유 중인 장비만 장착할 수 있습니다.",
          code: "ITEM_NOT_OWNED",
        },
        { status: 409 },
      );
    }

    scheduleGmAdminAudit({
      action: "캐릭터 장비 교체",
      actor: {
        id: session.user.id,
        displayName: session.user.displayName,
        role: session.user.role,
      },
      summary: `${slot} 슬롯에 ${masterItem.name} 장착`,
      target: `${characterCodename} (${characterId})`,
      details: [
        {
          name: "이전 아이템 ID",
          value: result.previousItemId ?? "없음",
        },
        { name: "신규 아이템 ID", value: itemId },
      ],
      timestamp: new Date(),
    });

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
    if (error instanceof EquipmentAccessChangedError) {
      return NextResponse.json(
        { error: error.message, code: "EQUIPMENT_ACCESS_CHANGED" },
        { status: 403 },
      );
    }
    const message = error instanceof Error ? error.message : "장비 교체 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
