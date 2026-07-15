/**
 * master_items + character_inventory CRUD
 */

import {
  MongoServerError,
  ObjectId,
  type ClientSession,
  type Filter,
} from "mongodb";

import type {
  CharacterInventory,
  CreateInventoryInput,
  CreateMasterItemInput,
  CreateSharedInventoryInput,
  EquipmentSlot,
  ItemCategory,
  MasterItem,
  SharedInventory,
  SharedInventoryScope,
} from "../types/index.js";

import {
  characterInventoryCol,
  masterItemsCol,
  sharedInventoryCol,
} from "../collections.js";
import { getClient, getDb } from "../client.js";

/* ── Master Items ── */

export async function listMasterItems(): Promise<MasterItem[]> {
  const col = await masterItemsCol();
  return col.find().sort({ category: 1, name: 1 }).toArray();
}

export async function listAvailableItems(): Promise<MasterItem[]> {
  const col = await masterItemsCol();
  return col
    .find({ isAvailable: true })
    .sort({ category: 1, name: 1 })
    .toArray();
}

export async function listMasterItemsByCategories(
  categories: readonly ItemCategory[],
  opts: { publicOnly?: boolean; availableOnly?: boolean } = {}
): Promise<MasterItem[]> {
  if (categories.length === 0) return [];

  const { publicOnly = true, availableOnly = true } = opts;
  const query: Filter<MasterItem> = {
    category: { $in: [...categories] },
  };

  if (publicOnly) query.isPublic = { $ne: false };
  if (availableOnly) query.isAvailable = { $ne: false };

  const col = await masterItemsCol();
  return col.find(query).sort({ category: 1, name: 1 }).toArray();
}

export async function findMasterItemById(id: string): Promise<MasterItem | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await masterItemsCol();
  return col.findOne({ _id: new ObjectId(id) });
}

/**
 * 편의점 카탈로그 slug 로 master_items 조회.
 *
 * `seed-shop-catalog.ts` 가 slug 기준 upsert 한 row 를 끌어온다.
 * - 미존재 시 null (시드 미실행 또는 catalog drift 상황 — 호출자가 안내).
 * - slug 가 빈 문자열 / 공백이면 null (방어).
 */
export async function findMasterItemBySlug(
  slug: string
): Promise<MasterItem | null> {
  const trimmed = slug?.trim();
  if (!trimmed) return null;
  const col = await masterItemsCol();
  return col.findOne({ slug: trimmed });
}

/**
 * 여러 slug 의 master_items 를 한 번에 조회 — projection { _id, slug } 만.
 *
 * 용도: 편의점 inventory 응답에서 character_inventory.itemId(=master._id) → slug 역매핑.
 * 빈 배열 입력은 즉시 short-circuit.
 */
export async function findMasterItemsBySlugs(
  slugs: string[]
): Promise<Pick<MasterItem, "_id" | "slug">[]> {
  if (slugs.length === 0) return [];
  const col = await masterItemsCol();
  return col
    .find(
      { slug: { $in: slugs } },
      { projection: { _id: 1, slug: 1 } }
    )
    .toArray();
}

/**
 * 여러 ObjectId hex 문자열의 master_items 를 한 번에 조회 — projection { _id, category } 만.
 *
 * 용도: character_inventory.itemId(=master._id hex) → category 역매핑.
 * - 유효하지 않은 hex 는 사전에 필터링.
 * - 입력/유효 ID 가 비면 즉시 short-circuit.
 */
export async function findMasterItemsByIds(
  ids: string[]
): Promise<Pick<MasterItem, "_id" | "category">[]> {
  if (ids.length === 0) return [];
  const objectIds: ObjectId[] = [];
  for (const id of ids) {
    if (ObjectId.isValid(id)) objectIds.push(new ObjectId(id));
  }
  if (objectIds.length === 0) return [];
  const col = await masterItemsCol();
  return col
    .find(
      { _id: { $in: objectIds } },
      { projection: { _id: 1, category: 1 } }
    )
    .toArray();
}

/**
 * 여러 key(slug 또는 ObjectId hex)의 master_items 풀 도큐먼트를 한 번에 조회.
 *
 * `findMasterItemBySlugOrId` 의 루프 호출(N+1) 대체용 — slug `$in` + _id `$in`
 * 합집합을 단일 쿼리로 가져온다. key 별 "slug 우선, id 폴백" 우선순위 판정은
 * 호출자가 결과를 slug/id Map 으로 인덱싱해 수행한다.
 *
 * - 빈/공백 key, 무효 hex 는 사전 필터링 (단건 함수의 null 반환과 동일하게 누락).
 * - 빈 입력은 즉시 short-circuit.
 */
