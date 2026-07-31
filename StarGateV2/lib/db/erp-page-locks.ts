import "server-only";

import { cache } from "react";

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

// cache()는 같은 RSC 렌더 패스의 layout+page 중복 조회를 1회로 합친다 (API 라우트에서는 무해).
export const getErpPageLockOverrides = cache(
  async (): Promise<ErpPageLockOverrides> => {
    const collection = await pageLocksCollection();
    const documents = await collection
      .find({}, { projection: { _id: 1, locked: 1 } })
      .toArray();

    return Object.fromEntries(
      documents.map((document) => [document._id, document.locked]),
    );
  },
);

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
