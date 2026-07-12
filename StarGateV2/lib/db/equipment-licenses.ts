import "server-only";

import {
  characterInventoryCol,
  lockCharacterInventoryItems,
  prepareCharacterInventoryItemLocks,
  type CharacterInventory,
} from "@stargate/shared-db";
import type { ClientSession } from "mongodb";

import "./init";

import {
  isTowaskiLicenseSlug,
  type TowaskiLicenseSlug,
} from "@/lib/equipment-shop/licenses";

import {
  findMasterItemBySlug,
  findMasterItemsBySlugsOrIds,
  listCharacterInventory,
} from "./inventory";

async function resolveTowaskiLicenseItem(licenseSlug: TowaskiLicenseSlug) {
  const item = await findMasterItemBySlug(licenseSlug);
  if (!item?._id || item.slug !== licenseSlug) {
    throw new Error(`토와스키 라이선스 마스터 품목 누락: ${licenseSlug}`);
  }
  return item;
}

export async function findOwnedTowaskiLicense(
  characterId: string,
  licenseSlug: TowaskiLicenseSlug,
  options: { session?: ClientSession } = {},
): Promise<CharacterInventory | null> {
  const item = await findMasterItemBySlug(licenseSlug);
  if (!item?._id) return null;

  const col = await characterInventoryCol();
  return col.findOne(
    {
      characterId,
      itemId: String(item._id),
      quantity: { $gt: 0 },
    },
    { session: options.session },
  );
}

export async function hasOwnedTowaskiLicense(
  characterId: string,
  licenseSlug: TowaskiLicenseSlug,
  options: { session?: ClientSession } = {},
): Promise<boolean> {
  return Boolean(
    await findOwnedTowaskiLicense(characterId, licenseSlug, options),
  );
}

export async function listOwnedTowaskiLicenseSlugs(
  characterId: string,
): Promise<Set<TowaskiLicenseSlug>> {
  const inventory = await listCharacterInventory(characterId);
  const masterItems = await findMasterItemsBySlugsOrIds(
    inventory
      .filter((entry) => entry.quantity > 0)
      .map((entry) => entry.itemId),
  );

  return new Set(
    masterItems
      .map((item) => item.slug)
      .filter(isTowaskiLicenseSlug),
  );
}

export async function prepareTowaskiLicenseGrant(
  characterId: string,
  licenseSlug: TowaskiLicenseSlug,
): Promise<void> {
  const item = await resolveTowaskiLicenseItem(licenseSlug);
  await prepareCharacterInventoryItemLocks(characterId, [String(item._id)]);
}

export async function grantTowaskiLicenseOnce(args: {
  characterId: string;
  characterCodename: string;
  licenseSlug: TowaskiLicenseSlug;
  note: string;
}, options: { session: ClientSession }): Promise<{
  entry: CharacterInventory;
  granted: boolean;
}> {
  const item = await resolveTowaskiLicenseItem(args.licenseSlug);
  const itemId = String(item._id);
  const col = await characterInventoryCol();
  const acquiredAt = new Date();

  await lockCharacterInventoryItems(
    args.characterId,
    [itemId],
    options.session,
  );

  const result = await col.updateOne(
    { characterId: args.characterId, itemId },
    {
      $max: { quantity: 1 },
      $setOnInsert: {
        characterId: args.characterId,
        characterCodename: args.characterCodename,
        itemId,
        itemName: item.name,
        acquiredAt,
        note: args.note,
      },
    },
    { upsert: true, session: options.session },
  );

  const entry = await col.findOne(
    { characterId: args.characterId, itemId },
    { session: options.session },
  );
  if (!entry) {
    throw new Error("토와스키 라이선스 지급 결과를 확인할 수 없습니다.");
  }

  return {
    entry,
    granted: result.upsertedCount > 0 || result.modifiedCount > 0,
  };
}
