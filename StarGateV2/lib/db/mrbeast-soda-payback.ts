import { createHash } from "node:crypto";

import {
  MongoServerError,
  type ClientSession,
  type Collection,
} from "mongodb";

import { getDb } from "@stargate/shared-db";

import { grantMrBeastLotteryTickets } from "@/lib/db/mrbeast-lottery";
import {
  MRBEAST_APOLOGY_LOTTERY_PRIZE_TABLE_VERSION,
  MRBEAST_APOLOGY_LOTTERY_SLUG,
  MRBEAST_SODA_SLUG,
} from "@/lib/shop/mrbeast-lottery";
import {
  calculateMrBeastSodaApologyPayback,
  isMrBeastSodaApologyPaybackDateEligible,
  MRBEAST_SODA_APOLOGY_PAYBACK_CAMPAIGN_ID,
  MRBEAST_SODA_APOLOGY_PAYBACK_END_KST_DATE,
  MRBEAST_SODA_APOLOGY_PAYBACK_START_KST_DATE,
} from "@/lib/shop/mrbeast-soda-payback";

const PAYBACK_COLLECTION = "shop_mrbeast_soda_payback_claims";
const DAILY_COUNTERS_COLLECTION = "shop_daily_purchase_counters";
const NOTIFICATIONS_COLLECTION = "notifications";

export type MrBeastSodaPaybackStatus =
  | "INELIGIBLE"
  | "ELIGIBLE"
  | "CLAIMED";

export interface MrBeastSodaPaybackDto {
  status: MrBeastSodaPaybackStatus;
  purchasedQuantity: number;
  rewardQuantity: number;
  claimedAt: string | null;
}

interface MrBeastSodaPaybackDoc {
  _id: string;
  campaignId: typeof MRBEAST_SODA_APOLOGY_PAYBACK_CAMPAIGN_ID;
  userId: string;
  fenceVersion: number;
  createdAt: Date;
  updatedAt: Date;
  claimedAt?: Date;
  characterId?: string;
  purchasedQuantity?: number;
  rewardQuantity?: number;
  sourceRequestId?: string;
}

interface MrBeastSodaDailyCounter {
  userId: string;
  slug: string;
  kstDate: string;
  purchasedQuantity: number;
}

interface MrBeastSodaCheckoutLedgerRow {
  ownerId: string;
  amount: number;
  type: string;
  createdAt: Date;
  metadata?: {
    source?: string;
    itemCount?: number;
  };
}

interface PaybackNotification {
  userId: string;
  dedupeKey: string;
  type: "SYSTEM";
  title: string;
  message: string;
  link: string;
  isRead: false;
  createdAt: Date;
}

export type MrBeastSodaPaybackErrorCode =
  | "PAYBACK_NOT_ELIGIBLE"
  | "PAYBACK_INTEGRITY_ERROR";

export class MrBeastSodaPaybackError extends Error {
  readonly code: MrBeastSodaPaybackErrorCode;

  constructor(code: MrBeastSodaPaybackErrorCode, message: string) {
    super(message);
    this.name = "MrBeastSodaPaybackError";
    this.code = code;
  }
}

function paybackId(userId: string): string {
  const digest = createHash("sha256")
    .update(
      JSON.stringify([
        MRBEAST_SODA_APOLOGY_PAYBACK_CAMPAIGN_ID,
        userId,
      ]),
    )
    .digest("hex");
  return `shop-mrbeast-soda-payback:${digest}`;
}

function paybackSourceRequestId(userId: string): string {
  return `${MRBEAST_SODA_APOLOGY_PAYBACK_CAMPAIGN_ID}:${userId}`;
}

async function paybacksCol(): Promise<Collection<MrBeastSodaPaybackDoc>> {
  const db = await getDb();
  return db.collection<MrBeastSodaPaybackDoc>(PAYBACK_COLLECTION);
}

function matchesIdentity(
  document: MrBeastSodaPaybackDoc,
  userId: string,
): boolean {
  return (
    document.userId === userId &&
    document.campaignId === MRBEAST_SODA_APOLOGY_PAYBACK_CAMPAIGN_ID
  );
}

function serializeClaimedPayback(
  document: MrBeastSodaPaybackDoc,
): MrBeastSodaPaybackDto {
  if (
    !(document.claimedAt instanceof Date) ||
    Number.isNaN(document.claimedAt.getTime()) ||
    !Number.isSafeInteger(document.purchasedQuantity) ||
    Number(document.purchasedQuantity) < 0 ||
    !Number.isSafeInteger(document.rewardQuantity) ||
    Number(document.rewardQuantity) < 1
  ) {
    throw new MrBeastSodaPaybackError(
      "PAYBACK_INTEGRITY_ERROR",
      "사죄 복권 페이백 기록의 정합성을 확인할 수 없습니다.",
    );
  }
  return {
    status: "CLAIMED",
    purchasedQuantity: Number(document.purchasedQuantity),
    rewardQuantity: Number(document.rewardQuantity),
    claimedAt: document.claimedAt.toISOString(),
  };
}

