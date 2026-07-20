import { NextResponse } from "next/server";

import type {
  CreateInventoryInput,
  RemoveInventoryInput,
} from "@/types/inventory";

import { readIdempotencyKey } from "@/lib/api/idempotency";
import { canViewPersonalInventory } from "@/lib/auth/access-policy";
import { getActiveSession } from "@/lib/auth/active-session";
import { requireRole } from "@/lib/auth/rbac";
import { findCharacterById } from "@/lib/db/characters";
import {
  EconomicOperationConflictError,
  executeEconomicOperationResult,
} from "@/lib/db/execute-economic-operation";
import {
  addToInventory,
  findMasterItemById,
  listCharacterInventoryEntries,
  prepareCharacterInventoryItemLocks,
  removeFromInventory,
  serializeCharacterInventory,
} from "@/lib/db/inventory";
import { isValidObjectId } from "@/lib/db/utils";
import { notifyUser } from "@/lib/notifications/events";
import { scheduleGmAdminAudit } from "@/lib/notifications/gm-admin-audit";

const MAX_GRANT_QUANTITY = 999;
const MAX_REMOVE_QUANTITY = 999;

interface RemoveInventoryOperationBody {
  remaining?: number;
  itemName?: string;
  error?: string;
  code?: string;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ characterId: string }> },
) {
  const session = await getActiveSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { characterId } = await params;
  if (!isValidObjectId(characterId)) {
    return NextResponse.json({ error: "잘못된 ID 형식입니다." }, { status: 400 });
  }

  try {
    const character = await findCharacterById(characterId);
    if (
      !character ||
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

    const { inventory, entries } =
      await listCharacterInventoryEntries(characterId);
    const equipped = Object.fromEntries(
      entries
        .filter((entry) => entry.equippedSlot)
        .map((entry) => [entry.equippedSlot, entry]),
    );
    return NextResponse.json({
      inventory: serializeCharacterInventory(inventory),
      entries,
      equipped,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "인벤토리 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ characterId: string }> },
) {
  const session = await getActiveSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireRole(session.user.role, "V");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { characterId } = await params;
  if (!isValidObjectId(characterId)) {
    return NextResponse.json({ error: "잘못된 ID 형식입니다." }, { status: 400 });
  }

  const character = await findCharacterById(characterId);
  if (
    !character ||
    !canViewPersonalInventory(session.user.id, session.user.role, character)
  ) {
    return NextResponse.json(
      { error: "캐릭터를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  const body = (await request.json()) as Partial<CreateInventoryInput>;

  // itemId 형식 검증 — ObjectId 가 아니면 400. master_items _id 는 ObjectId.
  if (
    typeof body.itemId !== "string" ||
    !body.itemId.trim() ||
    !isValidObjectId(body.itemId)
  ) {
    return NextResponse.json(
      { error: "itemId가 올바른 ObjectId 형식이 아닙니다." },
      { status: 400 },
    );
  }

  if (
    typeof body.quantity !== "number" ||
    !Number.isSafeInteger(body.quantity) ||
    body.quantity < 1 ||
    body.quantity > MAX_GRANT_QUANTITY
  ) {
    return NextResponse.json(
      { error: `quantity는 1~${MAX_GRANT_QUANTITY} 사이의 정수여야 합니다.` },
      { status: 400 },
    );
  }

  // master 실재성 + 가용성 검증 — 클라이언트가 임의 itemId/itemName 으로 인벤토리를
  // 오염시키지 못하도록 서버에서 master 를 한 번 더 끌어와 기준값으로 사용한다.
  const masterItem = await findMasterItemById(body.itemId);
  if (!masterItem) {
    return NextResponse.json(
      { error: "마스터 아이템을 찾을 수 없습니다." },
      { status: 404 },
    );
  }
  if (masterItem.isAvailable === false) {
    return NextResponse.json(
      { error: "현재 지급 불가 상태인 아이템입니다." },
      { status: 400 },
    );
  }

  try {
    const entry = await addToInventory({
      characterId,
      characterCodename: character.codename,
      itemId: body.itemId,
      // itemName 은 클라이언트 입력 무시 — master 의 정식 명칭만 사용.
      itemName: masterItem.name,
      quantity: body.quantity,
      acquiredAt: new Date(),
      note: body.note ?? "",
    });

    scheduleGmAdminAudit({
      action: "캐릭터 아이템 지급",
      actor: {
        id: session.user.id,
        displayName: session.user.displayName,
        role: session.user.role,
      },
      summary: `${masterItem.name} x${body.quantity}`,
      target: character.codename,
      details: body.note ? [{ name: "메모", value: body.note }] : undefined,
      timestamp: new Date(),
    });

    if (character.ownerId) {
      await notifyUser({
        userId: character.ownerId,
        type: "SYSTEM",
        title: "아이템이 지급되었습니다",
        message: [
          `${character.codename} · ${masterItem.name} x${body.quantity}`,
          `지급자 ${session.user.displayName}`,
        ].join(" · "),
        link: `/erp/inventory/${characterId}`,
      }).catch((error) => {
        console.error("[inventory/grant] notification failed:", error);
      });
    }

    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "아이템 지급 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ characterId: string }> },
) {
  const session = await getActiveSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireRole(session.user.role, "GM");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const requestId = readIdempotencyKey(request);
  if (!requestId) {
    return NextResponse.json(
      {
        error: "유효한 Idempotency-Key 헤더가 필요합니다.",
        code: "INVALID_IDEMPOTENCY_KEY",
      },
      { status: 400 },
    );
  }

  const { characterId } = await params;
  if (!isValidObjectId(characterId)) {
    return NextResponse.json({ error: "잘못된 ID 형식입니다." }, { status: 400 });
  }

  const character = await findCharacterById(characterId);
  if (
    !character ||
    !canViewPersonalInventory(session.user.id, session.user.role, character)
  ) {
    return NextResponse.json(
      { error: "캐릭터를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  let body: Partial<RemoveInventoryInput>;
  try {
    body = (await request.json()) as Partial<RemoveInventoryInput>;
  } catch {
    return NextResponse.json(
      { error: "요청 본문이 올바른 JSON 형식이 아닙니다." },
      { status: 400 },
    );
  }

  if (
    typeof body.itemId !== "string" ||
    !body.itemId.trim() ||
    !isValidObjectId(body.itemId.trim())
  ) {
    return NextResponse.json(
      { error: "itemId가 올바른 ObjectId 형식이 아닙니다." },
      { status: 400 },
    );
  }
  const itemId = body.itemId.trim();

  if (
    typeof body.quantity !== "number" ||
    !Number.isSafeInteger(body.quantity) ||
    body.quantity < 1 ||
    body.quantity > MAX_REMOVE_QUANTITY
  ) {
    return NextResponse.json(
      { error: `quantity는 1~${MAX_REMOVE_QUANTITY} 사이의 정수여야 합니다.` },
      { status: 400 },
    );
  }
  const quantity = body.quantity;

  try {
    await prepareCharacterInventoryItemLocks(characterId, [itemId]);
    const operation =
      await executeEconomicOperationResult<RemoveInventoryOperationBody>({
        requestId,
        domain: "inventory-remove",
        actorId: session.user.id,
        payload: { characterId, itemId, quantity },
        run: async (dbSession) => {
          const { entries } =
            await listCharacterInventoryEntries(characterId);
          const targetEntry = entries.find((entry) => entry.itemId === itemId);
          if (!targetEntry) {
            return {
              status: 404,
              body: { error: "보유 중인 아이템을 찾을 수 없습니다." },
            };
          }
          if (targetEntry.equippedSlot) {
            return {
              status: 409,
              body: {
                error: "장착 중인 아이템은 제거할 수 없습니다.",
                code: "INVENTORY_REMOVE_CONFLICT",
              },
            };
          }

          const { ok, remaining } = await removeFromInventory(
            characterId,
            itemId,
            quantity,
            { session: dbSession },
          );
          if (!ok) {
            return {
              status: 409,
              body: {
                error: "보유 수량이 부족하거나 장착 중인 아이템입니다.",
                code: "INVENTORY_REMOVE_CONFLICT",
              },
            };
          }
          return {
            status: 200,
            body: { remaining, itemName: targetEntry.itemName },
          };
        },
      });

    const headers = operation.replayed
      ? { "X-Idempotency-Replayed": "true" }
      : undefined;
    if (
      operation.status !== 200 ||
      operation.body.remaining === undefined ||
      !operation.body.itemName
    ) {
      return NextResponse.json(operation.body, {
        status: operation.status,
        headers,
      });
    }

    if (!operation.replayed) {
      const remaining = operation.body.remaining;
      const itemName = operation.body.itemName;
      scheduleGmAdminAudit({
        action: "캐릭터 아이템 제거",
        actor: {
          id: session.user.id,
          displayName: session.user.displayName,
          role: session.user.role,
        },
        summary: `${itemName} x${quantity} · 잔여 ${remaining}`,
        target: character.codename,
        timestamp: new Date(),
      });

      if (character.ownerId) {
        await notifyUser({
          userId: character.ownerId,
          type: "SYSTEM",
          title: "아이템이 제거되었습니다",
          message: [
            `${character.codename} · ${itemName} x${quantity}`,
            `제거자 ${session.user.displayName}`,
            `잔여 ${remaining}`,
          ].join(" · "),
          link: `/erp/inventory/${characterId}`,
        }).catch((error) => {
          console.error("[inventory/remove] notification failed:", error);
        });
      }
    }

    return NextResponse.json(operation.body, {
      status: operation.status,
      headers,
    });
  } catch (error) {
    if (error instanceof EconomicOperationConflictError) {
      return NextResponse.json(
        {
          error:
            error.reason === "processing"
              ? "동일한 제거 요청이 처리 중입니다."
              : "동일 Idempotency-Key가 다른 요청에 사용되었습니다.",
          code: "DUPLICATE_REQUEST",
        },
        { status: 409 },
      );
    }
    console.error("[inventory/remove] failed:", error);
    return NextResponse.json(
      { error: "아이템 제거에 실패했습니다." },
      { status: 500 },
    );
  }
}
