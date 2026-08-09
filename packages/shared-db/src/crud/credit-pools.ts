/**
 * credit_pools CRUD
 *
 * tia_bot 의 작전 크레딧 풀 (operation_pool 싱글턴) 을 다중 풀로 일반화.
 * pool 잔액은 mutable 필드 직접 update (이벤트 소싱 아님).
 * 사용자 ledger(credit_transactions) 와는 별개 도메인.
 */

import type { CreditPool } from "../types/index.js";
import type { ClientSession } from "mongodb";

import { creditPoolsCol } from "../collections.js";

/**
 * 풀이 없으면 생성, 있으면 그대로 반환 (멱등).
 */
export async function ensureCreditPool(
  poolId: string,
  name: string,
  initialBalance = 0,
  options: { session?: ClientSession } = {},
): Promise<CreditPool> {
  const col = await creditPoolsCol();
  const now = new Date();
  const result = await col.findOneAndUpdate(
    { poolId },
    {
      $setOnInsert: {
        poolId,
        name,
        balance: initialBalance,
        revision: 0,
        createdAt: now,
        updatedAt: now,
      },
    },
    {
      upsert: true,
      returnDocument: "after",
      session: options.session,
    },
  );
  if (!result) throw new Error(`Credit pool ensure failed: ${poolId}`);
  return result;
}

export async function getCreditPool(
  poolId: string,
  options: { session?: ClientSession } = {},
): Promise<CreditPool | null> {
  const col = await creditPoolsCol();
  return col.findOne({ poolId }, { session: options.session });
}

export async function getAllCreditPools(): Promise<CreditPool[]> {
  const col = await creditPoolsCol();
  return col.find().sort({ poolId: 1 }).toArray();
}

/**
 * 풀 잔액에 delta 를 atomic 하게 더한다.
 *
 * - allowNegative=false (기본): delta 차감 후 balance >= 0 보장.
 *   { poolId, balance: { $gte: -delta } } 가드로 race condition 방지.
 *   잔액 부족 시 Error throw.
 * - allowNegative=true: 가드 없이 그대로 반영.
 *
 * delta>0 인 경우(증액)에는 가드가 항상 통과하므로 영향 없음.
 */
export async function addCreditPoolBalance(
  poolId: string,
  delta: number,
  options?: {
    allowNegative?: boolean;
    maxBalance?: number;
    session?: ClientSession;
  },
): Promise<CreditPool> {
  const col = await creditPoolsCol();
  const allowNegative = options?.allowNegative ?? false;

  const filter: Record<string, unknown> = { poolId };
  if (!allowNegative && delta < 0) {
    filter.balance = { $gte: -delta };
  }
  if (options?.maxBalance !== undefined && delta > 0) {
    filter.balance = { $lte: options.maxBalance - delta };
  }

  const result = await col.findOneAndUpdate(
    filter,
    {
      $inc: { balance: delta, revision: 1 },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: "after", session: options?.session },
  );

  if (!result) {
    // 가드 실패 후 snapshot 시점은 에러 발생 후 — 첫 호출 시점의 잔액과 다를 수 있음 (디버깅 시 참고).
    const snapshot = await col.findOne(
      { poolId },
      { session: options?.session },
    );
    if (!snapshot) {
      throw new Error(`Credit pool not found: ${poolId}`);
    }
    if (
      options?.maxBalance !== undefined &&
      snapshot.balance + delta > options.maxBalance
    ) {
      throw new Error(
        `Pool ${poolId} exceeds maximum balance ${options.maxBalance}`,
      );
    }
    throw new Error(
      `Pool ${poolId} insufficient (snapshot at error time: balance=${snapshot.balance}, requested=${-delta})`,
    );
  }
  return result;
}

/**
 * 풀 잔액을 absolute value 로 atomic 하게 설정한다.
 *
 * 명시적인 GM set 동작용이다. 증감형 경제 동작은 동시 writer의 변경을
 * 보존할 수 있도록 addCreditPoolBalance 를 사용해야 한다.
 */
export async function setCreditPoolBalance(
  poolId: string,
  balance: number,
  options: { expectedRevision: number; session?: ClientSession },
): Promise<CreditPool> {
  const col = await creditPoolsCol();
  const revisionFilter =
    options.expectedRevision === 0
      ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] }
      : { revision: options.expectedRevision };
  const result = await col.findOneAndUpdate(
    { poolId, ...revisionFilter },
    {
      $set: {
        balance,
        updatedAt: new Date(),
      },
      $inc: { revision: 1 },
    },
    { returnDocument: "after", session: options.session },
  );

  if (!result) {
    const current = await col.findOne(
      { poolId },
      { projection: { _id: 1 }, session: options.session },
    );
    if (!current) throw new Error(`Credit pool not found: ${poolId}`);
    throw new CreditPoolVersionConflictError(poolId);
  }
  return result;
}

export class CreditPoolVersionConflictError extends Error {
  constructor(readonly poolId: string) {
    super(`Credit pool changed since it was read: ${poolId}`);
    this.name = "CreditPoolVersionConflictError";
  }
}
