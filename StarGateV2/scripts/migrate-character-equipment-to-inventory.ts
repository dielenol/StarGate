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
const SIGNATURE_WEAPON_REPAIR = process.argv.includes(
  "--signature-weapon-repair",
);

const SIGNATURE_WEAPON_REPAIR_TARGETS = new Map<string, string>([
  ["악식의 콘치타", "TIGER298"],
  ["CMMG Mk.47 Mutant (N.O.S.B Mod.)", "네베드"],
  ["택티컬 클레이모어", "네베드"],
]);

/**
 * 기존 시트의 고유 명칭을 현재 병기부 카탈로그의 표준 보급 장비에 대응한다.
 * exact-name 항목은 아래 표 없이 기존 이름 그대로 매칭된다.
 * 공개 시트 호환표(`lib/equipment/public-equipment.ts`)와 함께 갱신한다.
 */
const LEGACY_DEFAULT_ITEM_SLUG = new Map<string, string>([
  [
    "보급형 구식 전술 도검 & 경량 티타늄 합금 방패",
    "old-tactical-sword-titanium-shield",
  ],
  ["보급형 사냥용 소총", "basic-assault-rifle"],
  ["보급형 공격 방패", "basic-assault-shield"],
  ["악식의 콘치타", "conchita-of-gluttony"],
  ["CMMG Mk.47 Mutant (N.O.S.B Mod.)", "cmmg-mk47-mutant-nosb-mod"],
  ["택티컬 클레이모어", "tactical-claymore"],
]);

/** 새 고유 장비가 등록되기 전에 임시 지급했던 표준 장비 slug. */
const REPLACED_DEFAULT_ITEM_SLUG = new Map<string, string>([
  [
    "보급형 구식 전술 도검 & 경량 티타늄 합금 방패",
    "basic-longsword",
  ],
  ["보급형 공격 방패", "basic-blunt-weapon"],
  ["악식의 콘치타", "basic-dagger"],
  ["CMMG Mk.47 Mutant (N.O.S.B Mod.)", "basic-assault-rifle"],
  ["택티컬 클레이모어", "basic-longsword"],
]);