export async function findMasterItemsBySlugsOrIds(
  keys: string[]
): Promise<MasterItem[]> {
  const slugs: string[] = [];
  const objectIds: ObjectId[] = [];
  for (const key of keys) {
    const trimmed = key?.trim();
    if (!trimmed) continue;
    slugs.push(trimmed);
    if (ObjectId.isValid(trimmed)) objectIds.push(new ObjectId(trimmed));
  }
  if (slugs.length === 0 && objectIds.length === 0) return [];

  const col = await masterItemsCol();
  const conditions: Filter<MasterItem>[] = [];
  if (slugs.length > 0) conditions.push({ slug: { $in: slugs } });
  if (objectIds.length > 0) conditions.push({ _id: { $in: objectIds } });
  return col.find({ $or: conditions }).toArray();
}

export async function createMasterItem(
  input: CreateMasterItemInput
): Promise<MasterItem> {
  const col = await masterItemsCol();
  const now = new Date();
  const doc: MasterItem = { ...input, createdAt: now, updatedAt: now };
  const result = await col.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function updateMasterItem(
  id: string,
  update: Record<string, unknown>
): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const col = await masterItemsCol();
  const result = await col.updateOne(
    { _id: new ObjectId(id) },
    { $set: { ...update, updatedAt: new Date() } as Record<string, unknown> }
  );
  return result.modifiedCount > 0;
}

export async function deleteMasterItem(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const col = await masterItemsCol();
  const result = await col.deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}

/* ── Character Inventory ── */

const MAX_CHARACTER_INVENTORY_MUTATION_QUANTITY = 999;

function equipmentSlotLockId(slot: EquipmentSlot): string {
  return `@equipment-slot:${slot}`;
}

export async function listCharacterInventory(
  characterId: string,
  options: { session?: ClientSession } = {},
): Promise<CharacterInventory[]> {
  const col = await characterInventoryCol();
  return col
    .find({ characterId }, { session: options.session })
    .sort({ acquiredAt: -1 })
    .toArray();
}

interface CharacterInventoryLock {
  _id: string;
  characterId: string;
  itemId: string;
  updatedAt: Date;
  version?: number;
}

function characterInventoryLockIds(itemIds: readonly string[]): string[] {
  return [...new Set(itemIds)].sort();
}

/**
 * inventory transaction이 시작되기 전에 고유 lock anchor를 준비한다.
 *
 * 최초 두 요청의 동시 upsert에서 한쪽이 E11000을 받더라도 이미 생성된 anchor를
 * 다시 갱신해 정상 완료한다. 이 쓰기는 inventory/credit 상태를 바꾸지 않는다.
 */
export async function prepareCharacterInventoryItemLocks(
  characterId: string,
  itemIds: readonly string[],
): Promise<void> {
  const db = await getDb();
  const locks = db.collection<CharacterInventoryLock>(
    "character_inventory_locks",
  );

  for (const itemId of characterInventoryLockIds(itemIds)) {
    const _id = `${characterId}:${itemId}`;
    const updatedAt = new Date();
    try {
      await locks.updateOne(
        { _id },
        { $set: { characterId, itemId, updatedAt } },
        { upsert: true },
      );
    } catch (error) {
      if (!(error instanceof MongoServerError) || error.code !== 11000) {
        throw error;
      }
      await locks.updateOne(
        { _id },
        { $set: { characterId, itemId, updatedAt } },
      );
    }
  }
}

/**
 * transaction 안에서 동일 캐릭터·품목 inventory mutation을 직렬화한다.
 *
 * 호출자는 transaction 시작 전에 prepareCharacterInventoryItemLocks()로 anchor를
 * 준비해야 한다. transaction 내부에서는 upsert를 하지 않아 lock anchor의 E11000이
 * 경제 작업의 멱등성 충돌로 오인되는 경로를 차단한다.
 */
export async function lockCharacterInventoryItems(
  characterId: string,
  itemIds: readonly string[],
  session: ClientSession,
): Promise<void> {
  if (!session.inTransaction()) {
    throw new Error("Inventory item locks require an active transaction");
  }
  const db = await getDb();
  const locks = db.collection<CharacterInventoryLock>(
    "character_inventory_locks",
  );

  for (const itemId of characterInventoryLockIds(itemIds)) {
    const result = await locks.updateOne(
      { _id: `${characterId}:${itemId}` },
      {
        $set: { characterId, itemId, updatedAt: new Date() },
        $inc: { version: 1 },
      },
      { session },
    );
    if (result.matchedCount !== 1) {
      throw new Error(
        `Inventory lock anchor is missing: characterId=${characterId}, itemId=${itemId}`,
      );
    }
  }
}

