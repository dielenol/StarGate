import { ObjectId, type ClientSession } from "mongodb";

import "@/lib/db/init";
import { findSessionById } from "@/lib/db/sessions";
import { applyEquipmentAbilityOverrides } from "@/lib/equipment/equipment-ability-overrides";
import { mergePublicEquipment } from "@/lib/equipment/public-equipment";
import { notifyUser } from "@/lib/notifications/events";
import { getConsumableItemImageSrc } from "@/lib/shop/item-images";
import {
  resolveConsumableOutcomes,
  type MrBeastSodaConsumptionOutcome,
} from "@/lib/shop/mrbeast-soda-consumption";
import { stripDossierPersonalityObservations } from "@/lib/personnel";

import {
  findCharacterByCodename,
  findCharacterById,
  listSharedInventory,
  listAgentCharacters,
  listCharacterInventory,
  masterItemsCol,
  prepareCharacterInventoryItemLocks,
  sharedInventoryCol,
  consumeEquippedEquipmentCharge,
  removeFromInventory,
  type Ability,
  type AgentCharacter,
  type Character,
  type CharacterInventory,
  type MasterItem,
} from "@stargate/shared-db";

import { findTransactionalAgentCharacterByKey } from "./transactional-character";

type SerializedDate = string | null;

export interface NochichimConsumableSnapshot {
  itemId: string;
  slug?: string;
  name: string;
  description: string;
  effect: string;
  quantity: number;
  previewImage: string;
  note?: string;
  acquiredAt: SerializedDate;
}

export const NOCHICHIM_SHARED_CONSUMABLE_PREFIX = "shared:";
const WHITE_ROSE_ASSISTANT_CALL_SLUG = "white-rose-assistant-call";

export interface NochichimEquipmentActionSnapshot {
  itemId: string;
  inventoryEntryId: string;
  itemName: string;
  code: string;
  name: string;
  description: string;
  effect: string;
  kind: "CHARGED" | "STANCE";
  actionCost: number;
  chargeCost: number;
  currentCharges: number;
  maxCharges: number;
  reloadCreditCost: number;
  reloadApproval: "GM";
  reloadable: boolean;
  requiresMounted?: boolean;
  consumesRegularAmmo?: number;
  rangeMinCells?: number;
  rangeMaxCells?: number;
  damage?: NonNullable<MasterItem["equipmentActions"]>[number]["damage"];
}

export interface NochichimEquipmentSnapshot {
  itemId: string;
  inventoryEntryId: string;
  slug?: string;
  name: string;
  category: "WEAPON" | "ARMOR";
  equippedSlot: "WEAPON" | "ARMOR";
  source: "stargate";
  damage?: string;
  description: string;
  effect: string;
  ammo?: { current: number; maximum: number };
  combatProfile?: MasterItem["combatProfile"];
  actions: NochichimEquipmentActionSnapshot[];
}

export interface NochichimCharacterListItem {
  id: string;
  codename: string;
  name: string;
  nickname?: string;
  tier?: string;
  role: string;
  agentLevel?: string;
  previewImage: string;
  isPublic: boolean;
}

export interface NochichimCharacterSnapshot extends NochichimCharacterListItem {
  syncedAt: string;
  root: {
    department?: string;
    factionCode?: string;
    institutionCode?: string;
    previewImage: string;
    pixelCharacterImage?: string;
  };
  lore: AgentCharacter["lore"];
  play: AgentCharacter["play"];
  nochichim: {
    name: string;
    codename: string;
    className: string;
    portrait: string;
    stats: {
      hp: number;
      maxHp: number;
      san: number;
      maxSan: number;
      atk: number;
      def: number;
    };
    cantrips: Array<{
      id: string;
      code: string;
      name: string;
      desc: string;
      effect: string;
      locked: true;
      source: "stargate";
      stargateSlot: string;
      stargateCode?: string;
    }>;
    equipment: NochichimEquipmentSnapshot[];
    equipmentActions: NochichimEquipmentActionSnapshot[];
  };
  consumables: NochichimConsumableSnapshot[];
}

export interface NochichimConsumptionSessionContext {
  sessionId?: string;
  sessionTitle?: string;
}

function isAgentCharacter(character: Character | null): character is AgentCharacter {
  return !!character && character.type === "AGENT";
}

function objectIdString(value: { toString(): string } | undefined): string {
  return value?.toString() ?? "";
}

function dateToIso(value: Date | undefined): SerializedDate {
  return value instanceof Date ? value.toISOString() : null;
}

function finalStat(base: number, delta: number | undefined): number {
  const total = Math.trunc((Number(base) || 0) + (Number(delta) || 0));
  return Math.max(0, total);
}

