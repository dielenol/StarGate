import "server-only";

import {
  addToInventory,
  addCredit,
  characterInventoryCol,
  charactersCol,
  equipCharacterInventoryItem,
  lockCharacterInventoryItems,
  masterItemsCol,
  prepareCharacterInventoryItemLocks,
  usersCol,
  type EquipmentChargeState,
  type MasterItem,
} from "@stargate/shared-db";
import { ObjectId, type ClientSession } from "mongodb";

import {
  findEquipmentWorkshopRequestById,
  transitionEquipmentWorkshopRequest,
  type EquipmentWorkshopRequestDoc,
} from "@/lib/db/equipment-workshop-requests";
import { childIdempotencyKey } from "@/lib/api/idempotency";

const slotLockId = (slot: string) => `@equipment-slot:${slot}`;

export class WorkshopOperationError extends Error {
  constructor(
    readonly code:
      | "REQUEST_NOT_FOUND"
      | "FORBIDDEN"
      | "INVALID_STATE"
      | "QUOTE_CHANGED"
      | "TARGET_CHANGED"
      | "MATERIAL_SHORTAGE"
      | "NOT_READY",
    message: string,
  ) {
    super(message);
    this.name = "WorkshopOperationError";
  }
}

function requireBuildRequest(
  request: EquipmentWorkshopRequestDoc | null,
): asserts request is EquipmentWorkshopRequestDoc & {
  quote: NonNullable<EquipmentWorkshopRequestDoc["quote"]>;
} {
  if (!request) throw new WorkshopOperationError("REQUEST_NOT_FOUND", "공방 요청을 찾을 수 없습니다.");
  if (!request.quote || (request.kind !== "upgrade" && request.kind !== "custom")) {
    throw new WorkshopOperationError("INVALID_STATE", "제작 견적 정보가 완전하지 않습니다.");
  }
  if (
    request.kind === "upgrade" &&
    (!request.sourceItemId ||
      !request.sourceSlot ||
      !request.inventoryEntryId ||
      request.quote.result.category !== request.sourceSlot)
  ) {
    throw new WorkshopOperationError("INVALID_STATE", "강화 견적 정보가 완전하지 않습니다.");
  }
}

function requireUpgradeSource(
  request: EquipmentWorkshopRequestDoc,
): asserts request is EquipmentWorkshopRequestDoc & {
  sourceItemId: string;
  sourceSlot: "WEAPON" | "ARMOR";
  inventoryEntryId: string;
} {
  if (
    request.kind !== "upgrade" ||
    !request.sourceItemId ||
    !request.sourceSlot ||
    !request.inventoryEntryId
  ) {
    throw new WorkshopOperationError("INVALID_STATE", "강화 원본 장비 정보가 완전하지 않습니다.");
  }
}

function requireReloadRequest(
  request: EquipmentWorkshopRequestDoc | null,
): asserts request is EquipmentWorkshopRequestDoc & {
  kind: "reload";
  reload: NonNullable<EquipmentWorkshopRequestDoc["reload"]>;
  sourceItemId: string;
  sourceSlot: "WEAPON" | "ARMOR";
  inventoryEntryId: string;
} {
  if (!request) throw new WorkshopOperationError("REQUEST_NOT_FOUND", "공방 요청을 찾을 수 없습니다.");
  if (
    request.kind !== "reload" ||
    !request.reload ||
    !request.sourceItemId ||
    !request.sourceSlot ||
    !request.inventoryEntryId
  ) {
    throw new WorkshopOperationError("INVALID_STATE", "재장전 요청 정보가 완전하지 않습니다.");
  }
}

async function requireWorkshopCharacterOwnership(
  characterId: string,
  userId: string,
  session: ClientSession,
): Promise<void> {
  if (!ObjectId.isValid(characterId) || !ObjectId.isValid(userId)) {
    throw new WorkshopOperationError(
      "FORBIDDEN",
      "요청 캐릭터 소유권을 확인할 수 없습니다.",
    );
  }

  const character = await (await charactersCol()).findOne(
    {
      _id: new ObjectId(characterId),
      ownerId: userId,
      type: { $in: ["AGENT", "NPC"] },
    },
    { session, projection: { type: 1 } },
  );
  if (!character) {
    throw new WorkshopOperationError(
      "FORBIDDEN",
      "요청 캐릭터 소유권을 확인할 수 없습니다.",
    );
  }
  if (character.type === "AGENT") return;

  const owner = await (await usersCol()).findOne(
    {
      _id: new ObjectId(userId),
      role: "GM",
      status: "ACTIVE",
    },
    { session, projection: { _id: 1 } },
  );
  if (!owner) {
    throw new WorkshopOperationError(
      "FORBIDDEN",
      "GM 소유 NPC만 공방 장비를 처리할 수 있습니다.",
    );
  }
}

