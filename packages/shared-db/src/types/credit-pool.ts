import type { ObjectId } from "mongodb";

/**
 * 작전 크레딧 풀 (또는 향후 EVENT_POOL 등 다중 풀).
 * tia_bot의 operation_pool 싱글턴을 다중 문서로 일반화.
 *
 * - poolId: 'OPERATION', 'EVENT_2026_05' 등 풀 식별자 (unique)
 * - balance: 풀의 현재 잔액 스냅샷 (mutable, 이벤트 소싱 아님)
 */
export interface CreditPool {
  _id?: ObjectId;
  poolId: string;
  name: string;
  balance: number;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateCreditPoolInput = Omit<
  CreditPool,
  "_id" | "createdAt" | "updatedAt"
>;

/**
 * 작전 크레딧 풀의 표준 식별자.
 * tia_bot 의 `operation_pool` 싱글턴과 1:1 매핑.
 */
export const OPERATION_POOL_ID = "OPERATION" as const;

/**
 * 작전 크레딧 풀 부트스트랩 시 초기 잔액 (tia_bot 운영 합의값).
 */
export const OPERATION_POOL_INITIAL_BALANCE = 400 as const;