export async function addToInventory(
  input: CreateInventoryInput,
  options: { session?: ClientSession } = {},
): Promise<CharacterInventory> {
  if (
    typeof input.characterId !== "string" ||
    !input.characterId.trim() ||
    typeof input.itemId !== "string" ||
    !input.itemId.trim() ||
    !Number.isSafeInteger(input.quantity) ||
    input.quantity < 1 ||
    input.quantity > MAX_CHARACTER_INVENTORY_MUTATION_QUANTITY
  ) {
    throw new Error("Invalid character inventory mutation input");
  }

  if (!options.session) {
    await prepareCharacterInventoryItemLocks(input.characterId, [input.itemId]);
    const client = await getClient();
    const session = client.startSession();
    try {
      const entry = await session.withTransaction(() =>
        addToInventory(input, { session }),
      );
      if (!entry) {
        throw new Error(
          `Inventory transaction did not commit: characterId=${input.characterId}, itemId=${input.itemId}`,
        );
      }
      return entry;
    } finally {
      await session.endSession();
    }
  }

  await lockCharacterInventoryItems(
    input.characterId,
    [input.itemId],
    options.session,
  );
  const col = await characterInventoryCol();

  const result = await col.findOneAndUpdate(
    { characterId: input.characterId, itemId: input.itemId },
    {
      $inc: { quantity: input.quantity },
      $setOnInsert: {
        characterCodename: input.characterCodename,
        itemName: input.itemName,
        acquiredAt: input.acquiredAt,
        note: input.note,
        ...(input.equipmentCharge
          ? { equipmentCharge: input.equipmentCharge }
          : {}),
      },
    },
    { upsert: true, returnDocument: "after", session: options.session }
  );
  if (!result) {
    throw new Error(
      `Failed to upsert inventory: characterId=${input.characterId}, itemId=${input.itemId}`
    );
  }
  return result;
}

export type EquipCharacterInventoryResult =
  | { ok: true; entry: CharacterInventory; previousItemId?: string }
  | { ok: false; reason: "NOT_OWNED" };

/**
 * 보유 중인 인벤토리 품목을 캐릭터의 전투 슬롯에 원자적으로 장착한다.
 *
 * 품목 category → slot 판정은 master_items 를 조회한 호출자가 수행한다. 이 함수는
 * 동일 캐릭터·슬롯 lock을 잡고 기존 장비 해제와 신규 장착을 한 transaction에서 처리한다.
 */
export async function equipCharacterInventoryItem(
  characterId: string,
  itemId: string,
  slot: EquipmentSlot,
  options: { session?: ClientSession } = {},
): Promise<EquipCharacterInventoryResult> {
  if (!characterId.trim() || !itemId.trim()) {
    throw new Error("Invalid character equipment input");
  }

  const slotLockId = equipmentSlotLockId(slot);
  if (!options.session) {
    await prepareCharacterInventoryItemLocks(characterId, [slotLockId]);
    const client = await getClient();
    const session = client.startSession();
    try {
      const result = await session.withTransaction(() =>
        equipCharacterInventoryItem(characterId, itemId, slot, { session }),
      );
      if (!result) {
        throw new Error(
          `Equipment transaction did not commit: characterId=${characterId}, slot=${slot}`,
        );
      }
      return result;
    } finally {
      await session.endSession();
    }
  }

  await lockCharacterInventoryItems(characterId, [slotLockId], options.session);
  const col = await characterInventoryCol();
  const target = await col.findOne(
    { characterId, itemId, quantity: { $gte: 1 } },
    { session: options.session },
  );
  if (!target) return { ok: false, reason: "NOT_OWNED" };

  const previous = await col.findOne(
    {
      characterId,
      equippedSlot: slot,
      _id: { $ne: target._id },
    },
    { session: options.session, projection: { itemId: 1 } },
  );

  await col.updateMany(
    {
      characterId,
      equippedSlot: slot,
      _id: { $ne: target._id },
    },
    { $unset: { equippedSlot: "", equippedAt: "" } },
    { session: options.session },
  );

  const equippedAt = new Date();
  const entry = await col.findOneAndUpdate(
    { _id: target._id, characterId, itemId, quantity: { $gte: 1 } },
    { $set: { equippedSlot: slot, equippedAt } },
    { returnDocument: "after", session: options.session },
  );
  if (!entry) return { ok: false, reason: "NOT_OWNED" };

  return {
    ok: true,
    entry,
    ...(previous?.itemId ? { previousItemId: previous.itemId } : {}),
  };
}

/**
 * character_inventory 에서 quantity 만큼 atomic 차감.
 *
 * - `quantity: { $gte: quantity }` 매치로 race condition 차단
 *   (동시 consume 두 건이 동일 row 에 들어와도 음수 quantity 발생 안 함).
 * - 차감 후 quantity 가 0 이면 race-aware deleteOne 으로 row 정리
 *   (다른 호출이 그 사이 +qty 했으면 quantity:0 매치 안 되어 보존됨).
 * - 보유 부족 시 `{ ok: false, remaining: 0 }`.
 * - 정상 차감 시 `{ ok: true, remaining: <차감 후 quantity> }`.
 */
