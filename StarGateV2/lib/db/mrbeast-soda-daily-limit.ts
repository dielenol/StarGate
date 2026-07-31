import { createHash } from "node:crypto";

import {
  MongoServerError,
  type ClientSession,
  type Collection,
} from "mongodb";

import "./init";

import { getDb } from "@stargate/shared-db";

import {
  isMrBeastSodaDailyPurchaseAllowed,
  MRBEAST_SODA_DAILY_PURCHASE_LIMIT,
  MrBeastSodaDailyLimitError,
  type MrBeastSodaDailyPurchaseKey,
} from "../shop/mrbeast-soda-daily-limit";

interface MrBeastSodaDailyPurchaseCounter
  extends MrBeastSodaDailyPurchaseKey {
  _id: string;
  purchasedQuantity: number;
  createdAt: Date;
  updatedAt: Date;
}

function counterId(key: MrBeastSodaDailyPurchaseKey): string {
  const digest = createHash("sha256")
    .update(JSON.stringify([key.userId, key.kstDate, key.slug]))
    .digest("hex");
  return `shop-daily-purchase:${digest}`;
}

async function countersCol(): Promise<
  Collection<MrBeastSodaDailyPurchaseCounter>
> {
  const db = await getDb();
  return db.collection<MrBeastSodaDailyPurchaseCounter>(
    "shop_daily_purchase_counters",
  );
}

function matchesKey(
  counter: MrBeastSodaDailyPurchaseCounter,
  key: MrBeastSodaDailyPurchaseKey,
): boolean {
  return (
    counter.userId === key.userId &&
    counter.kstDate === key.kstDate &&
    counter.slug === key.slug
  );
}

/**
 * transaction 전에 사용자·KST 일자·상품별 단일 counter anchor를 준비한다.
 *
 * 결정적 `_id`의 기본 인덱스만 사용하므로 별도 index가 필요하지 않다. 최초
 * 동시 upsert의 E11000은 승자 문서를 재조회해 같은 key인지 확인한다.
 */
export async function prepareMrBeastSodaDailyPurchaseCounter(
  key: MrBeastSodaDailyPurchaseKey,
): Promise<void> {
  const counters = await countersCol();
  const _id = counterId(key);
  const now = new Date();
  try {
    await counters.updateOne(
      { _id, userId: key.userId, kstDate: key.kstDate, slug: key.slug },
      {
        $setOnInsert: {
          purchasedQuantity: 0,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true },
    );
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11000) {
      throw error;
    }
  }

  const prepared = await counters.findOne({ _id });
  if (!prepared || !matchesKey(prepared, key)) {
    throw new Error("MRBEAST_SODA_DAILY_COUNTER_INTEGRITY");
  }
}

/**
 * checkout transaction 안에서 오늘 누적량이 10 이하인 경우에만 원자 증가한다.
 *
 * 사전 준비된 단일 문서에 대한 조건부 write라 동일 사용자·일자·slug의 동시
 * checkout은 MongoDB document write conflict로 직렬화된다.
 */
export async function incrementMrBeastSodaDailyPurchaseCounter(input: {
  key: MrBeastSodaDailyPurchaseKey;
  quantity: number;
  session: ClientSession;
}): Promise<void> {
  if (!input.session.inTransaction()) {
    throw new Error(
      "MrBeast soda daily purchase counter requires an active transaction",
    );
  }
  if (!isMrBeastSodaDailyPurchaseAllowed(0, input.quantity)) {
    throw new RangeError("Invalid MrBeast soda purchase quantity");
  }

  const counters = await countersCol();
  const remainingBeforePurchase =
    MRBEAST_SODA_DAILY_PURCHASE_LIMIT - input.quantity;
  const result = await counters.updateOne(
    {
      _id: counterId(input.key),
      userId: input.key.userId,
      kstDate: input.key.kstDate,
      slug: input.key.slug,
      purchasedQuantity: { $gte: 0, $lte: remainingBeforePurchase },
    },
    {
      $inc: { purchasedQuantity: input.quantity },
      $set: { updatedAt: new Date() },
    },
    { session: input.session },
  );
  if (result.matchedCount === 1) return;

  const existing = await counters.findOne(
    { _id: counterId(input.key) },
    { session: input.session },
  );
  if (
    !existing ||
    !matchesKey(existing, input.key) ||
    !Number.isSafeInteger(existing.purchasedQuantity) ||
    existing.purchasedQuantity < 0 ||
    existing.purchasedQuantity > MRBEAST_SODA_DAILY_PURCHASE_LIMIT
  ) {
    throw new Error("MRBEAST_SODA_DAILY_COUNTER_INTEGRITY");
  }
  throw new MrBeastSodaDailyLimitError();
}
