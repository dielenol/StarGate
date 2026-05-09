/**
 * 시스템 발급 ledger entry 의 표준 actor 식별자.
 *
 * `addCredit` 의 `createdById` 는 ObjectId hex 24-char 형식으로 검증되므로
 * 시스템(자동 환불, 봇 발급 등) 호출 시 임의 문자열("SYSTEM")을 사용하면 형식 위반.
 *
 * 다른 시스템 발급처와 동일 sentinel:
 * - `tia_bot/scripts/migrate_credits_to_mongo.py:38`
 * - `packages/shared-db/scripts/restore-character-owner.ts:307`
 */

export const SYSTEM_USER_ID_SENTINEL = "000000000000000000000001";

/** 자동 환불 ledger 의 createdByName 표준 라벨. */
export const SYSTEM_REFUND_NAME = "SYSTEM_REFUND";