export async function prepareWorkshopOperationLocks(
  request: EquipmentWorkshopRequestDoc,
): Promise<void> {
  requireBuildRequest(request);
  await prepareCharacterInventoryItemLocks(request.characterId, [
    ...(request.sourceItemId ? [request.sourceItemId] : []),
    request.quote.result.itemId,
    slotLockId(request.quote.result.category),
    ...request.quote.materials.map((material) => material.itemId),
  ]);
}

export async function prepareWorkshopReloadLocks(
  request: EquipmentWorkshopRequestDoc,
): Promise<void> {
  requireReloadRequest(request);
  await prepareCharacterInventoryItemLocks(request.characterId, [
    request.sourceItemId,
    slotLockId(request.sourceSlot),
  ]);
}

async function escrowEquippedSource(
  request: EquipmentWorkshopRequestDoc & {
    sourceItemId: string;
    sourceSlot: "WEAPON" | "ARMOR";
    inventoryEntryId: string;
  },
  session: ClientSession,
): Promise<{
  sourceEquipmentCharge?: EquipmentChargeState;
  sourceNote?: string;
}> {
  const inventory = await characterInventoryCol();
  if (!ObjectId.isValid(request.inventoryEntryId)) {
    throw new WorkshopOperationError("TARGET_CHANGED", "강화 대상 인벤토리 항목이 올바르지 않습니다.");
  }
  const filter = {
    _id: new ObjectId(request.inventoryEntryId),
    characterId: request.characterId,
    itemId: request.sourceItemId,
    equippedSlot: request.sourceSlot,
    quantity: { $gte: 1 },
  } as const;
  const source = await inventory.findOne(filter, { session });
  if (!source) throw new WorkshopOperationError("TARGET_CHANGED", "견적 대상 장비가 더 이상 해당 슬롯에 장착되어 있지 않습니다.");
  const snapshot = {
    ...(source.equipmentCharge
      ? { sourceEquipmentCharge: source.equipmentCharge }
      : {}),
    ...(source.note ? { sourceNote: source.note } : {}),
  };
  if (source.quantity === 1) {
    const deleted = await inventory.deleteOne(filter, { session });
    if (deleted.deletedCount !== 1) throw new WorkshopOperationError("TARGET_CHANGED", "강화 대상 장비 상태가 변경되었습니다.");
    return snapshot;
  }
  const updated = await inventory.updateOne(
    filter,
    { $inc: { quantity: -1 }, $unset: { equippedSlot: "", equippedAt: "" } },
    { session },
  );
  if (updated.modifiedCount !== 1) throw new WorkshopOperationError("TARGET_CHANGED", "강화 대상 장비 상태가 변경되었습니다.");
  return snapshot;
}

async function consumeMaterials(
  request: EquipmentWorkshopRequestDoc & {
    quote: NonNullable<EquipmentWorkshopRequestDoc["quote"]>;
  },
  session: ClientSession,
): Promise<void> {
  const inventory = await characterInventoryCol();
  for (const material of request.quote.materials) {
    const entries = await inventory.find(
      {
        characterId: request.characterId,
        itemId: material.itemId,
        quantity: { $gte: 1 },
        equippedSlot: { $exists: false },
      },
      { session, sort: { _id: 1 } },
    ).toArray();
    if (entries.reduce((total, entry) => total + entry.quantity, 0) < material.quantity) {
      throw new WorkshopOperationError("MATERIAL_SHORTAGE", `${material.itemName} 재료가 부족하거나 장착 중입니다.`);
    }
    let remaining = material.quantity;
    for (const entry of entries) {
      if (remaining === 0) break;
      const consumed = Math.min(entry.quantity, remaining);
      if (consumed === entry.quantity) {
        const deleted = await inventory.deleteOne(
          { _id: entry._id, characterId: request.characterId, quantity: entry.quantity },
          { session },
        );
        if (deleted.deletedCount !== 1) throw new WorkshopOperationError("MATERIAL_SHORTAGE", `${material.itemName} 재료 상태가 변경되었습니다.`);
      } else {
        const updated = await inventory.updateOne(
          { _id: entry._id, characterId: request.characterId, quantity: entry.quantity },
          { $inc: { quantity: -consumed } },
          { session },
        );
        if (updated.modifiedCount !== 1) throw new WorkshopOperationError("MATERIAL_SHORTAGE", `${material.itemName} 재료 상태가 변경되었습니다.`);
      }
      remaining -= consumed;
    }
  }
}

