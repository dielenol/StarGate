/**
 * 기존 characters.play.equipment 중 master_items 이름과 정확히 일치하는 장비를
 * character_inventory WEAPON/ARMOR 슬롯으로 이관한다.
 *
 * 기본은 dry-run. 실제 쓰기는 --execute --yes를 함께 전달해야 한다.
 * play.equipment 원본은 삭제하지 않으며, 미매핑 항목은 보고만 한다.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { MongoClient, MongoServerError, ObjectId } from "mongodb";

import type {
  AgentCharacter,
  CharacterInventory,
  EquipmentSlot,
  MasterItem,
} from "@stargate/shared-db/types";

const EXECUTE = process.argv.includes("--execute");
const YES = process.argv.includes("--yes");
const CORRECT_GRENADE = process.argv.includes("--correct-grenade");

/**
 * 기존 시트의 고유 명칭을 현재 병기부 카탈로그의 표준 보급 장비에 대응한다.
 * exact-name 항목은 아래 표 없이 기존 이름 그대로 매칭된다.
 */
const LEGACY_DEFAULT_ITEM_SLUG = new Map<string, string>([
  [
    "보급형 구식 전술 도검 & 경량 티타늄 합금 방패",
    "basic-longsword",
  ],
  ["보급형 사냥용 소총", "basic-assault-rifle"],
  ["보급형 공격 방패", "basic-blunt-weapon"],
  ["악식의 콘치타", "basic-dagger"],
  ["CMMG Mk.47 Mutant (N.O.S.B Mod.)", "basic-assault-rifle"],
]);

if (EXECUTE && !YES) {
  throw new Error("실행 모드는 --execute --yes를 함께 전달해야 합니다.");
}

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI 환경변수가 필요합니다.");

const dbName = process.env.DB_NAME ?? "stargate";
const client = new MongoClient(uri, { maxPoolSize: 2 });
await client.connect();

interface MigrationPlan {
  characterId: string;
  codename: string;
  legacyItemName: string;
  itemId: string;
  itemName: string;
  slot: EquipmentSlot;
  match: "exact-name" | "default-alias";
  action: "grant-and-equip" | "equip-existing" | "already-equipped" | "conflict";
  existingInventory?: CharacterInventory | null;
  currentSlotItemId?: string;
}

interface CharacterInventoryLock {
  _id: string;
  characterId: string;
  itemId: string;
  updatedAt: Date;
  version?: number;
}

function slotForMaster(master: MasterItem): EquipmentSlot | null {
  if (master.category === "WEAPON") return "WEAPON";
  if (master.category === "ARMOR") return "ARMOR";
  return null;
}