function abilityHasContent(ability: Ability): boolean {
  return Boolean(
    ability.name?.trim() ||
      ability.code?.trim() ||
      ability.description?.trim() ||
      ability.effect?.trim(),
  );
}

function nochichimAbilityCode(slot: Ability["slot"]): string {
  return slot === "P" ? "P1" : slot;
}

function toNochichimCantrip(ability: Ability) {
  return {
    id: `stargate:${ability.slot}`,
    code: nochichimAbilityCode(ability.slot),
    name: ability.name.trim() || ability.code?.trim() || ability.slot,
    desc: ability.description?.trim() ?? "",
    effect: ability.effect?.trim() ?? "",
    locked: true as const,
    source: "stargate" as const,
    stargateSlot: ability.slot,
    ...(ability.code?.trim() ? { stargateCode: ability.code.trim() } : {}),
  };
}

export function toCharacterListItem(
  character: AgentCharacter,
): NochichimCharacterListItem {
  return {
    id: objectIdString(character._id),
    codename: character.codename,
    name: character.lore.name,
    nickname: character.lore.nickname,
    tier: character.tier,
    role: character.role,
    agentLevel: character.agentLevel,
    previewImage: character.previewImage || character.lore.mainImage || "",
    isPublic: character.isPublic,
  };
}

export async function findAgentCharacterByKey(
  key: string,
): Promise<AgentCharacter | null> {
  const trimmed = key.trim();
  if (!trimmed) return null;

  const byId =
    ObjectId.isValid(trimmed) && trimmed.length === 24
      ? await findCharacterById(trimmed)
      : null;
  if (isAgentCharacter(byId)) return byId;

  const byCodename = await findCharacterByCodename(trimmed);
  return isAgentCharacter(byCodename) ? byCodename : null;
}

export async function listNochichimCharacters(
  query?: string,
): Promise<NochichimCharacterListItem[]> {
  const normalizedQuery = query?.trim().toLowerCase() ?? "";
  const characters = (await listAgentCharacters(null)).filter(isAgentCharacter);
  const filtered = normalizedQuery
    ? characters.filter((character) => {
        const id = objectIdString(character._id).toLowerCase();
        const values = [
          id,
          character.codename,
          character.lore.name,
          character.lore.nickname ?? "",
        ].map((value) => value.toLowerCase());
        return values.some((value) => value.includes(normalizedQuery));
      })
    : characters;

  return filtered.map(toCharacterListItem);
}

async function loadMasterItemMap(
  inventory: Array<Pick<CharacterInventory, "itemId">>,
  options: { session?: ClientSession } = {},
): Promise<Map<string, MasterItem>> {
  const objectIds = inventory
    .map((entry) => entry.itemId)
    .filter((itemId) => ObjectId.isValid(itemId))
    .map((itemId) => new ObjectId(itemId));

  if (objectIds.length === 0) return new Map();

  const items = await (await masterItemsCol())
    .find({ _id: { $in: objectIds } }, { session: options.session })
    .toArray();

  return new Map(items.map((item) => [objectIdString(item._id), item]));
}

export async function loadCharacterConsumables(
  characterId: string,
): Promise<NochichimConsumableSnapshot[]> {
  const [inventory, sharedInventory] = await Promise.all([
    listCharacterInventory(characterId).then((entries) =>
      entries.filter((entry) => entry.quantity > 0),
    ),
    listSharedInventory().then((entries) =>
      entries.filter((entry) => entry.quantity > 0),
    ),
  ]);
  const itemMap = await loadMasterItemMap([...inventory, ...sharedInventory]);

  const personal = inventory.flatMap((entry) => {
    const item = itemMap.get(entry.itemId);
    if (!item || item.category !== "CONSUMABLE") return [];

    return [
      {
        itemId: entry.itemId,
        slug: item.slug,
        name: item.name || entry.itemName,
        description: item.description ?? "",
        effect: item.effect ?? "",
        quantity: entry.quantity,
        previewImage:
          getConsumableItemImageSrc(item.slug ?? "") ?? item.previewImage ?? "",
        note: entry.note,
        acquiredAt: dateToIso(entry.acquiredAt),
      },
    ];
  });
  const shared = sharedInventory.flatMap((entry) => {
    const item = itemMap.get(entry.itemId);
    if (
      !item ||
      item.category !== "CONSUMABLE" ||
      item.slug !== WHITE_ROSE_ASSISTANT_CALL_SLUG
    ) {
      return [];
    }

    return [
      {
        itemId: `${NOCHICHIM_SHARED_CONSUMABLE_PREFIX}${entry.itemId}`,
        slug: item.slug,
        name: item.name || entry.itemName,
        description: item.description ?? "",
        effect: item.effect ?? "",
        quantity: entry.quantity,
        previewImage:
          getConsumableItemImageSrc(item.slug ?? "") ?? item.previewImage ?? "",
        note: entry.note,
        acquiredAt: dateToIso(entry.acquiredAt),
      },
    ];
  });
  return [...personal, ...shared];
}

