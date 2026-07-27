import "server-only";

import {
  characterInventoryCol,
  lockCharacterInventoryItems,
  masterItemsCol,
  prepareCharacterInventoryItemLocks,
  type CharacterInventory,
} from "@stargate/shared-db";
import type { ClientSession } from "mongodb";

import "./init";

import {
  isTowaskiLicenseSlug,
  TOWASKI_LICENSE_ITEMS,
  type TowaskiLicenseSlug,
} from "@/lib/equipment-shop/licenses";
import {
  isTowaskiAdvancedLicenseSlug,
  resolveTowaskiLicenseQualificationStatus,
  type TowaskiLicenseQualificationStatus,
} from "@/lib/equipment-shop/license-qualification";

import {
  findMasterItemBySlug,
  findMasterItemsBySlugsOrIds,
  listCharacterInventory,
} from "./inventory";

async function resolveTowaskiLicenseItem(
  licenseSlug: TowaskiLicenseSlug,
  options: { session?: ClientSession } = {},
) {
  const item = options.session
    ? await (await masterItemsCol()).findOne(
        { slug: licenseSlug },
        { session: options.session },
      )
    : await findMasterItemBySlug(licenseSlug);
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
  const item = options.session
    ? await (await masterItemsCol()).findOne(
        { slug: licenseSlug },
        { session: options.session },
      )
    : await findMasterItemBySlug(licenseSlug);
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

export async function getTowaskiLicenseQualificationStatus(
  characterId: string,
  licenseSlug: TowaskiLicenseSlug,
  options: { session?: ClientSession; now?: Date } = {},
): Promise<TowaskiLicenseQualificationStatus> {
  const entry = await findOwnedTowaskiLicense(characterId, licenseSlug, {
    session: options.session,
  });
  return resolveTowaskiLicenseQualificationStatus({
    licenseSlug,
    entry,
    now: options.now,
  });
}

export interface TowaskiLicenseAccessSnapshot {
  ownedLicenseSlugs: Set<TowaskiLicenseSlug>;
  activeLicenseSlugs: Set<TowaskiLicenseSlug>;
  qualificationStatuses: Partial<
    Record<TowaskiLicenseSlug, TowaskiLicenseQualificationStatus>
  >;
}

export function emptyTowaskiLicenseAccess(): TowaskiLicenseAccessSnapshot {
  return {
    ownedLicenseSlugs: new Set<TowaskiLicenseSlug>(),
    activeLicenseSlugs: new Set<TowaskiLicenseSlug>(),
    qualificationStatuses: {},
  };
}

export async function listTowaskiLicenseAccess(
  characterId: string,
  now = new Date(),
): Promise<TowaskiLicenseAccessSnapshot> {
  const inventory = await listCharacterInventory(characterId);
  const masterItems = await findMasterItemsBySlugsOrIds(
    inventory
      .filter((entry) => entry.quantity > 0)
      .map((entry) => entry.itemId),
  );
  const slugByItemId = new Map(
    masterItems
      .filter((item) => item._id && isTowaskiLicenseSlug(item.slug))
      .map((item) => [String(item._id), item.slug as TowaskiLicenseSlug]),
  );
  const entryBySlug = new Map<TowaskiLicenseSlug, CharacterInventory>();
  for (const entry of inventory) {
    const slug = slugByItemId.get(entry.itemId);
    if (slug && entry.quantity > 0) entryBySlug.set(slug, entry);
  }

  const ownedLicenseSlugs = new Set<TowaskiLicenseSlug>();
  const activeLicenseSlugs = new Set<TowaskiLicenseSlug>();
  const qualificationStatuses: TowaskiLicenseAccessSnapshot["qualificationStatuses"] =
    {};
  for (const license of TOWASKI_LICENSE_ITEMS) {
    const status = resolveTowaskiLicenseQualificationStatus({
      licenseSlug: license.slug,
      entry: entryBySlug.get(license.slug) ?? null,
      now,
    });
    qualificationStatuses[license.slug] = status;
    if (status.owned) ownedLicenseSlugs.add(license.slug);
    if (status.grantsPurchaseAccess) activeLicenseSlugs.add(license.slug);
  }
  return {
    ownedLicenseSlugs,
    activeLicenseSlugs,
    qualificationStatuses,
  };
}

export async function listOwnedTowaskiLicenseSlugs(
  characterId: string,
): Promise<Set<TowaskiLicenseSlug>> {
  return (await listTowaskiLicenseAccess(characterId)).ownedLicenseSlugs;
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
  programVersion?: number;
}, options: { session: ClientSession }): Promise<{
  entry: CharacterInventory;
  granted: boolean;
}> {
  const item = await resolveTowaskiLicenseItem(args.licenseSlug, options);
  const itemId = String(item._id);
  const col = await characterInventoryCol();
  const acquiredAt = new Date();
  const renewalDueAt =
    args.programVersion === 1 &&
    isTowaskiAdvancedLicenseSlug(args.licenseSlug)
      ? new Date(acquiredAt.getTime() + 30 * 86_400_000)
      : undefined;

  await lockCharacterInventoryItems(
    args.characterId,
    [itemId],
    options.session,
  );

  const result = await col.updateOne(
    { characterId: args.characterId, itemId },
    {
      $max: { quantity: 1 },
      ...(args.programVersion
        ? {
            $set: {
              licenseQualification: {
                authority: "TOWASKI" as const,
                programVersion: args.programVersion,
                qualifiedAt: acquiredAt,
                ...(renewalDueAt ? { renewalDueAt } : {}),
              },
            },
          }
        : {}),
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
