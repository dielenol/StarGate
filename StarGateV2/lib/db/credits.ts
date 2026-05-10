/**
 * credits CRUD — shared-db로 이전됨 (shim).
 *
 * Phase 2: user 단위 → character 단위 ledger 전환.
 * `getUserBalance` 는 deprecated (호출 시 throw). 호출처는
 * `findMainCharacterByOwner` + `getCharacterBalance` 로 대체할 것.
 *
 * Phase 3: GM 운영 대시보드용 집계/필터 함수 포함.
 * - `sumLatestBalancesByCharacterIds` / `getCreditsActivity24h` — KPI
 * - `listCreditTransactionsFiltered` / `countCreditTransactionsFiltered` — 검색
 * - `findTransactionsBySessionMetadata` — 세션 자동 보상 멱등 검출
 */

import "./init";

export {
  listCreditTransactions,
  getCharacterBalance,
  createCreditTransaction,
  findTransactionById,
  addCredit,
  /** @deprecated — character 단위 전환됨. 호출 시 throw. */
  getUserBalance,
  // Phase 3 — GM 운영 대시보드.
  sumLatestBalancesByCharacterIds,
  getCreditsActivity24h,
  listCreditTransactionsFiltered,
  countCreditTransactionsFiltered,
  findTransactionsBySessionMetadata,
} from "@stargate/shared-db";