export function nochichimSharedConsumableMasterItemId(
  itemId: string,
): string | null {
  if (!itemId.startsWith(NOCHICHIM_SHARED_CONSUMABLE_PREFIX)) return null;
  const masterItemId = itemId.slice(NOCHICHIM_SHARED_CONSUMABLE_PREFIX.length);
  return ObjectId.isValid(masterItemId) ? masterItemId : null;
}

export async function consumeSharedNochichimConsumable(
  input: {
    characterId: string;
    itemId: string;
    quantity: number;
  },
  options: { session: ClientSession },
): Promise<{ ok: boolean; remaining: number }> {
  const character = await findTransactionalAgentCharacterByKey(
    input.characterId,
    options.session,
  );
  if (!character) throw new Error("Character not found");
  const masterItemId = nochichimSharedConsumableMasterItemId(input.itemId);
  if (!masterItemId) throw new Error("Shared consumable not found");
  const item = (
    await loadMasterItemMap(
      [{ itemId: masterItemId }],
      { session: options.session },
    )
  ).get(masterItemId);
  if (
    !item ||
    item.category !== "CONSUMABLE" ||
    item.slug !== WHITE_ROSE_ASSISTANT_CALL_SLUG
  ) {
    throw new Error("Shared consumable not found");
  }

  const collection = await sharedInventoryCol();
  const entry = await collection.findOneAndUpdate(
    {
      scope: "GLOBAL",
      itemId: masterItemId,
      quantity: { $gte: input.quantity },
    },
    { $inc: { quantity: -input.quantity } },
    { returnDocument: "after", session: options.session },
  );
  if (!entry) return { ok: false, remaining: 0 };
  if (entry.quantity === 0) {
    await collection.deleteOne(
      { _id: entry._id, quantity: 0 },
      { session: options.session },
    );
  }
  return { ok: true, remaining: entry.quantity };
}

function toNochichimEquipmentActions(
  entry: CharacterInventory,
  item: MasterItem,
): NochichimEquipmentActionSnapshot[] {
  if (!entry._id) return [];
  const actions = item.equipmentActions ??
    (item.equipmentAction ? [item.equipmentAction] : []);
  return actions.flatMap((action) => {
    const kind = action.kind ?? "CHARGED";
    const charge = item.equipmentActions
      ? entry.equipmentCharges?.[action.code]
      : entry.equipmentCharge;
    if (kind === "CHARGED" && !charge) return [];
    return [{
      itemId: entry.itemId,
      inventoryEntryId: objectIdString(entry._id),
      itemName: item.name || entry.itemName,
      code: action.code,
      name: action.name,
      description: action.description,
      effect: action.effect,
      kind,
      actionCost: action.actionCost,
      chargeCost: action.chargeCost,
      currentCharges: charge?.current ?? 0,
      maxCharges: charge?.maximum ?? 0,
      reloadCreditCost: action.reloadCreditCost,
      reloadApproval: action.reloadApproval,
      reloadable: action.reloadable !== false && kind === "CHARGED",
      ...(action.requiresMounted !== undefined
        ? { requiresMounted: action.requiresMounted }
        : {}),
      ...(action.consumesRegularAmmo !== undefined
        ? { consumesRegularAmmo: action.consumesRegularAmmo }
        : {}),
      ...(action.rangeMinCells !== undefined && action.rangeMaxCells !== undefined
        ? {
            rangeMinCells: action.rangeMinCells,
            rangeMaxCells: action.rangeMaxCells,
          }
        : {}),
      ...(action.damage ? { damage: action.damage } : {}),
    }];
  });
}