export async function acceptWorkshopQuoteInTransaction(input: {
  requestId: string;
  expectedQuoteVersion: number;
  actorId: string;
  actorName: string;
  session: ClientSession;
}): Promise<EquipmentWorkshopRequestDoc> {
  const request = await findEquipmentWorkshopRequestById(input.requestId, { session: input.session });
  requireBuildRequest(request);
  if (request.userId !== input.actorId) throw new WorkshopOperationError("FORBIDDEN", "본인의 공방 요청만 수락할 수 있습니다.");
  if (request.status !== "QUOTED") throw new WorkshopOperationError("INVALID_STATE", "수락 가능한 견적 상태가 아닙니다.");
  if (request.quote.version !== input.expectedQuoteVersion) throw new WorkshopOperationError("QUOTE_CHANGED", "견적이 변경되었습니다. 내용을 다시 확인해 주세요.");

  await lockCharacterInventoryItems(
    request.characterId,
    [
      ...(request.sourceItemId ? [request.sourceItemId] : []),
      request.quote.result.itemId,
      slotLockId(request.quote.result.category),
      ...request.quote.materials.map((item) => item.itemId),
    ],
    input.session,
  );
  await requireWorkshopCharacterOwnership(
    request.characterId,
    request.userId,
    input.session,
  );
  let sourceSnapshot: {
    sourceEquipmentCharge?: EquipmentChargeState;
    sourceNote?: string;
  } = {};
  if (request.kind === "upgrade") {
    requireUpgradeSource(request);
    const sourceMaster = await (await masterItemsCol()).findOne(
      { _id: new ObjectId(request.sourceItemId) },
      { session: input.session, projection: { category: 1 } },
    );
    if (!sourceMaster || sourceMaster.category !== request.sourceSlot) {
      throw new WorkshopOperationError("TARGET_CHANGED", "원본 장비 분류가 견적 발행 이후 변경되었습니다.");
    }
    sourceSnapshot = await escrowEquippedSource(request, input.session);
  }
  await consumeMaterials(request, input.session);
  if (request.quote.creditCost > 0) {
    await addCredit({
      characterId: request.characterId,
      characterCodename: request.characterCodename,
      ownerId: request.userId,
      ownerName: request.userName,
      amount: -request.quote.creditCost,
      type: "PURCHASE",
      description: `공방 ${request.kind === "upgrade" ? "장비 강화" : "신규 제작"} — ${request.equipmentName ?? request.quote.result.name}`,
      metadata: { source: "equipment_workshop", workshopRequestId: request._id },
      createdById: input.actorId,
      createdByName: input.actorName,
      requestId: childIdempotencyKey(input.requestId, "credit"),
      session: input.session,
    });
  }
  const startedAt = new Date();
  const readyAt = new Date(startedAt.getTime() + request.quote.durationMinutes * 60_000);
  const updated = await transitionEquipmentWorkshopRequest({
    requestId: request._id,
    currentStatus: "QUOTED",
    status: "IN_PROGRESS",
    actorId: input.actorId,
    actorName: input.actorName,
    set: {
      startedAt,
      readyAt,
      escrow: {
        ...(request.kind === "upgrade"
          ? {
              sourceItemId: request.sourceItemId,
              sourceItemName: request.equipmentName ?? "장비",
              sourceSlot: request.sourceSlot,
            }
          : {}),
        materials: request.quote.materials,
        creditCost: request.quote.creditCost,
        ...sourceSnapshot,
      },
    },
    session: input.session,
  });
  if (!updated) throw new WorkshopOperationError("INVALID_STATE", "다른 요청이 먼저 견적 상태를 변경했습니다.");
  return updated;
}

