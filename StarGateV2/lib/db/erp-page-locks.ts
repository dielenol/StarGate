import "server-only";

import { getDb } from "@stargate/shared-db";

import "./init";

import type { ErpPageLockOverrides } from "@/lib/erp/page-lock-policy";

const COLLECTION_NAME = "erp_page_locks";

interface ErpPageLockDocument {
  _id: string;
  locked: boolean;
  updatedAt: Date;
  updatedById: string;
  updatedByName: string;
}

async function pageLocksCollection() {
  const db = await getDb();
  return db.collection<ErpPageLockDocument>(COLLECTION_NAME);
}

export async function getErpPageLockOverrides(): Promise<ErpPageLockOverrides> {
  const collection = await pageLocksCollection();
  const documents = await collection
    .find({}, { projection: { _id: 1, locked: 1 } })
    .toArray();

  return Object.fromEntries(
    documents.map((document) => [document._id, document.locked]),
  );
}

export async function setErpPageLockOverride(args: {
  lockKey: string;
  locked: boolean;
  updatedById: string;
  updatedByName: string;
}): Promise<void> {
  const collection = await pageLocksCollection();
  await collection.updateOne(
    { _id: args.lockKey },
    {
      $set: {
        locked: args.locked,
        updatedAt: new Date(),
        updatedById: args.updatedById,
        updatedByName: args.updatedByName,
      },
    },
    { upsert: true },
  );
}
