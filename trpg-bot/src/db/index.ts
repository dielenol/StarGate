/**
 * DB 컬렉션 접근 헬퍼 — shared-db 로 이전됨 (shim)
 *
 * 기존 trpg-bot 의 `sessions / session_responses / session_logs` 컬렉션은
 * registra-bot 과 공유되는 stargate 통합 DB 의 `sessions / session_responses /
 * session_logs` 컬렉션으로 매핑된다. 신규 trpg 도메인 컬렉션
 * (`trpg_sessions` 등)은 Phase 2 에서 호출처가 직접 shared-db API 를 호출.
 *
 * 타입 처리:
 * - 통합 DB의 `Session.status` enum 은 registra 의 CLOSING/CANCELING 까지 포함하나
 *   trpg-bot 의 자체 `Session` 타입은 OPEN/CLOSED/CANCELED 만 사용한다 (registra 가
 *   유일한 상태 전이 주체이므로 trpg-bot 에는 추가 상태가 흘러들지 않는다).
 * - 따라서 컬렉션을 trpg-bot 자체 `Session/SessionResponse/SessionLog` 타입으로
 *   typed 한 뷰로 반환하여 기존 호출처 시그니처를 보존한다.
 *
 * @deprecated 신규 코드는 `@stargate/shared-db` 의 `*Col / *ColSync` 함수를
 * 직접 사용하세요.
 * @module db/index
 */

import type { Collection } from "mongodb";

import type { Session, SessionResponse } from "../types/session.js";
import type { SessionLog } from "../types/session-log.js";

import {
  sessionsColSync,
  sessionResponsesColSync,
  sessionLogsColSync,
} from "@stargate/shared-db";

/**
 * 통합 sessions 컬렉션을 trpg-bot 의 자체 Session 타입으로 typed 한 뷰로 반환한다.
 *
 * unknown 경유 단언으로 좁힘 — shared-db `Session.status` (5단) 와 trpg-bot
 * `Session.status` (3단) 의 enum 차이를 흡수한다. registra 만 사용하는 상태
 * (CLOSING/CANCELING) 는 trpg-bot 도메인에 진입하지 않는다.
 */
export function sessionsCollection(): Collection<Session> {
  return sessionsColSync() as unknown as Collection<Session>;
}

/** 통합 session_responses 컬렉션을 trpg-bot 의 자체 타입으로 typed 한 뷰. */
export function responsesCollection(): Collection<SessionResponse> {
  return sessionResponsesColSync() as unknown as Collection<SessionResponse>;
}

/** 통합 session_logs 컬렉션을 trpg-bot 의 자체 타입으로 typed 한 뷰. */
export function sessionLogsCollection(): Collection<SessionLog> {
  return sessionLogsColSync() as unknown as Collection<SessionLog>;
}