async function restoreInventory(
  request: EquipmentWorkshopRequestDoc & {
    quote: NonNullable<EquipmentWorkshopRequestDoc["quote"]>;
    escrow: NonNullable<EquipmentWorkshopRequestDoc["escrow"]>;
  },
  session: ClientSession,
): Promise<void> {
  const inventory = await characterInventoryCol();
  if (
    request.escrow.sourceItemId &&
    request.escrow.sourceItemName &&
    request.escrow.sourceSlot
  ) {
    if (request.escrow.sourceEquipmentCharge) {
      const reacquiredSource = await inventory.findOne(
        {
          characterId: request.characterId,
          itemId: request.escrow.sourceItemId,
          quantity: { $gte: 1 },
        },
        { session, projection: { _id: 1 } },
      );
      if (reacquiredSource) {
        throw new WorkshopOperationError(
          "TARGET_CHANGED",
          "충전 상태가 있는 동종 장비를 제작 중 다시 획득해 원본을 안전하게 복구할 수 없습니다.",
        );
      }
    }
    await addToInventory(
      {
        characterId: request.characterId,
        characterCodename: request.characterCodename,
        itemId: request.escrow.sourceItemId,
        itemName: request.escrow.sourceItemName,
        quantity: 1,
        acquiredAt: new Date(),
        note: request.escrow.sourceNote ?? `공방 취소 반환 · ${request._id}`,
        ...(request.escrow.sourceEquipmentCharge
          ? { equipmentCharge: request.escrow.sourceEquipmentCharge }
          : {}),
      },
      { session },
    );
  }
  for (const material of request.escrow.materials) {
    await addToInventory(
      {
        characterId: request.characterId,
        characterCodename: request.characterCodename,
        itemId: material.itemId,
        itemName: material.itemName,
        quantity: material.quantity,
        acquiredAt: new Date(),
        note: `공방 취소 재료 반환 · ${request._id}`,
      },
      { session },
    );
  }
  if (
    request.escrow.sourceItemId &&
    request.escrow.sourceSlot
  ) {
    const occupied = await inventory.findOne(
      { characterId: request.characterId, equippedSlot: request.escrow.sourceSlot },
      { session, projection: { _id: 1 } },
    );
    if (!occupied) {
      await equipCharacterInventoryItem(
        request.characterId,
        request.escrow.sourceItemId,
        request.escrow.sourceSlot,
        { session },
      );
    }
  }
}

export async function cancelWorkshopInTransaction(input: {
  requestId: string;
  actorId: string;
  actorName: string;
  note: string;
  session: ClientSession;
}): Promise<EquipmentWorkshopRequestDoc> {
  const request = await findEquipmentWorkshopRequestById(input.requestId, { session: input.session });
  requireBuildRequest(request);
  if (request.status !== "IN_PROGRESS" || !request.escrow) throw new WorkshopOperationError("INVALID_STATE", "취소 가능한 제작 상태가 아닙니다.");
  await restoreInventory(request as typeof request & { escrow: NonNullable<typeof request.escrow> }, input.session);
  if (request.escrow.creditCost > 0) {
    await addCredit({
      characterId: request.characterId,
      characterCodename: request.characterCodename,
      ownerId: request.userId,
      ownerName: request.userName,
      amount: request.escrow.creditCost,
      type: "ADMIN_GRANT",
      description: `공방 ${request.kind === "upgrade" ? "강화" : "제작"} 취소 환불 — ${request.equipmentName ?? request.quote.result.name}`,
      metadata: { source: "equipment_workshop_refund", workshopRequestId: request._id },
      createdById: input.actorId,
      createdByName: input.actorName,
      requestId: childIdempotencyKey(input.requestId, "refund"),
      allowNegative: true,
      session: input.session,
    });
  }
  const updated = await transitionEquipmentWorkshopRequest({
    requestId: request._id,
    currentStatus: "IN_PROGRESS",
    status: "CANCELLED",
    actorId: input.actorId,
    actorName: input.actorName,
    note: input.note,
    session: input.session,
  });
  if (!updated) throw new WorkshopOperationError("INVALID_STATE", "다른 요청이 먼저 제작 상태를 변경했습니다.");
  return updated;
}

