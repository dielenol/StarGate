import "server-only";

import { cache } from "react";

import { getDb } from "@stargate/shared-db";

import "./init";

import { applyArmoryBureauSuspensionToLocks } from "@stargate/core/domain/armory-bureau-suspension";

import { getAllNavItems, getNavItemLockKey } from "@/components/erp/nav-config";
import { isArmoryBureauSuspended } from "@/lib/equipment-shop/suspension";
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
      // 키 순서 = 반환 순서 = ETag 해시 입력 — natural order 의존 제거.
      .sort({ _id: 1 })
      .toArray();

    const overrides = Object.fromEntries(
      documents.map((document) => [document._id, document.locked]),
    );
    // 병기부 운영 중지 중에는 DB override 와 무관하게 병기부 경로를 잠금으로 고정한다.
    // 사이드바·Command-K·layout 게이트·구역 결제 가드가 모두 이 결과를 공유한다.
    return applyArmoryBureauSuspensionToLocks(
      overrides,
      getAllNavItems()
        .map(getNavItemLockKey)
        .filter((lockKey): lockKey is string => lockKey !== null),
      isArmoryBureauSuspended(),
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
