/**
 * DB 컬렉션 접근 헬퍼
 *
 * sessions, session_responses 컬렉션을 반환합니다.
 * @module db/index
 */

import { getClient } from "./client.js";
import type { Session, SessionResponse } from "../types/session.js";

const DB_NAME = "trpg_bot";
const SESSIONS_COLLECTION = "sessions";
const RESPONSES_COLLECTION = "session_responses";

/**
 * sessions 컬렉션을 반환합니다.
 */
export function sessionsCollection() {
  return getClient().db(DB_NAME).collection<Session>(SESSIONS_COLLECTION);
}

/**
 * session_responses 컬렉션을 반환합니다.
 */
export function responsesCollection() {
  return getClient().db(DB_NAME).collection<SessionResponse>(RESPONSES_COLLECTION);
}