async function ensureResultMasterItem(
  request: EquipmentWorkshopRequestDoc & {
    quote: NonNullable<EquipmentWorkshopRequestDoc["quote"]>;
  },
  session: ClientSession,
): Promise<MasterItem> {
  const items = await masterItemsCol();
  const resultId = new ObjectId(request.quote.result.itemId);
  const now = new Date();
  const doc: MasterItem = {
    _id: resultId,
    slug: request.quote.result.slug,
    name: request.quote.result.name,
    category: request.quote.result.category,
    description: request.quote.result.description,
    price: 0,
    ...(request.quote.result.damage ? { damage: request.quote.result.damage } : {}),
    ...(request.quote.result.effect ? { effect: request.quote.result.effect } : {}),
    tags: request.quote.result.tags,
    ...(request.quote.result.previewImage ? { previewImage: request.quote.result.previewImage } : {}),
    ...(request.quote.result.equipmentAction
      ? { equipmentAction: request.quote.result.equipmentAction }
      : {}),
    isAvailable: false,
    isPublic: false,
    source: "manual",
    workshop: {
      requestId: request._id,
      ownerId: request.userId,
      ...(request.sourceItemId ? { sourceItemId: request.sourceItemId } : {}),
      ...(request.sourceItemId
        ? { sourceItemName: request.equipmentName ?? "장비" }
        : {}),
      characterId: request.characterId,
      characterCodename: request.characterCodename,
      specialistCodename: request.quote.specialistCodename,
      ...(request.quote.specialistWorkflow
        ? { specialistWorkflow: request.quote.specialistWorkflow }
        : {}),
      ...(request.quote.blueprintRef
        ? { blueprintRef: request.quote.blueprintRef }
        : {}),
      generation: request.quote.result.generation,
      lifecycle: "operational",
      balanceStatus: "approved",
    },
    createdAt: now,
    updatedAt: now,
  };
  try {
    await items.insertOne(doc, { session });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === 11000
    ) {
      throw new WorkshopOperationError(
        "TARGET_CHANGED",
        "결과 장비 식별자 또는 slug가 기존 마스터 품목과 충돌했습니다.",
      );
    }
    throw error;
  }
  return doc;
}

export async function claimWorkshopResultInTransaction(input: {
  requestId: string;
  actorId: string;
  actorName: string;
  now?: Date;
  session: ClientSession;
}): Promise<EquipmentWorkshopRequestDoc> {
  const request = await findEquipmentWorkshopRequestById(input.requestId, { session: input.session });
  requireBuildRequest(request);
  if (request.userId !== input.actorId) throw new WorkshopOperationError("FORBIDDEN", "본인의 공방 장비만 수령할 수 있습니다.");
  if (
    request.status !== "IN_PROGRESS" ||
    !request.readyAt ||
    !request.startedAt ||
    !request.escrow ||
    (request.kind === "upgrade" &&
      (request.escrow.sourceItemId !== request.sourceItemId ||
        request.escrow.sourceSlot !== request.sourceSlot))
  ) throw new WorkshopOperationError("INVALID_STATE", "수령 가능한 제작 상태가 아닙니다.");
  const now = input.now ?? new Date();
  if (request.readyAt.getTime() > now.getTime()) throw new WorkshopOperationError("NOT_READY", "아직 제작이 완료되지 않았습니다.");
  const resultSlot = request.quote.result.category;
  await lockCharacterInventoryItems(
    request.characterId,
    [request.quote.result.itemId, slotLockId(resultSlot)],
    input.session,
  );
  await requireWorkshopCharacterOwnership(
    request.characterId,
    request.userId,
    input.session,
  );
  const inventory = await characterInventoryCol();
  const existingResult = await inventory.findOne(
    {
      characterId: request.characterId,
      itemId: request.quote.result.itemId,
    },
    { session: input.session, projection: { _id: 1 } },
  );
  if (existingResult) {
    throw new WorkshopOperationError(
      "TARGET_CHANGED",
      "결과 장비가 이미 인벤토리에 있어 안전하게 수령할 수 없습니다.",
    );
  }
  await ensureResultMasterItem(request, input.session);
  await addToInventory(
    {
      characterId: request.characterId,
      characterCodename: request.characterCodename,
      itemId: request.quote.result.itemId,
      itemName: request.quote.result.name,
      quantity: 1,
      acquiredAt: now,
      note: `공방 ${request.kind === "upgrade" ? "강화" : "제작"} 완료 · ${request._id}`,
      ...(request.quote.result.equipmentAction
        ? {
            equipmentCharge: {
              current: request.quote.result.equipmentAction.maxCharges,
              maximum: request.quote.result.equipmentAction.maxCharges,
            },
          }
        : {}),
    },
    { session: input.session },
  );
  const equipped = await equipCharacterInventoryItem(
    request.characterId,
    request.quote.result.itemId,
    resultSlot,
    { session: input.session },
  );
  if (!equipped.ok) throw new WorkshopOperationError("INVALID_STATE", "결과 장비 지급 후 장착에 실패했습니다.");
  const updated = await transitionEquipmentWorkshopRequest({
    requestId: request._id,
    currentStatus: "IN_PROGRESS",
    status: "COMPLETED",
    actorId: input.actorId,
    actorName: input.actorName,
    set: { claimedAt: now },
    session: input.session,
  });
  if (!updated) throw new WorkshopOperationError("INVALID_STATE", "다른 요청이 먼저 수령 상태를 변경했습니다.");
  return updated;
}

