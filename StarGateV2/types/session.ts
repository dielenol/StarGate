/**
 * 세션 타입 (stargate 통합 DB 호환)
 *
 * registra-bot/src/types/session.ts 와 동일한 구조.
 * StarGateV2에서는 읽기 전용으로 사용.
 */

export type SessionStatus =
  | "OPEN"
  | "CLOSING"
  | "CANCELING"
  | "CLOSED"
  | "CANCELED";

export type ResponseStatus = "YES" | "NO";

export interface Session {
  _id?: string;
  guildId: string;
  channelId: string;
  messageId: string;
  title: string;
  targetDateTime: Date;
  closeDateTime: Date;
  targetRoleId: string;
  status: SessionStatus;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionResponse {
  _id?: string;
  sessionId: string;
  userId: string;
  status: ResponseStatus;
  displayName?: string;
  respondedAt: Date;
  updatedAt: Date;
}