export async function loadCharacterEquippedState(
  characterId: string,
  options: { session?: ClientSession } = {},
) {
  const inventory = (
    await listCharacterInventory(characterId, { session: options.session })
  ).filter(
    (entry) => entry.quantity > 0,
  );
  const equippedInventory = inventory.filter((entry) =>
    Boolean(entry.equippedSlot),
  );
  const itemMap = await loadMasterItemMap(inventory, options);

  const equipment: NochichimEquipmentSnapshot[] = equippedInventory.flatMap(
    (entry) => {
      const item = itemMap.get(entry.itemId);
      if (
        !item ||
        !entry._id ||
        !entry.equippedSlot ||
        (item.category !== "WEAPON" && item.category !== "ARMOR")
      ) {
        return [];
      }
      return [{
        itemId: entry.itemId,
        inventoryEntryId: objectIdString(entry._id),
        ...(item.slug ? { slug: item.slug } : {}),
        name: item.name || entry.itemName,
        category: item.category,
        equippedSlot: entry.equippedSlot,
        source: "stargate" as const,
        ...(item.damage ? { damage: item.damage } : {}),
        description: item.description ?? "",
        effect: item.effect ?? "",
        ...(entry.equipmentAmmo ? { ammo: entry.equipmentAmmo } : {}),
        ...(item.combatProfile ? { combatProfile: item.combatProfile } : {}),
        actions: toNochichimEquipmentActions(entry, item),
      }];
    },
  );
  const equipmentActions = equipment.flatMap((entry) => entry.actions);
  const masterSources = inventory.flatMap((entry) => {
    const item = itemMap.get(entry.itemId);
    if (!item) return [];
    return [{
      itemName: item.name || entry.itemName,
      equippedSlot: entry.equippedSlot,
      slug: item.slug,
      price: item.price,
      damage: item.damage,
      description: item.description,
      effect: item.effect,
      isPublic: item.isPublic,
      workshop: item.workshop,
      equipmentAbilityOverrides: item.equipmentAbilityOverrides,
    }];
  });

  return { equipment, equipmentActions, masterSources };
}

export async function loadCharacterEquipmentActions(
  characterId: string,
  options: { session?: ClientSession } = {},
): Promise<NochichimEquipmentActionSnapshot[]> {
  return (await loadCharacterEquippedState(characterId, options))
    .equipmentActions;
}

export async function prepareCharacterInventoryConsumption(input: {
  characterKey: string;
  itemId: string;
}): Promise<string> {
  const character = await findAgentCharacterByKey(input.characterKey);
  if (!character) throw new Error("Character not found");
  const characterId = objectIdString(character._id);
  await prepareCharacterInventoryItemLocks(characterId, [input.itemId]);
  return characterId;
}

export async function loadCharacterSnapshot(
  key: string,
): Promise<NochichimCharacterSnapshot | null> {
  const character = await findAgentCharacterByKey(key);
  if (!character) return null;

  const id = objectIdString(character._id);
  const [consumables, equippedState] = await Promise.all([
    loadCharacterConsumables(id),
    loadCharacterEquippedState(id),
  ]);
  const {
    equipment: structuredEquipment,
    equipmentActions,
    masterSources,
  } = equippedState;
  const play = character.play;
  const abilities = applyEquipmentAbilityOverrides(
    play.abilities,
    masterSources,
  );
  const legacyEquipment = mergePublicEquipment({
    inventoryEntries: masterSources,
    legacyEquipment: play.equipment,
    includePrivate: true,
  }).map((entry) => ({
    ...entry,
    ...(entry.price === "" ? { price: undefined } : { price: String(entry.price) }),
  }));
  const effectivePlay = { ...play, abilities, equipment: legacyEquipment };
  const stats = {
    hp: finalStat(play.hp, play.hpDelta),
    maxHp: finalStat(play.hp, play.hpDelta),
    san: finalStat(play.san, play.sanDelta),
    maxSan: finalStat(play.san, play.sanDelta),
    atk: finalStat(play.atk, play.atkDelta),
    def: finalStat(play.def, play.defDelta),
  };

  return {
    ...toCharacterListItem(character),
    syncedAt: new Date().toISOString(),
    root: {
      department: character.department,
      factionCode: character.factionCode,
      institutionCode: character.institutionCode,
      previewImage: character.previewImage,
      pixelCharacterImage: character.pixelCharacterImage,
    },
    lore: stripDossierPersonalityObservations(character).lore,
    play: effectivePlay,
    nochichim: {
      name: character.lore.name || character.codename,
      codename: character.codename,
      className: play.className,
      portrait:
        character.previewImage ||
        character.lore.mainImage ||
        character.pixelCharacterImage ||
        "",
      stats,
      cantrips: abilities
        .filter(abilityHasContent)
        .map(toNochichimCantrip),
      equipment: structuredEquipment,
      equipmentActions,
    },
    consumables,
  };
}