async function calculateCurrentPayback(
  userId: string,
  session?: ClientSession,
): Promise<ReturnType<typeof calculateMrBeastSodaApologyPayback>> {
  const db = await getDb();
  const counters = await db
    .collection<MrBeastSodaDailyCounter>(DAILY_COUNTERS_COLLECTION)
    .find(
      {
        userId,
        slug: MRBEAST_SODA_SLUG,
        kstDate: {
          $gte: MRBEAST_SODA_APOLOGY_PAYBACK_START_KST_DATE,
          $lte: MRBEAST_SODA_APOLOGY_PAYBACK_END_KST_DATE,
        },
      },
      {
        projection: { userId: 1, slug: 1, kstDate: 1, purchasedQuantity: 1 },
        session,
      },
    )
    .toArray();

  let purchasedQuantity = 0;
  for (const counter of counters) {
    if (
      counter.userId !== userId ||
      counter.slug !== MRBEAST_SODA_SLUG ||
      !isMrBeastSodaApologyPaybackDateEligible(counter.kstDate) ||
      !Number.isSafeInteger(counter.purchasedQuantity) ||
      counter.purchasedQuantity < 0 ||
      counter.purchasedQuantity > 10 ||
      !Number.isSafeInteger(purchasedQuantity + counter.purchasedQuantity)
    ) {
      throw new MrBeastSodaPaybackError(
        "PAYBACK_INTEGRITY_ERROR",
        "미스터비스트 소다 구매 기록의 정합성을 확인할 수 없습니다.",
      );
    }
    purchasedQuantity += counter.purchasedQuantity;
  }
  return calculateMrBeastSodaApologyPayback(purchasedQuantity);
}

/**
 * 카운터 도입 전 소다 출시 구간에 결제 원장이 있으면 자동 지급을 중단한다.
 * 당시 원장은 line slug/quantity를 저장하지 않아 정확한 수량을 복원할 수 없으므로,
 * 잘못된 0장 지급보다 운영 대조/백필을 요구하는 fail-closed가 안전하다.
 */
async function assertNoAmbiguousPreCounterPurchases(
  userId: string,
  session?: ClientSession,
): Promise<void> {
  const db = await getDb();
  const ambiguous = await db
    .collection<MrBeastSodaCheckoutLedgerRow>("credit_transactions")
    .findOne(
      {
        ownerId: userId,
        type: "PURCHASE",
        createdAt: {
          $gte: new Date("2026-07-29T15:00:00.000Z"),
          // Vercel production deployment dpl_CNPz...가 READY가 된 뒤에도 구 revision의
          // 진행 중 요청이 끝날 수 있어, 보수적인 15분 drain 구간까지 자동 지급을 막는다.
          $lt: new Date("2026-07-31T07:15:36.663Z"),
        },
        "metadata.source": "shop_checkout",
      },
      { projection: { _id: 1 }, session },
    );
  if (ambiguous) {
    throw new MrBeastSodaPaybackError(
      "PAYBACK_INTEGRITY_ERROR",
      "구매 카운터 도입 전 결제 기록이 있어 운영 대조 후 페이백을 받을 수 있습니다.",
    );
  }
}

