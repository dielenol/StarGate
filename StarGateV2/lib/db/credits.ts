/**
 * credits CRUD — shared-db로 이전됨 (shim).
 *
 * Phase 2: user 단위 → character 단위 ledger 전환.
 * `getUserBalance` 는 deprecated (호출 시 throw). 호출처는
 * `findMainCharacterByOwner` + `getCharacterBalance` 로 대체할 것.
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
} from "@stargate/shared-db";