export async function approveWorkshopReloadInTransaction(input: {
  requestId: string;
  actorId: string;
  actorName: string;
  session: ClientSession;
}): Promise<EquipmentWorkshopRequestDoc> {
  const request = await findEquipmentWorkshopRequestById(input.requestId, {
    session: input.session,
  });
  requireReloadRequest(request);
  if (!["REQUESTED", "IN_REVIEW", "APPROVED"].includes(request.status)) {
    throw new WorkshopOperationError("INVALID_STATE", "승인 가능한 재장전 요청 상태가 아닙니다.");
  }
  if (
    !ObjectId.isValid(request.characterId) ||
    !ObjectId.isValid(request.sourceItemId) ||
    !ObjectId.isValid(request.inventoryEntryId)
  ) {
    throw new WorkshopOperationError("TARGET_CHANGED", "재장전 대상 식별자가 올바르지 않습니다.");
  }

  await lockCharacterInventoryItems(
    request.characterId,
    [request.sourceItemId, slotLockId(request.sourceSlot)],
    input.session,
  );
  await requireWorkshopCharacterOwnership(
    request.characterId,
    request.userId,
    input.session,
  );

  const item = await (await masterItemsCol()).findOne(
    { _id: new ObjectId(request.sourceItemId) },
    { session: input.session },
  );
  const action = item?.equipmentAction;
  if (
    !item ||
    !action ||
    action.code !== request.reload.actionCode ||
    action.reloadApproval !== "GM" ||
    action.reloadCreditCost !== request.reload.creditCost
  ) {
    throw new WorkshopOperationError("TARGET_CHANGED", "장비 액션 또는 재장전 비용이 요청 이후 변경되었습니다.");
  }

  const inventory = await characterInventoryCol();
  const entryFilter = {
    _id: new ObjectId(request.inventoryEntryId),
    characterId: request.characterId,
    itemId: request.sourceItemId,
    equippedSlot: request.sourceSlot,
    quantity: { $gte: 1 },
    "equipmentCharge.current": 0,
    "equipmentCharge.maximum": action.maxCharges,
  } as const;
  const target = await inventory.findOne(entryFilter, { session: input.session });
  if (!target) {
    throw new WorkshopOperationError("TARGET_CHANGED", "장비가 장착 해제되었거나 이미 충전되어 있습니다.");
  }

  if (request.reload.creditCost > 0) {
    await addCredit({
      characterId: request.characterId,
      characterCodename: request.characterCodename,
      ownerId: request.userId,
      ownerName: request.userName,
      amount: -request.reload.creditCost,
      type: "PURCHASE",
      description: `공방 전용 장약 재장전 · ${item.name} ${action.code}`,
      metadata: {
        source: "equipment_workshop_reload",
        workshopRequestId: request._id,
        actionCode: action.code,
      },
      createdById: input.actorId,
      createdByName: input.actorName,
      requestId: childIdempotencyKey(input.requestId, "reload-credit"),
      session: input.session,
    });
  }

  const charged = await inventory.updateOne(
    entryFilter,
    { $set: { "equipmentCharge.current": action.maxCharges } },
    { session: input.session },
  );
  if (charged.modifiedCount !== 1) {
    throw new WorkshopOperationError("TARGET_CHANGED", "재장전 대상 장비 상태가 변경되었습니다.");
  }

  const reloadedAt = new Date();
  const updated = await transitionEquipmentWorkshopRequest({
    requestId: request._id,
    currentStatus: request.status,
    status: "COMPLETED",
    actorId: input.actorId,
    actorName: input.actorName,
    note: `관료 결재 승인 · ${action.code} ${action.maxCharges}/${action.maxCharges}`,
    set: { reloadedAt },
    session: input.session,
  });
  if (!updated) {
    throw new WorkshopOperationError("INVALID_STATE", "다른 운영자가 먼저 재장전을 처리했습니다.");
  }
  return updated;
}

export async function getWorkshopRequestForOperation(requestId: string) {
  return findEquipmentWorkshopRequestById(requestId);
}
