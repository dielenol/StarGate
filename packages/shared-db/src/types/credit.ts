import type { ObjectId } from "mongodb";

/**
 * 크레딧 거래 type 상수 배열.
 *
 * - SESSION_REWARD: 세션 보상 지급
 * - PURCHASE: 일반 구매 (캐릭터 인벤토리 구매 등)
 * - ADMIN_GRANT: 관리자 수동 지급
 * - ADMIN_DEDUCT: 관리자 수동 차감
 * - DAILY_ALLOWANCE: 직급별 일일 수당 자동 지급
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
  "DAILY_ALLOWANCE",
  "TRANSFER",
  "STOCK_BUY",
  "STOCK_SELL",
  "OP_GRANT",
  "OP_DEDUCT",
  "MIGRATION",
] as const;
export type CreditTransactionType = (typeof CREDIT_TRANSACTION_TYPES)[number];

/**
 * 웹 API 도메인 전체 화이트리스트 — 웹에서 발생 가능한 모든 거래 타입.
 *
 * 라우트별 실제 게이트는 더 좁은 서브셋(아래 GM_DIRECT_GRANT_TYPES) 으로 분리되어 있다.
 * 본 상수는 도메인 전체 카탈로그(웹에서 거부되지 않는 type) 표시 + UI 메타용.
 *
 * - ADMIN_GRANT / ADMIN_DEDUCT / SESSION_REWARD: GM 운영자가 발생시키는 직접 발급/차감.
 *   → 라우트: /api/erp/credits (POST). 게이트: GM_DIRECT_GRANT_TYPES.
 * - DAILY_ALLOWANCE: Vercel cron 이 발생시키는 직급별 일일 수당.
 *   → 라우트: /api/cron/stocks/tick.
 * - PURCHASE: ERP 편의점 페이지 결제. M2 도입 예정.
 *   → 라우트: /api/erp/shop/* (예정). 자체 가드(재고/잔액/슬롯) 적용.
 * - STOCK_BUY / STOCK_SELL: ERP 주식 페이지 매매. M3 도입 예정.
 *   → 라우트: /api/erp/stocks/* (예정). 자체 가드(보유/시세) 적용.
 */
export const WEB_ALLOWED_CREDIT_TYPES = [
  "ADMIN_GRANT",
  "ADMIN_DEDUCT",
  "SESSION_REWARD",
  "DAILY_ALLOWANCE",
  "PURCHASE",
  "STOCK_BUY",
  "STOCK_SELL",
] as const satisfies readonly CreditTransactionType[];
export type WebAllowedCreditType = (typeof WEB_ALLOWED_CREDIT_TYPES)[number];

/**
 * GM 직접 발급 가능 type (POST /api/erp/credits 가 받는 화이트리스트).
 *
 * USER_INITIATED_TYPES (PURCHASE, STOCK_BUY, STOCK_SELL) 는 본 라우트가 아닌
 * M2/M3 의 도메인 전용 라우트(/api/erp/shop/*, /api/erp/stocks/*)에서 자체 가드.
 * 본 라우트가 모두 받으면 ledger 무결성(재고/시세 검증 우회) 깨짐.
 */
export const GM_DIRECT_GRANT_TYPES = [
  "ADMIN_GRANT",
  "ADMIN_DEDUCT",
  "SESSION_REWARD",
] as const satisfies readonly CreditTransactionType[];
export type GmDirectGrantType = (typeof GM_DIRECT_GRANT_TYPES)[number];

export function isGmDirectGrantType(value: unknown): value is GmDirectGrantType {
  return (
    typeof value === "string" &&
    (GM_DIRECT_GRANT_TYPES as readonly string[]).includes(value)
  );
}

/**
 * 봇 전용 거래 타입 — 웹 API 거부 대상 (tia_bot 에서만 직접 호출).
 * 웹은 read-only 표시.
 *
 * - TRANSFER: 사용자 간 송금 (봇 명령).
 * - OP_GRANT / OP_DEDUCT: 작전 풀 ↔ 사용자 (운영자 봇 명령).
 * - MIGRATION: 1회성 레거시 시드.
 */
export const BOT_ONLY_CREDIT_TYPES = [
  "TRANSFER",
  "OP_GRANT",
  "OP_DEDUCT",
  "MIGRATION",
] as const satisfies readonly CreditTransactionType[];
export type BotOnlyCreditType = (typeof BOT_ONLY_CREDIT_TYPES)[number];

/**
 * 크레딧 ledger 단위 — character 단위로 전환됨 (Phase 2).
 *
 * 정책:
 * - 1인 1 MAIN 캐릭터 강제 (`findMainCharacterByOwner` 가 여러 개 발견 시 throw)
 * - MAIN 캐릭터 미등록 user 는 발급 거절
 * - NPC/MINI 는 ledger 대상 ❌ (AGENT + MAIN tier 만)
 * - `ownerId` 는 GM audit 추적 + owner 단위 조회용 역참조 인덱스
 *
 * 단일 봇 프로세스 + 일반적 웹 mutation 빈도 환경에서 race 영향 적음.
 * mongo transaction 도입은 후속 phase 에서 재검토.
 */
export interface CreditTransaction {
  _id?: ObjectId;

  /** Character._id hex (AGENT/MAIN 만). NPC/MINI 는 ledger 대상 ❌. */
  characterId: string;
  /** Character.codename — UI 표시용 비정규화. */
  characterCodename: string;

  /** User._id hex (소유자 역참조 — GM audit 추적용). character.ownerId 와 같음. */
  ownerId: string;
  /** Discord username 또는 displayName — 표시용 비정규화. */
  ownerName: string;

  type: CreditTransactionType;
  amount: number;
  /** 본 트랜잭션 발생 직후 characterId 단위 잔액 스냅샷. */
  balance: number;

  /**
   * 거래 도메인별 부가 정보 (tia_bot 통합).
   *
   * 사용 패턴:
   * - STOCK_BUY/SELL: { ticker, shares, price, profit? }
   * - DAILY_ALLOWANCE: { dailyAllowance, dailyAllowanceDate, agentLevel }
   * - OP_GRANT/DEDUCT: { poolId }
   * - PURCHASE: { itemId, qty }
   * - TRANSFER: { fromCharacterId, toCharacterId }
   * - MIGRATION: { legacySource: "shop.db" | "sessions.db", legacyId? }
   */
  metadata?: Record<string, string | number | boolean | null>;
  description: string;

  /** 발급자 User._id hex. system 마이그 시 sentinel "000000000000000000000001". */
  createdById: string;
  createdByName: string;
  createdAt: Date;
}

export type CreateCreditTransactionInput = Omit<
  CreditTransaction,
  "_id" | "createdAt"
>;
