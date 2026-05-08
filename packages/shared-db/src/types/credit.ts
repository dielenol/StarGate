import type { ObjectId } from "mongodb";

/**
 * 크레딧 거래 type 상수 배열.
 *
 * - SESSION_REWARD: 세션 보상 지급
 * - PURCHASE: 일반 구매 (캐릭터 인벤토리 구매 등)
 * - ADMIN_GRANT: 관리자 수동 지급
 * - ADMIN_DEDUCT: 관리자 수동 차감
 * - TRANSFER: 사용자 간 송금
 * - STOCK_BUY: 주식 매수 (tia_bot 통합)
 * - STOCK_SELL: 주식 매도 (tia_bot 통합)
 * - OP_GRANT: 작전 크레딧 풀 → 사용자 지급 (tia_bot 통합)
 * - OP_DEDUCT: 사용자 → 작전 크레딧 풀 차감 (tia_bot 통합)
 * - MIGRATION: tia_bot 레거시 데이터 마이그레이션 시드 (1회성)
 */
export const CREDIT_TRANSACTION_TYPES = [
  "SESSION_REWARD",
  "PURCHASE",
  "ADMIN_GRANT",
  "ADMIN_DEDUCT",
  "TRANSFER",
  "STOCK_BUY",
  "STOCK_SELL",
  "OP_GRANT",
  "OP_DEDUCT",
  "MIGRATION",
] as const;
export type CreditTransactionType = (typeof CREDIT_TRANSACTION_TYPES)[number];

/**
 * 웹 API (POST /api/erp/credits) 화이트리스트.
 * 운영자가 ERP UI 에서 직접 발생시킬 수 있는 거래 타입만 포함.
 */
export const WEB_ALLOWED_CREDIT_TYPES = [
  "ADMIN_GRANT",
  "ADMIN_DEDUCT",
  "SESSION_REWARD",
] as const satisfies readonly CreditTransactionType[];
export type WebAllowedCreditType = (typeof WEB_ALLOWED_CREDIT_TYPES)[number];

/**
 * 봇 전용 거래 타입 — 웹 API 거부 대상 (tia_bot 에서만 직접 호출).
 * 웹은 read-only 표시.
 */
export const BOT_ONLY_CREDIT_TYPES = [
  "PURCHASE",
  "TRANSFER",
  "STOCK_BUY",
  "STOCK_SELL",
  "OP_GRANT",
  "OP_DEDUCT",
  "MIGRATION",
] as const satisfies readonly CreditTransactionType[];

export interface CreditTransaction {
  _id?: ObjectId;
  userId: string;
  userName: string;
  characterId?: string;
  characterCodename?: string;
  type: CreditTransactionType;
  amount: number;
  balance: number;
  /**
   * 거래 도메인별 부가 정보 (tia_bot 통합).
   * Phase 1A 에서는 자유 키-값 (boolean/null 포함). Phase 1B 에서 도메인별 union 타입 검토.
   *
   * 사용 패턴 (Phase 1B/1C 에서 채택 예정):
   * - STOCK_BUY/SELL: { ticker, shares, price, profit? }
   * - OP_GRANT/DEDUCT: { poolId }
   * - PURCHASE: { itemId, qty }
   * - TRANSFER: { fromUserId, toUserId }
   * - MIGRATION: { legacySource: "shop.db" | "sessions.db", legacyId? }
   */
  metadata?: Record<string, string | number | boolean | null>;
  description: string;
  createdById: string;
  createdByName: string;
  createdAt: Date;
}

export type CreateCreditTransactionInput = Omit<
  CreditTransaction,
  "_id" | "createdAt"
>;
