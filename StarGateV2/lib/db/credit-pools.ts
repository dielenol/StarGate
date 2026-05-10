/**
 * credit_pools CRUD — shared-db로 위임 (shim).
 *
 * /erp/admin/credits 의 OP 풀 운영용. 봇과 동일 도메인 — ledger 트랜잭션은 별개
 * (풀 잔액 직접 조정만, ledger 엔트리 미생성).
 */

import "./init";

export type { CreditPool } from "@stargate/shared-db";

export {
  OPERATION_POOL_ID,
  OPERATION_POOL_DEFAULT_NAME,
  OPERATION_POOL_INITIAL_BALANCE,
  ensureCreditPool,
  getCreditPool,
  getAllCreditPools,
  addCreditPoolBalance,
} from "@stargate/shared-db";
