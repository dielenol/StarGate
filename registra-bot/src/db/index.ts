/**
 * DB 컬렉션 접근 헬퍼
 *
 * sessions, session_responses 컬렉션을 반환합니다.
 * @module db/index
 */

import { config } from "../config.js";
import { getClient } from "./client.js";
import type { Session, SessionResponse } from "../types/session.js";
import type { SessionLog } from "../types/session-log.js";

const DB_NAME = config.mongoDbName;
const SESSIONS_COLLECTION = "sessions";
const RESPONSES_COLLECTION = "session_responses";
const SESSION_LOGS_COLLECTION = "session_logs";

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

/**
 * session_logs 컬렉션을 반환합니다.
 */
export function sessionLogsCollection() {
  return getClient().db(DB_NAME).collection<SessionLog>(SESSION_LOGS_COLLECTION);
}
