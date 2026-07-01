/**
 * 크레딧 트랜잭션 유형 메타데이터 + 클라이언트-안전 상수.
 *
 * 사용자 페이지(`/erp/credits`) 와 GM 운영 페이지(`/erp/admin/credits`) 의
 * 트랜잭션 로그 표가 공통으로 사용한다. 단일 출처 — 새로운 트랜잭션 타입 추가 시
 * 본 파일만 수정하면 두 표 라벨/톤이 동시에 갱신된다.
 *
 * tone 값은 UI Tag primitive 의 TagTone 과 1:1.
 *
 * 작전풀 상수(OPERATION_POOL_*) 도 함께 재선언 — `lib/db/credit-pools.ts` 가
 * server-only 모듈("./init" 사이드이펙트로 mongodb 끌고 옴)이라 client component 가
 * 직접 import 시 클라이언트 번들에 mongodb 가 들어가는 문제를 회피.
 * shared-db 의 동일 상수와 값이 일치해야 한다 (변경 시 양쪽 동시).
 */

import type { CreditTransactionType } from "@/types/credit";

export const CREDIT_TYPE_META: Record<
  CreditTransactionType,
  { label: string; tone: "gold" | "info" | "success" | "danger" | "default" }
> = {
  SESSION_REWARD: { label: "세션 보상", tone: "success" },
  PURCHASE: { label: "구매", tone: "info" },
  ADMIN_GRANT: { label: "관리자 지급", tone: "gold" },
  ADMIN_DEDUCT: { label: "관리자 차감", tone: "danger" },
  DAILY_ALLOWANCE: { label: "일일 수당", tone: "gold" },
  TRANSFER: { label: "이체", tone: "default" },
  STOCK_BUY: { label: "주식 매수", tone: "info" },
  STOCK_SELL: { label: "주식 매도", tone: "info" },
  OP_GRANT: { label: "작전풀 지급", tone: "gold" },
  OP_DEDUCT: { label: "작전풀 차감", tone: "danger" },
  MIGRATION: { label: "마이그레이션 (1회성)", tone: "info" },
};

/* ── 작전풀 상수 (클라이언트-안전) ── */

/** shared-db 의 OPERATION_POOL_ID 와 동일 값. */
export const OPERATION_POOL_ID = "OPERATION" as const;

/** shared-db 의 OPERATION_POOL_DEFAULT_NAME 과 동일 값. */
export const OPERATION_POOL_DEFAULT_NAME = "작전 크레딧 풀" as const;

/** shared-db 의 OPERATION_POOL_INITIAL_BALANCE 와 동일 값. */
export const OPERATION_POOL_INITIAL_BALANCE = 400 as const;
