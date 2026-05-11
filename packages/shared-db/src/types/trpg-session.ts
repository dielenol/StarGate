/**
 * trpg-bot 세션 도메인 타입 정의
 *
 * 기존 `Session` (registra-bot 공유) 와 별개. trpg-bot 단독 운영 컬렉션
 * `trpg_sessions` 에 적재되며, 일정 채널/메시지/응답 수집 모델이 아니라
 * DM 알림 + 24h 리마인드 모델을 따른다.
 *
 * 입력 페이로드(`CreateTrpgSessionInput`, `UpdateTrpgSessionPatch`) 는
 * `schemas/trpg-session.schema.ts` 에서 Zod 스키마 + `z.infer` 로 단일 출처 관리.
 *
 * @module types/trpg-session
 */

import type { ObjectId } from "mongodb";

/** trpg 세션 상태: open(접수 중) / cancelled(취소) */
export type TrpgSessionStatus = "open" | "cancelled";

/** DB 에 저장되는 trpg 세션 문서 */
export interface TrpgSession {
  _id?: ObjectId;
  guildId: string;
  /** 1-100자 제목 */
  title: string;
  /** 진행 날짜 (KST 기준, YYYY-MM-DD) */
  date: string;
  /** 시작 시각 (24h, HH:mm) */
  startTime: string;
  createdByDiscordId: string;
  createdByUsername: string;
  /** 참가자 디스코드 ID 목록 (비어있을 수 있음) */
  participantDiscordIds: string[];
  status: TrpgSessionStatus;

  /** 생성 알림 발송 완료 시각 */
  notificationSentAt?: Date | null;
  /** 생성 알림 발송권 선점 만료 시각 */
  notificationClaimLeaseUntil?: Date | null;

  /** 24h 리마인드 발송 완료 시각 */
  reminderSentAt?: Date | null;
  /** 24h 리마인드 발송권 선점 만료 시각 */
  reminderClaimLeaseUntil?: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

/* ── 결과 union ──
   `updateTrpgSession` / `cancelTrpgSession` 가 단순 null 대신 실패 사유까지
   구분해 반환한다. 호출처(슬래시 커맨드 응답) 가 "찾을 수 없음" vs "권한 없음"
   vs "이미 닫힘" 을 서로 다른 사용자 메시지로 매핑할 수 있도록 한다. */

export type UpdateTrpgSessionResult =
  | { kind: "updated"; session: TrpgSession }
  | { kind: "not-found" }
  | { kind: "forbidden" }
  | { kind: "not-open" };

export type CancelTrpgSessionResult =
  | { kind: "cancelled" }
  | { kind: "not-found" }
  | { kind: "forbidden" }
  | { kind: "already-cancelled" };
