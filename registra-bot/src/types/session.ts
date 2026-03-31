/**
 * 등록 일정(Session)·응답 데이터 타입 (내부 모델명은 기존 `Session` 유지)
 *
 * @module types/session
 */

/** 일정 상태: OPEN(접수 중), CLOSED(마감), CANCELED(취소) */
export type SessionStatus = "OPEN" | "CLOSED" | "CANCELED";

/** 가용 여부: YES(가용), NO(불가) */
export type ResponseStatus = "YES" | "NO";

/** DB에 저장되는 등록 일정 문서 */
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
  /** 배정 24시간 전 리마인드(가용 YES 멘션) 발송 여부 */
  sessionStartReminder24hSent?: boolean;
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
