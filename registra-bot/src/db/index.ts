/**
 * DB 컬렉션 접근 헬퍼 — shared-db로 이전됨 (shim)
 *
 * @deprecated shared-db의 *Col/*ColSync 함수를 직접 사용하세요.
 */

export {
  sessionsColSync as sessionsCollection,
  sessionResponsesColSync as responsesCollection,
  sessionLogsColSync as sessionLogsCollection,
} from "@stargate/shared-db";
