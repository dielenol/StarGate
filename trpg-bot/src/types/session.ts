/**
 * 세션 및 응답 데이터 타입 정의
 *
 * 플랜 6장 데이터 모델 기준.
 * @module types/session
 */

/** 세션 상태: OPEN(응답 수집 중), CLOSED(마감), CANCELED(취소) */
export type SessionStatus = "OPEN" | "CLOSED" | "CANCELED";

/** 참여 응답 상태: YES(참석), NO(불참) */
export type ResponseStatus = "YES" | "NO";

/** DB에 저장되는 세션 문서 */
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

/** DB에 저장되는 응답 문서 */
export interface SessionResponse {
  _id?: string;
  sessionId: string;
  userId: string;
  status: ResponseStatus;
  /** 응답 시점의 디스코드 표시명 (서버 닉네임 우선, 없으면 유저명) */
  displayName?: string;
  respondedAt: Date;
  updatedAt: Date;
}

/** 집계 수 (임베드 갱신용) */
export interface ResponseCounts {
  yes: number;
  no: number;
}