export async function consumeCharacterEquipmentAction(input: {
  characterId: string;
  itemId: string;
  actionCode: string;
  dbSession: ClientSession;
}): Promise<{
  ok: boolean;
  currentCharges: number;
}> {
  const character = await findTransactionalAgentCharacterByKey(
    input.characterId,
    input.dbSession,
  );
  if (!character) throw new Error("Character not found");
  const characterId = objectIdString(character._id);
  const item = (await loadMasterItemMap([
    { itemId: input.itemId },
  ], { session: input.dbSession })).get(input.itemId);
  const action = item?.equipmentActions?.find(
    (candidate) => candidate.code === input.actionCode,
  ) ?? (item?.equipmentAction?.code === input.actionCode
    ? item.equipmentAction
    : undefined);
  if (!item || !action || action.code !== input.actionCode) {
    throw new Error("Equipment action not found");
  }
  if ((action.kind ?? "CHARGED") === "STANCE") {
    throw new Error("Equipment stance action is local-only");
  }

  const result = await consumeEquippedEquipmentCharge(
    characterId,
    input.itemId,
    action.chargeCost,
    action.maxCharges,
    {
      session: input.dbSession,
      ...(item.equipmentActions ? { actionCode: action.code } : {}),
      ammunitionCost: action.consumesRegularAmmo ?? 0,
    },
  );
  return {
    ok: result.ok,
    currentCharges: result.current,
  };
}

async function resolveConsumptionSessionTitle(
  session: NochichimConsumptionSessionContext | undefined,
): Promise<string | null> {
  const fallbackTitle = session?.sessionTitle?.trim() || null;
  const sessionId = session?.sessionId?.trim();
  if (!sessionId) return fallbackTitle;

  const sessionDoc = await findSessionById(sessionId).catch((error) => {
    console.warn("[nochichim] failed to resolve session for consume notification", {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  });

  return sessionDoc?.title?.trim() || fallbackTitle;
}

async function notifyConsumableUsed(input: {
  characterId: string;
  characterCodename: string;
  ownerId: string | null;
  itemName: string;
  quantity: number;
  remaining: number;
  session?: NochichimConsumptionSessionContext;
}): Promise<void> {
  if (!input.ownerId) return;

  const sessionTitle = await resolveConsumptionSessionTitle(input.session);

  await notifyUser({
    userId: input.ownerId,
    type: "CONSUMABLE_USED",
    title: `${input.itemName} 사용이 기록되었습니다`,
    message: [
      `${input.characterCodename} · ${input.itemName} x${input.quantity}`,
      sessionTitle ? `세션: ${sessionTitle}` : "세션: 미지정",
      `잔여 ${input.remaining}`,
      "노치찜 연동",
    ].join(" · "),
    link: input.characterId
      ? `/erp/inventory/${input.characterId}`
      : "/erp/notifications",
  });
}

export async function notifyCharacterConsumableUsed(input: {
  characterId: string;
  characterCodename: string;
  ownerId: string | null;
  itemName: string;
  quantity: number;
  remaining: number;
  session?: NochichimConsumptionSessionContext;
}): Promise<void> {
  await notifyConsumableUsed({
    characterId: input.characterId,
    characterCodename: input.characterCodename,
    ownerId: input.ownerId,
    itemName: input.itemName,
    quantity: input.quantity,
    remaining: input.remaining,
    session: input.session,
  });
}

export async function consumeCharacterConsumable(input: {
  characterId: string;
  itemId: string;
  quantity: number;
  dbSession: ClientSession;
}): Promise<{
  ok: boolean;
  remaining: number;
  outcomes: MrBeastSodaConsumptionOutcome[];
  committedCharacterId?: string;
  committedCharacterCodename?: string;
  committedOwnerId?: string | null;
  committedItemName?: string;
}> {
  const character = await findTransactionalAgentCharacterByKey(
    input.characterId,
    input.dbSession,
  );
  if (!character) {
    throw new Error("Character not found");
  }

  const item = (
    await loadMasterItemMap(
      [{ itemId: input.itemId }],
      { session: input.dbSession },
    )
  ).get(input.itemId);

  if (!item || item.category !== "CONSUMABLE") {
    throw new Error("Consumable not found");
  }

  const result = await removeFromInventory(
    objectIdString(character._id),
    input.itemId,
    input.quantity,
    { session: input.dbSession },
  );

  if (!result.ok) {
    return { ok: false, remaining: result.remaining, outcomes: [] };
  }
  return {
    ok: true,
    remaining: result.remaining,
    outcomes: resolveConsumableOutcomes(item.slug, input.quantity),
    committedCharacterId: objectIdString(character._id),
    committedCharacterCodename: character.codename,
    committedOwnerId: character.ownerId,
    committedItemName: item.name,
  };
}