try {
  const db = client.db(dbName);
  const characters = db.collection<AgentCharacter>("characters");
  const masters = db.collection<MasterItem>("master_items");
  const inventory = db.collection<CharacterInventory>("character_inventory");
  const inventoryLocks = db.collection<CharacterInventoryLock>(
    "character_inventory_locks",
  );

  const [agents, masterItems, inventoryRows] = await Promise.all([
    characters
      .find(
        { type: "AGENT", "play.equipment.0": { $exists: true } },
        { projection: { codename: 1, type: 1, play: 1 } },
      )
      .toArray(),
    masters
      .find({
        category: { $in: ["WEAPON", "ARMOR"] },
        isAvailable: { $ne: false },
        isPublic: { $ne: false },
      })
      .toArray(),
    inventory.find({}).toArray(),
  ]);

  const masterByName = new Map(masterItems.map((item) => [item.name, item]));
  const masterBySlug = new Map(
    masterItems
      .filter((item) => item.slug)
      .map((item) => [item.slug as string, item]),
  );
  const inventoryByCharacterItem = new Map(
    inventoryRows.map((entry) => [
      `${entry.characterId}:${entry.itemId}`,
      entry,
    ]),
  );
  const equippedByCharacterSlot = new Map(
    inventoryRows
      .filter((entry) => entry.equippedSlot)
      .map((entry) => [
        `${entry.characterId}:${entry.equippedSlot}`,
        entry,
      ]),
  );
  const claimedSlots = new Map(
    Array.from(equippedByCharacterSlot, ([key, entry]) => [
      key,
      { itemId: entry.itemId },
    ]),
  );

  const plans: MigrationPlan[] = [];
  const unmapped: Array<{ codename: string; itemName: string }> = [];

  for (const character of agents) {
    const characterId = String(character._id);
    for (const legacy of character.play.equipment) {
      const exactMaster = masterByName.get(legacy.name);
      const aliasSlug = LEGACY_DEFAULT_ITEM_SLUG.get(legacy.name);
      const master =
        exactMaster ?? (aliasSlug ? masterBySlug.get(aliasSlug) : undefined);
      const slot = master ? slotForMaster(master) : null;
      if (!master?._id || !slot) {
        unmapped.push({ codename: character.codename, itemName: legacy.name });
        continue;
      }

      const itemId = String(master._id);
      const existing = inventoryByCharacterItem.get(`${characterId}:${itemId}`);
      const slotKey = `${characterId}:${slot}`;
      const current = claimedSlots.get(slotKey);
      const action =
        current?.itemId === itemId
          ? "already-equipped"
          : current
            ? "conflict"
            : existing
              ? "equip-existing"
              : "grant-and-equip";
      plans.push({
        characterId,
        codename: character.codename,
        legacyItemName: legacy.name,
        itemId,
        itemName: master.name,
        slot,
        match: exactMaster ? "exact-name" : "default-alias",
        action,
        existingInventory: existing ?? null,
        ...(current?.itemId ? { currentSlotItemId: current.itemId } : {}),
      });
      if (!current && (action === "grant-and-equip" || action === "equip-existing")) {
        claimedSlots.set(slotKey, { itemId });
      }
    }
  }

  const grenade = await masters.findOne({ slug: "military-fragment-grenade" });
  const grenadeNeedsCorrection = grenade?.category === "WEAPON";
  const actionable = plans.filter(
    (plan) =>
      plan.action === "grant-and-equip" || plan.action === "equip-existing",
  );

  console.log(`[character-equipment] mode=${EXECUTE ? "EXECUTE" : "DRY-RUN"}`);
  console.log(
    `[character-equipment] matched=${plans.length} actionable=${actionable.length} ` +
      `already=${plans.filter((plan) => plan.action === "already-equipped").length} ` +
      `conflicts=${plans.filter((plan) => plan.action === "conflict").length} ` +
      `unmapped=${unmapped.length}`,
  );
  console.log(
    `[character-equipment] grenadeCategory=${grenade?.category ?? "missing"} ` +
      `correction=${
        grenadeNeedsCorrection
          ? CORRECT_GRENADE
            ? "requested"
            : "required-not-requested"
          : "none"
      }`,
  );

  for (const plan of plans) {
    console.log(
      `[character-equipment] ${plan.action} ${plan.codename} / ` +
        `${plan.legacyItemName} -> ${plan.itemName} / ${plan.slot} / ${plan.match}`,
    );
  }
  for (const entry of unmapped) {
    console.warn(
      `[character-equipment] unmapped ${entry.codename} / ${entry.itemName}`,
    );
  }

  if (!EXECUTE) {
    console.log("[character-equipment] dry-run 완료. DB는 변경되지 않았습니다.");
  } else {
    if (plans.some((plan) => plan.action === "conflict")) {
      throw new Error("기존 장착 슬롯 충돌이 있어 실행을 중단합니다.");
    }

    await inventory.createIndex(
      { characterId: 1, equippedSlot: 1 },
      {
        name: "character_inventory_equipped_slot_unique",
        unique: true,
        partialFilterExpression: { equippedSlot: { $type: "string" } },
      },
    );
    console.log(
      "[character-equipment] required index=character_inventory_equipped_slot_unique",
    );

    const backupDir = resolve(process.cwd(), "tmp", "equipment-migration");
    mkdirSync(backupDir, { recursive: true });
    const backupPath = resolve(
      backupDir,
      `before-${new Date().toISOString().replaceAll(":", "-")}.json`,
    );
    writeFileSync(
      backupPath,
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          plans,
          unmapped,
          grenade,
        },
        null,
        2,
      ),
    );
    console.log(`[character-equipment] backup=${backupPath}`);

    const lockAnchors = Array.from(
      new Map(
        actionable.flatMap((plan) =>
          [plan.itemId, `@equipment-slot:${plan.slot}`].map((itemId) => {
            const _id = `${plan.characterId}:${itemId}`;
            return [
              _id,
              {
                _id,
                characterId: plan.characterId,
                itemId,
              },
            ] as const;
          }),
        ),
      ).values(),
    ).sort((a, b) => a._id.localeCompare(b._id));

    for (const anchor of lockAnchors) {
      try {
        await inventoryLocks.updateOne(
          { _id: anchor._id },
          {
            $set: {
              characterId: anchor.characterId,
              itemId: anchor.itemId,
              updatedAt: new Date(),
            },
          },
          { upsert: true },
        );
      } catch (error) {
        if (!(error instanceof MongoServerError) || error.code !== 11000) {
          throw error;
        }
        await inventoryLocks.updateOne(
          { _id: anchor._id },
          {
            $set: {
              characterId: anchor.characterId,
              itemId: anchor.itemId,
              updatedAt: new Date(),
            },
          },
        );
      }
    }

    if (actionable.length > 0) {
      const session = client.startSession();
      try {
        await session.withTransaction(async () => {
          for (const anchor of lockAnchors) {
            const result = await inventoryLocks.updateOne(
              { _id: anchor._id },
              {
                $set: { updatedAt: new Date() },
                $inc: { version: 1 },
              },
              { session },
            );
            if (result.matchedCount !== 1) {
              throw new Error(`인벤토리 lock anchor 누락: ${anchor._id}`);
            }
          }

          for (const plan of actionable) {
            const now = new Date();
            const result =
              plan.action === "grant-and-equip"
                ? await inventory.updateOne(
                    { characterId: plan.characterId, itemId: plan.itemId },
                    {
                      $inc: { quantity: 1 },
                      $set: { equippedSlot: plan.slot, equippedAt: now },
                      $setOnInsert: {
                        characterId: plan.characterId,
                        characterCodename: plan.codename,
                        itemId: plan.itemId,
                        itemName: plan.itemName,
                        acquiredAt: now,
                        note: "기존 캐릭터 시트 장비 이관",
                      },
                    },
                    { upsert: true, session },
                  )
                : await inventory.updateOne(
                    {
                      characterId: plan.characterId,
                      itemId: plan.itemId,
                      quantity: { $gte: 1 },
                    },
                    { $set: { equippedSlot: plan.slot, equippedAt: now } },
                    { session },
                  );
            if (result.matchedCount + result.upsertedCount !== 1) {
              throw new Error(
                `장비 이관 대상 변경 감지: ${plan.codename} / ${plan.itemName}`,
              );
            }
          }
        });
      } finally {
        await session.endSession();
      }
    }

    if (CORRECT_GRENADE && grenadeNeedsCorrection && grenade?._id) {
      await masters.updateOne(
        { _id: new ObjectId(String(grenade._id)), category: "WEAPON" },
        { $set: { category: "CONSUMABLE", updatedAt: new Date() } },
      );
    }

    const verification =
      actionable.length === 0
        ? []
        : await inventory
            .find({
              $or: actionable.map((plan) => ({
                characterId: plan.characterId,
                itemId: plan.itemId,
                equippedSlot: plan.slot,
                quantity: { $gte: 1 },
              })),
            })
            .toArray();
    if (verification.length !== actionable.length) {
      throw new Error(
        `이관 검증 실패: expected=${actionable.length} actual=${verification.length}`,
      );
    }
    console.log(
      `[character-equipment] execute 완료. verified=${verification.length}`,
    );
  }
} finally {
  await client.close();
}
