import { ObjectId, type ClientSession } from "mongodb";

import "@/lib/db/init";
import { findSessionById } from "@/lib/db/sessions";
import { applyEquipmentAbilityOverrides } from "@/lib/equipment/equipment-ability-overrides";
import { mergePublicEquipment } from "@/lib/equipment/public-equipment";
import { notifyUser } from "@/lib/notifications/events";
import { getConsumableItemImageSrc } from "@/lib/shop/item-images";
import { stripDossierPersonalityObservations } from "@/lib/personnel";

import {
  findCharacterByCodename,
  findCharacterById,
  listSharedInventory,
  listAgentCharacters,
  listCharacterInventory,
  masterItemsCol,
  sharedInventoryCol,
  consumeEquippedEquipmentCharge,
  removeFromInventory,
  type Ability,
  type AgentCharacter,
  type Character,
  type CharacterInventory,
  type MasterItem,
} from "@stargate/shared-db";

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
  actionCost: number;
  chargeCost: number;
  currentCharges: number;
  maxCharges: number;
  reloadCreditCost: number;
  reloadApproval: "GM";
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
  const character = await findAgentCharacterByKey(input.characterId);
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

async function loadCharacterEquippedState(characterId: string) {
  const inventory = (await listCharacterInventory(characterId)).filter(
    (entry) => entry.quantity > 0,
  );
  const equippedInventory = inventory.filter((entry) =>
    Boolean(entry.equippedSlot),
  );
  const itemMap = await loadMasterItemMap(inventory);

  const equipmentActions: NochichimEquipmentActionSnapshot[] =
    equippedInventory.flatMap((entry) => {
      const item = itemMap.get(entry.itemId);
      const action = item?.equipmentAction;
      const charge = entry.equipmentCharge;
      if (!item || !action || !charge || !entry._id) return [];
      return [{
        itemId: entry.itemId,
        inventoryEntryId: objectIdString(entry._id),
        itemName: item.name || entry.itemName,
        code: action.code,
        name: action.name,
        description: action.description,
        effect: action.effect,
        actionCost: action.actionCost,
        chargeCost: action.chargeCost,
        currentCharges: charge.current,
        maxCharges: charge.maximum,
        reloadCreditCost: action.reloadCreditCost,
        reloadApproval: action.reloadApproval,
      }];
    });
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

  return { equipmentActions, masterSources };
}

export async function loadCharacterEquipmentActions(
  characterId: string,
): Promise<NochichimEquipmentActionSnapshot[]> {
  return (await loadCharacterEquippedState(characterId)).equipmentActions;
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
  const { equipmentActions, masterSources } = equippedState;
  const play = character.play;
  const abilities = applyEquipmentAbilityOverrides(
    play.abilities,
    masterSources,
  );
  const equipment = mergePublicEquipment({
    inventoryEntries: masterSources,
    legacyEquipment: play.equipment,
    includePrivate: true,
  }).map((entry) => ({
    ...entry,
    ...(entry.price === "" ? { price: undefined } : { price: String(entry.price) }),
  }));
  const effectivePlay = { ...play, abilities, equipment };
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
      equipmentActions,
    },
    consumables,
  };
}

export async function consumeCharacterEquipmentAction(input: {
  characterId: string;
  itemId: string;
  actionCode: string;
}): Promise<{
  ok: boolean;
  currentCharges: number;
  equipmentActions: NochichimEquipmentActionSnapshot[];
}> {
  const character = await findAgentCharacterByKey(input.characterId);
  if (!character) throw new Error("Character not found");
  const characterId = objectIdString(character._id);
  const item = (await loadMasterItemMap([
    { itemId: input.itemId },
  ])).get(input.itemId);
  const action = item?.equipmentAction;
  if (!item || !action || action.code !== input.actionCode) {
    throw new Error("Equipment action not found");
  }

  const result = await consumeEquippedEquipmentCharge(
    characterId,
    input.itemId,
    action.chargeCost,
    action.maxCharges,
  );
  return {
    ok: result.ok,
    currentCharges: result.current,
    equipmentActions: await loadCharacterEquipmentActions(characterId),
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
  character: AgentCharacter;
  item: MasterItem;
  quantity: number;
  remaining: number;
  session?: NochichimConsumptionSessionContext;
}): Promise<void> {
  if (!input.character.ownerId) return;

  const characterId = objectIdString(input.character._id);
  const itemName = input.item.name || "소모품";
  const sessionTitle = await resolveConsumptionSessionTitle(input.session);

  await notifyUser({
    userId: input.character.ownerId,
    type: "CONSUMABLE_USED",
    title: `${itemName} 사용이 기록되었습니다`,
    message: [
      `${input.character.codename} · ${itemName} x${input.quantity}`,
      sessionTitle ? `세션: ${sessionTitle}` : "세션: 미지정",
      `잔여 ${input.remaining}`,
      "노치찜 연동",
    ].join(" · "),
    link: characterId ? `/erp/inventory/${characterId}` : "/erp/notifications",
  });
}

export async function consumeCharacterConsumable(input: {
  characterId: string;
  itemId: string;
  quantity: number;
  session?: NochichimConsumptionSessionContext;
}): Promise<{
  ok: boolean;
  remaining: number;
  consumables: NochichimConsumableSnapshot[];
}> {
  const character = await findAgentCharacterByKey(input.characterId);
  if (!character) {
    throw new Error("Character not found");
  }

  const item = (await loadMasterItemMap([
    { itemId: input.itemId },
  ])).get(input.itemId);

  if (!item || item.category !== "CONSUMABLE") {
    throw new Error("Consumable not found");
  }

  const result = await removeFromInventory(
    input.characterId,
    input.itemId,
    input.quantity,
  );

  if (result.ok) {
    await notifyConsumableUsed({
      character,
      item,
      quantity: input.quantity,
      remaining: result.remaining,
      session: input.session,
    });
  }

  return {
    ok: result.ok,
    remaining: result.remaining,
    consumables: await loadCharacterConsumables(input.characterId),
  };
}