const LEGACY_ALIAS_TARGET_SLUGS = Array.from(
  new Set(LEGACY_DEFAULT_ITEM_SLUG.values()),
);

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
  action:
    | "grant-and-equip"
    | "equip-existing"
    | "replace-default"
    | "already-equipped"
    | "already-owned"
    | "conflict";
  existingInventory?: CharacterInventory | null;
  currentSlotItemId?: string;
  replacedItemId?: string;
  replacedInventory?: CharacterInventory | null;
  desiredEquippedSlot?: EquipmentSlot;
  inventoryRowConflict?: {
    targetCount: number;
    replacedCount: number;
  };
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
        {
          type: "AGENT",
          "play.equipment.0": { $exists: true },
          ...(SIGNATURE_WEAPON_REPAIR
            ? {
                codename: {
                  $in: Array.from(
                    new Set(SIGNATURE_WEAPON_REPAIR_TARGETS.values()),
                  ),
                },
              }
            : {}),
        },
        { projection: { codename: 1, type: 1, play: 1 } },
      )
      .toArray(),
    masters
      .find({
        category: { $in: ["WEAPON", "ARMOR"] },
        isPublic: { $ne: false },
        $or: [
          { isAvailable: { $ne: false } },
          { slug: { $in: LEGACY_ALIAS_TARGET_SLUGS } },
        ],
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
  const inventoryByCharacterItem = new Map<string, CharacterInventory[]>();
  for (const entry of inventoryRows) {
    const key = `${entry.characterId}:${entry.itemId}`;
    const rows = inventoryByCharacterItem.get(key) ?? [];
    rows.push(entry);
    inventoryByCharacterItem.set(key, rows);
  }
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
      const signatureOwner = SIGNATURE_WEAPON_REPAIR_TARGETS.get(legacy.name);
      if (signatureOwner && signatureOwner !== character.codename) {
        continue;
      }
      if (
        SIGNATURE_WEAPON_REPAIR &&
        signatureOwner !== character.codename
      ) {
        continue;
      }
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
      const existingRows =
        inventoryByCharacterItem.get(`${characterId}:${itemId}`) ?? [];
      const existing = existingRows[0];
      const slotKey = `${characterId}:${slot}`;
      const current = claimedSlots.get(slotKey);
      const replacedDefaultSlug = REPLACED_DEFAULT_ITEM_SLUG.get(legacy.name);
      const replacedDefault = replacedDefaultSlug
        ? masterBySlug.get(replacedDefaultSlug)
        : undefined;
      const replacedItemId = replacedDefault?._id
        ? String(replacedDefault._id)
        : undefined;
      const replacedInventoryRows = replacedItemId
        ? inventoryByCharacterItem.get(`${characterId}:${replacedItemId}`) ?? []
        : [];
      const replacedInventory = replacedInventoryRows[0];
      const inventoryRowConflict =
        existingRows.length > 1 || replacedInventoryRows.length > 1;
      const replacementSlotConflict =
        Boolean(replacedInventory?.equippedSlot) &&
        (replacedInventory?.equippedSlot !== slot ||
          (Boolean(current) && current?.itemId !== replacedItemId));
      const action =
        inventoryRowConflict
          ? "conflict"
          : replacedInventory && existing
          ? "conflict"
          : replacementSlotConflict
            ? "conflict"
            : replacedInventory
              ? "replace-default"
              : current?.itemId === itemId
                ? "already-equipped"
                : existing && !current
                  ? "equip-existing"
                  : existing
                    ? "already-owned"
                    : current
                      ? "conflict"
                      : "grant-and-equip";
      const desiredEquippedSlot =
        action === "replace-default"
          ? replacedInventory?.equippedSlot
          : action === "grant-and-equip" || action === "equip-existing"
            ? slot
            : undefined;
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
        ...(action === "replace-default" && replacedItemId
          ? { replacedItemId }
          : {}),
        ...(action === "replace-default"
          ? { replacedInventory: replacedInventory ?? null }
          : {}),
        ...(desiredEquippedSlot ? { desiredEquippedSlot } : {}),
        ...(inventoryRowConflict
          ? {
              inventoryRowConflict: {
                targetCount: existingRows.length,
                replacedCount: replacedInventoryRows.length,
              },
            }
          : {}),
      });
      if (
        (action === "grant-and-equip" ||
          action === "equip-existing" ||
          action === "replace-default") &&
        desiredEquippedSlot
      ) {
        claimedSlots.set(`${characterId}:${desiredEquippedSlot}`, { itemId });
      }
    }
  }

  const grenade = await masters.findOne({ slug: "military-fragment-grenade" });
  const grenadeNeedsCorrection = grenade?.category === "WEAPON";
  const actionable = plans.filter(
    (plan) =>
      plan.action === "grant-and-equip" ||
      plan.action === "equip-existing" ||
      plan.action === "replace-default",
  );

  if (
    SIGNATURE_WEAPON_REPAIR &&
    plans.length !== SIGNATURE_WEAPON_REPAIR_TARGETS.size
  ) {
    throw new Error(
      `고유 장비 복구 대상 불일치: expected=${SIGNATURE_WEAPON_REPAIR_TARGETS.size} actual=${plans.length}`,
    );
  }
  if (
    SIGNATURE_WEAPON_REPAIR &&
    plans.some(
      (plan) =>
        plan.action === "grant-and-equip" || plan.action === "equip-existing",
    )
  ) {
    throw new Error(
      "고유 장비 복구는 기존 보급 장비와의 1:1 교체 또는 재실행 no-op만 허용합니다.",
    );
  }

  console.log(`[character-equipment] mode=${EXECUTE ? "EXECUTE" : "DRY-RUN"}`);
  console.log(
    `[character-equipment] scope=${SIGNATURE_WEAPON_REPAIR ? "SIGNATURE-WEAPON-REPAIR" : "ALL-LEGACY-EQUIPMENT"}`,
  );
  console.log(
    `[character-equipment] matched=${plans.length} actionable=${actionable.length} ` +
      `already=${plans.filter((plan) => plan.action === "already-equipped").length} ` +
      `owned=${plans.filter((plan) => plan.action === "already-owned").length} ` +
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
        `${plan.legacyItemName} -> ${plan.itemName} / ${plan.slot} / ${plan.match} / ` +
        `${plan.desiredEquippedSlot ? "equipped" : "owned"}` +
        (plan.inventoryRowConflict
          ? ` / duplicate target=${plan.inventoryRowConflict.targetCount} replaced=${plan.inventoryRowConflict.replacedCount}`
          : ""),
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
          [
            plan.itemId,
            `@equipment-slot:${plan.slot}`,
            ...(plan.replacedItemId ? [plan.replacedItemId] : []),
          ].map((itemId) => {
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
            const targetRows = await inventory
              .find(
                { characterId: plan.characterId, itemId: plan.itemId },
                { session },
              )
              .toArray();
            const replacedRows = plan.replacedItemId
              ? await inventory
                  .find(
                    {
                      characterId: plan.characterId,
                      itemId: plan.replacedItemId,
                    },
                    { session },
                  )
                  .toArray()
              : [];
            if (targetRows.length > 1 || replacedRows.length > 1) {
              throw new Error(
                `인벤토리 중복 row 감지: ${plan.codename} / target=${targetRows.length} replaced=${replacedRows.length}`,
              );
            }
            const targetInventory = targetRows[0];
            if (
              plan.action === "equip-existing" &&
              (!targetInventory ||
                targetInventory.quantity < 1 ||
                targetInventory.quantity !== plan.existingInventory?.quantity ||
                targetInventory.itemName !== plan.existingInventory?.itemName)
            ) {
              throw new Error(
                `기존 보유 장비 상태 변경 감지: ${plan.codename}`,
              );
            }
            if (targetInventory && targetInventory.quantity < 1) {
              throw new Error(
                `대상 장비 수량 오류: ${plan.codename} / ${plan.itemName}`,
              );
            }

            if (plan.action === "replace-default") {
              if (!plan.replacedItemId || !plan.replacedInventory) {
                throw new Error(
                  `교체 대상 기본 장비 상태 누락: ${plan.codename}`,
                );
              }
              if (targetInventory) {
                throw new Error(
                  `고유 장비 중복 보유 상태 감지: ${plan.codename} / ${plan.itemName}`,
                );
              }
              if (replacedRows.length !== 1) {
                throw new Error(
                  `교체 대상 기본 장비 row 변경 감지: ${plan.codename} / expected=1 actual=${replacedRows.length}`,
                );
              }
              const expectedEquipmentState = plan.replacedInventory.equippedSlot
                ? { equippedSlot: plan.replacedInventory.equippedSlot }
                : { equippedSlot: { $exists: false } };
              const removed = await inventory.deleteMany(
                {
                  characterId: plan.characterId,
                  itemId: plan.replacedItemId,
                  quantity: 1,
                  ...expectedEquipmentState,
                },
                { session },
              );
              if (removed.deletedCount !== 1) {
                throw new Error(
                  `임시 지급 장비 상태 변경 감지: ${plan.codename}`,
                );
              }
            }

            const shouldGrant = !targetInventory;
            const acquiredAt =
              plan.action === "replace-default"
                ? plan.replacedInventory?.acquiredAt ?? now
                : now;
            const grantUpdate = plan.desiredEquippedSlot
              ? {
                  $inc: { quantity: 1 },
                  $set: {
                    equippedSlot: plan.desiredEquippedSlot,
                    equippedAt:
                      plan.replacedInventory?.equippedAt ?? now,
                  },
                  $setOnInsert: {
                    characterId: plan.characterId,
                    characterCodename: plan.codename,
                    itemId: plan.itemId,
                    itemName: plan.itemName,
                    acquiredAt,
                    note: "기존 캐릭터 시트 고유 장비 복구",
                  },
                }
              : {
                  $inc: { quantity: 1 },
                  $setOnInsert: {
                    characterId: plan.characterId,
                    characterCodename: plan.codename,
                    itemId: plan.itemId,
                    itemName: plan.itemName,
                    acquiredAt,
                    note: "기존 캐릭터 시트 고유 장비 복구",
                  },
                };
            const result =
              shouldGrant
                ? await inventory.updateOne(
                    { characterId: plan.characterId, itemId: plan.itemId },
                    grantUpdate,
                    { upsert: true, session },
                  )
                : await inventory.updateOne(
                    {
                      characterId: plan.characterId,
                      itemId: plan.itemId,
                      quantity: { $gte: 1 },
                    },
                    {
                      $set: {
                        equippedSlot: plan.desiredEquippedSlot ?? plan.slot,
                        equippedAt: now,
                      },
                    },
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

    const verification = await Promise.all(
      actionable.map(async (plan) => {
        const [targetRows, replacedRows] = await Promise.all([
          inventory
            .find({ characterId: plan.characterId, itemId: plan.itemId })
            .toArray(),
          plan.replacedItemId
            ? inventory
                .find({
                  characterId: plan.characterId,
                  itemId: plan.replacedItemId,
                })
                .toArray()
            : Promise.resolve([]),
        ]);
        const target = targetRows[0];
        const expectedAcquiredAt =
          plan.action === "replace-default"
            ? plan.replacedInventory?.acquiredAt
            : undefined;
        const expectedEquippedAt = plan.desiredEquippedSlot
          ? plan.replacedInventory?.equippedAt
          : undefined;
        const expectedQuantity =
          plan.action === "equip-existing"
            ? plan.existingInventory?.quantity
            : 1;
        const expectedItemName =
          plan.action === "equip-existing"
            ? plan.existingInventory?.itemName
            : plan.itemName;
        const acquiredAtMatches =
          !expectedAcquiredAt ||
          target?.acquiredAt?.getTime() === expectedAcquiredAt.getTime();
        const equippedAtMatches =
          !expectedEquippedAt ||
          target?.equippedAt?.getTime() === expectedEquippedAt.getTime();
        const equippedStateMatches = plan.desiredEquippedSlot
          ? target?.equippedSlot === plan.desiredEquippedSlot
          : !target?.equippedSlot && !target?.equippedAt;
        if (
          targetRows.length !== 1 ||
          replacedRows.length !== 0 ||
          target?.quantity !== expectedQuantity ||
          target?.itemName !== expectedItemName ||
          !equippedStateMatches ||
          !acquiredAtMatches ||
          !equippedAtMatches
        ) {
          throw new Error(
              `이관 검증 실패: ${plan.codename} / targetRows=${targetRows.length} ` +
              `replacedRows=${replacedRows.length} quantity=${target?.quantity ?? "missing"}/${expectedQuantity ?? "missing"} ` +
              `equipped=${target?.equippedSlot ?? "none"} acquiredAt=${acquiredAtMatches} ` +
              `equippedAt=${equippedAtMatches}`,
          );
        }
        return target;
      }),
    );
    console.log(
      `[character-equipment] execute 완료. verified=${verification.length}`,
    );
  }
} finally {
  await client.close();
}
