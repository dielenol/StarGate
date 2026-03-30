/**
 * 세션 운영 로그 타입
 *
 * @module types/session-log
 */

export type SessionLogType =
  | "CREATED"
  | "CLOSED"
  | "FORCE_CLOSED"
  | "CANCELED"
  /** 응답 마감 일시 변경 (구 영문 슬래시 extend) */
  | "EXTENDED"
  /** 세션 진행 일시 변경 */
  | "SESSION_TARGET_UPDATED"
  /** 세션 시작 24시간 전 · 참석(YES) 응답자 대상 */
  | "REMINDER_SESSION_START_24H"
  /** 구버전 로그 호환 */
  | "REMINDER_24H"
  | "REMINDER_3H";

/** session_logs 컬렉션 문서 */
export interface SessionLog {
  _id?: string;
  sessionId: string;
  type: SessionLogType;
  userId?: string;
  payload?: Record<string, unknown>;
  createdAt: Date;
}
