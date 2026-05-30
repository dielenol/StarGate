import "@/lib/db/init";

import { getDb } from "@stargate/shared-db";

import { isShopOpen } from "@/lib/shop/catalog";

const COLLECTION_NAME = "shop_runtime_state";
const OPEN_STATE_ID = "open-state";

export type ShopOpenMode = "auto" | "open" | "closed";

interface ShopOpenStateDoc {
  _id: typeof OPEN_STATE_ID;
  forceOpen: boolean;
  forceClosed?: boolean;
  updatedAt: Date;
  updatedById: string;
  updatedByName: string;
}

export interface ShopOpenState {
  mode: ShopOpenMode;
  scheduledOpen: boolean;
  forceOpen: boolean;
  forceClosed: boolean;
  isOpen: boolean;
  updatedAt: Date | null;
  updatedById: string | null;
  updatedByName: string | null;
}

interface SetShopOpenModeInput {
  mode: ShopOpenMode;
  updatedById: string;
  updatedByName: string;
  now?: Date;
}

async function shopOpenStateCol() {
  const db = await getDb();
  return db.collection<ShopOpenStateDoc>(COLLECTION_NAME);
}

function toOpenState(
  doc: ShopOpenStateDoc | null,
  now: Date,
): ShopOpenState {
  const scheduledOpen = isShopOpen(now);
  const forceOpen = doc?.forceOpen === true;
  const forceClosed = doc?.forceClosed === true;
  const mode: ShopOpenMode = forceClosed
    ? "closed"
    : forceOpen
      ? "open"
      : "auto";

  return {
    mode,
    scheduledOpen,
    forceOpen,
    forceClosed,
    isOpen: !forceClosed && (scheduledOpen || forceOpen),
    updatedAt: doc?.updatedAt ?? null,
    updatedById: doc?.updatedById ?? null,
    updatedByName: doc?.updatedByName ?? null,
  };
}

export async function getShopOpenState(
  now: Date = new Date(),
): Promise<ShopOpenState> {
  const doc = await (await shopOpenStateCol()).findOne({ _id: OPEN_STATE_ID });
  return toOpenState(doc, now);
}

export async function setShopOpenMode({
  mode,
  updatedById,
  updatedByName,
  now = new Date(),
}: SetShopOpenModeInput): Promise<ShopOpenState> {
  const forceOpen = mode === "open";
  const forceClosed = mode === "closed";

  await (await shopOpenStateCol()).updateOne(
    { _id: OPEN_STATE_ID },
    {
      $set: {
        forceOpen,
        forceClosed,
        updatedAt: now,
        updatedById,
        updatedByName,
      },
    },
    { upsert: true },
  );

  return getShopOpenState(now);
}
