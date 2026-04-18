/**
 * 컬렉션 접근자 — shared-db로 이전됨 (shim)
 *
 * @deprecated shared-db의 *Col() 함수를 직접 사용하세요.
 */

import "./init";

export {
  usersCol as usersCollection,
  charactersCol as charactersCollection,
  wikiPagesCol as wikiPagesCollection,
  wikiPageRevisionsCol as wikiRevisionsCollection,
  sessionReportsCol as sessionReportsCollection,
  notificationsCol as notificationsCollection,
  creditTransactionsCol as creditTransactionsCollection,
  masterItemsCol as masterItemsCollection,
  characterInventoryCol as inventoryCollection,
} from "@stargate/shared-db";