export async function removeFromInventory(
  characterId: string,
  itemId: string,
  quantity: number,
  options: { session?: ClientSession } = {},
): Promise<{ ok: boolean; remaining: number }> {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error(
      `removeFromInventory: quantity must be a positive integer, got ${quantity}`
    );
  }
  if (options.session) {
    await lockCharacterInventoryItems(characterId, [itemId], options.session);
  }
  const col = await characterInventoryCol();
  const result = await col.findOneAndUpdate(
    {
      characterId,
      itemId,
      quantity: { $gte: quantity },
      equippedSlot: { $exists: false },
    },
    { $inc: { quantity: -quantity } },
    { returnDocument: "after", session: options.session }
  );
  if (!result) return { ok: false, remaining: 0 };
  if (result.quantity === 0) {
    // race-aware: 다른 요청이 이미 inc 했을 수 있으므로 quantity:0 추가 매치.
    await col.deleteOne(
      { _id: result._id, quantity: 0 },
      { session: options.session },
    );
  }
  return { ok: true, remaining: result.quantity };
}

/**
 * 장착 장비의 충전을 원자적으로 차감한다.
 *
 * 장착 해제·충전 부족·최대 충전 드리프트는 모두 매치 실패로 처리한다.
 */
export async function consumeEquippedEquipmentCharge(
  characterId: string,
  itemId: string,
  chargeCost: number,
  expectedMaximum: number,
): Promise<{ ok: boolean; current: number }> {
  if (
    !characterId.trim() ||
    !itemId.trim() ||
    !Number.isSafeInteger(chargeCost) ||
    chargeCost < 1 ||
    !Number.isSafeInteger(expectedMaximum) ||
    expectedMaximum < chargeCost
  ) {
    throw new Error("Invalid equipment charge consumption input");
  }

  await prepareCharacterInventoryItemLocks(characterId, [itemId]);
  const client = await getClient();
  const session = client.startSession();
  try {
    let current: number | undefined;
    await session.withTransaction(async () => {
      await lockCharacterInventoryItems(characterId, [itemId], session);
      const col = await characterInventoryCol();
      const entry = await col.findOneAndUpdate(
        {
          characterId,
          itemId,
          quantity: { $gte: 1 },
          equippedSlot: { $exists: true },
          "equipmentCharge.current": { $gte: chargeCost },
          "equipmentCharge.maximum": expectedMaximum,
        },
        { $inc: { "equipmentCharge.current": -chargeCost } },
        { returnDocument: "after", session },
      );
      current = entry?.equipmentCharge?.current;
    });
    return current === undefined ? { ok: false, current: 0 } : { ok: true, current };
  } finally {
    await session.endSession();
  }
}

export async function deleteInventoryEntry(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const col = await characterInventoryCol();
  const result = await col.deleteOne({
    _id: new ObjectId(id),
    equippedSlot: { $exists: false },
  });
  return result.deletedCount > 0;
}

/* ── Shared Inventory ── */

export const SHARED_INVENTORY_SCOPE: SharedInventoryScope = "GLOBAL";

export async function listSharedInventory(
  scope: SharedInventoryScope = SHARED_INVENTORY_SCOPE
): Promise<SharedInventory[]> {
  const col = await sharedInventoryCol();
  return col.find({ scope }).sort({ acquiredAt: -1 }).toArray();
}

export async function addToSharedInventory(
  input: CreateSharedInventoryInput
): Promise<SharedInventory> {
  const col = await sharedInventoryCol();

  const result = await col.findOneAndUpdate(
    { scope: input.scope, itemId: input.itemId },
    {
      $inc: { quantity: input.quantity },
      $setOnInsert: {
        scope: input.scope,
        itemName: input.itemName,
        acquiredAt: input.acquiredAt,
        note: input.note,
      },
    },
    { upsert: true, returnDocument: "after" }
  );
  if (!result) {
    throw new Error(
      `Failed to upsert shared inventory: scope=${input.scope}, itemId=${input.itemId}`
    );
  }
  return result;
}

export async function removeFromSharedInventory(
  itemId: string,
  quantity: number,
  scope: SharedInventoryScope = SHARED_INVENTORY_SCOPE
): Promise<{ ok: boolean; remaining: number }> {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error(
      `removeFromSharedInventory: quantity must be a positive integer, got ${quantity}`
    );
  }
  const col = await sharedInventoryCol();
  const result = await col.findOneAndUpdate(
    { scope, itemId, quantity: { $gte: quantity } },
    { $inc: { quantity: -quantity } },
    { returnDocument: "after" }
  );
  if (!result) return { ok: false, remaining: 0 };
  if (result.quantity === 0) {
    await col.deleteOne({ _id: result._id, quantity: 0 });
  }
  return { ok: true, remaining: result.quantity };
}