/** checkout과 claim transaction이 공유할 결정적 사용자 anchor를 준비한다. */
export async function prepareMrBeastSodaPaybackAnchor(
  userId: string,
): Promise<void> {
  const collection = await paybacksCol();
  const _id = paybackId(userId);
  const now = new Date();
  try {
    await collection.updateOne(
      {
        _id,
        campaignId: MRBEAST_SODA_APOLOGY_PAYBACK_CAMPAIGN_ID,
        userId,
      },
      {
        $setOnInsert: {
          fenceVersion: 0,
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

  const prepared = await collection.findOne({ _id });
  if (!prepared || !matchesIdentity(prepared, userId)) {
    throw new MrBeastSodaPaybackError(
      "PAYBACK_INTEGRITY_ERROR",
      "사죄 복권 페이백 잠금 기록의 정합성을 확인할 수 없습니다.",
    );
  }
}

/** 동시 checkout과 claim을 한 사용자 anchor write로 직렬화한다. */
export async function fenceMrBeastSodaPayback(input: {
  userId: string;
  session: ClientSession;
}): Promise<MrBeastSodaPaybackDoc> {
  if (!input.session.inTransaction()) {
    throw new Error("MrBeast soda payback fence requires an active transaction");
  }
  const document = await (await paybacksCol()).findOneAndUpdate(
    {
      _id: paybackId(input.userId),
      campaignId: MRBEAST_SODA_APOLOGY_PAYBACK_CAMPAIGN_ID,
      userId: input.userId,
    },
    {
      $inc: { fenceVersion: 1 },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: "after", session: input.session },
  );
  if (!document || !matchesIdentity(document, input.userId)) {
    throw new MrBeastSodaPaybackError(
      "PAYBACK_INTEGRITY_ERROR",
      "사죄 복권 페이백 잠금 기록을 확인할 수 없습니다.",
    );
  }
  return document;
}

/** GET 전용 상태 조회. anchor를 생성하거나 수정하지 않는다. */
export async function getMrBeastSodaPaybackState(
  userId: string,
): Promise<MrBeastSodaPaybackDto> {
  const existing = await (await paybacksCol()).findOne({
    _id: paybackId(userId),
  });
  if (existing) {
    if (!matchesIdentity(existing, userId)) {
      throw new MrBeastSodaPaybackError(
        "PAYBACK_INTEGRITY_ERROR",
        "사죄 복권 페이백 기록의 소유자를 확인할 수 없습니다.",
      );
    }
    if (existing.claimedAt) return serializeClaimedPayback(existing);
  }

  await assertNoAmbiguousPreCounterPurchases(userId);
  const calculation = await calculateCurrentPayback(userId);
  return {
    status: calculation.rewardQuantity > 0 ? "ELIGIBLE" : "INELIGIBLE",
    ...calculation,
    claimedAt: null,
  };
}

export async function claimMrBeastSodaPayback(input: {
  userId: string;
  characterId: string;
  characterCodename: string;
  ticketItemId: string;
  requestId: string;
  session: ClientSession;
}): Promise<{ state: MrBeastSodaPaybackDto; alreadyClaimed: boolean }> {
  if (!input.session.inTransaction()) {
    throw new Error("MrBeast soda payback claim requires an active transaction");
  }

  const fenced = await fenceMrBeastSodaPayback({
    userId: input.userId,
    session: input.session,
  });
  if (fenced.claimedAt) {
    return { state: serializeClaimedPayback(fenced), alreadyClaimed: true };
  }

  await assertNoAmbiguousPreCounterPurchases(input.userId, input.session);
  const calculation = await calculateCurrentPayback(
    input.userId,
    input.session,
  );
  if (calculation.rewardQuantity < 1) {
    throw new MrBeastSodaPaybackError(
      "PAYBACK_NOT_ELIGIBLE",
      "누적 미스터비스트 소다 구매량이 페이백 기준인 10개에 미달합니다.",
    );
  }
  if (calculation.rewardQuantity > 10_000) {
    throw new MrBeastSodaPaybackError(
      "PAYBACK_INTEGRITY_ERROR",
      "사죄 복권 페이백 수량이 단일 지급 안전 한도를 벗어났습니다.",
    );
  }

  const claimedAt = new Date();
  const claimed = await (await paybacksCol()).findOneAndUpdate(
    {
      _id: fenced._id,
      campaignId: MRBEAST_SODA_APOLOGY_PAYBACK_CAMPAIGN_ID,
      userId: input.userId,
      claimedAt: { $exists: false },
    },
    {
      $set: {
        claimedAt,
        characterId: input.characterId,
        purchasedQuantity: calculation.purchasedQuantity,
        rewardQuantity: calculation.rewardQuantity,
        sourceRequestId: input.requestId,
        updatedAt: claimedAt,
      },
    },
    { returnDocument: "after", session: input.session },
  );
  if (!claimed) {
    const winner = await (await paybacksCol()).findOne(
      { _id: fenced._id },
      { session: input.session },
    );
    if (winner?.claimedAt) {
      return { state: serializeClaimedPayback(winner), alreadyClaimed: true };
    }
    throw new MrBeastSodaPaybackError(
      "PAYBACK_INTEGRITY_ERROR",
      "사죄 복권 페이백 상태를 확정할 수 없습니다.",
    );
  }

  await grantMrBeastLotteryTickets({
    eventId: MRBEAST_SODA_APOLOGY_PAYBACK_CAMPAIGN_ID,
    ticketSlug: MRBEAST_APOLOGY_LOTTERY_SLUG,
    prizeTableVersion: MRBEAST_APOLOGY_LOTTERY_PRIZE_TABLE_VERSION,
    characterId: input.characterId,
    characterCodename: input.characterCodename,
    ticketItemId: input.ticketItemId,
    sourceRequestId: paybackSourceRequestId(input.userId),
    quantity: calculation.rewardQuantity,
    acquiredAt: claimedAt,
    note: `미스터비스트 소다 ${calculation.purchasedQuantity}개 구매 사과 페이백`,
    session: input.session,
  });

  const db = await getDb();
  await db.collection<PaybackNotification>(NOTIFICATIONS_COLLECTION).insertOne(
    {
      userId: input.userId,
      dedupeKey: `${MRBEAST_SODA_APOLOGY_PAYBACK_CAMPAIGN_ID}:${input.userId}`,
      type: "SYSTEM",
      title: "미스터비스트 사죄의 마음 지급",
      message: `${input.characterCodename} · 사죄 복권 ${calculation.rewardQuantity}장 지급 완료`,
      link: "/erp/shop",
      isRead: false,
      createdAt: claimedAt,
    },
    { session: input.session },
  );

  return { state: serializeClaimedPayback(claimed), alreadyClaimed: false };
}
