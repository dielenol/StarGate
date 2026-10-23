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

/** 리마인드 슬롯: 시작 24시간 전 / 시작 1시간 전 */
export type TrpgReminderSlot = "24h" | "1h";

/**
 * 리마인드 회차 — claim/mark 필터에 넣는 스냅샷.
 * 발송 중 재일정되면 mark 가 불일치해 lease 만 해제되고 다음 tick 이 새 회차를 처리한다.
 */
export interface TrpgReminderRound {
  slot: TrpgReminderSlot;
  date: string;
  startTime: string;
}

/**
 * 수정 알림 baseline — 대기 중인 수정 알림이 "어느 상태 대비" 변경인지 고정한다.
 * 연속 수정은 이 baseline 대비 최신 문서로 변경 요약을 다시 계산해 한 번만 발송한다.
 */
export interface TrpgSessionUpdateBaseline {
  title: string;
  date: string;
  startTime: string;
  participantDiscordIds: string[];
}

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
  /**
   * 생성 알림을 마지막으로 선점한 시각. 한 번 찍히면 release·mark·재일정이 지우지
   * 않으며 값의 유무만 판정에 쓴다(발송 도중 멈춘 세션 = "일부는 안내받았을 수 있는
   * 세션"). 배포 전 문서에는 없다(= 선점 이력 없음으로 취급).
   * `$min` 으로 바꾸지 말 것 — 생성 시 null 로 초기화되는데 BSON 정렬에서 null 이
   * Date 보다 작아 영영 찍히지 않는다.
   */
  notificationClaimedAt?: Date | null;
  /** 생성 알림 발송권 선점 만료 시각 */
  notificationClaimLeaseUntil?: Date | null;

  /** 24h 리마인드 발송 완료 시각 */
  reminderSentAt?: Date | null;
  /** 24h 리마인드 발송권 선점 만료 시각 */
  reminderClaimLeaseUntil?: Date | null;

  /** 1h 리마인드 발송 완료 시각 (재일정 시 24h 와 함께 초기화) */
  reminder1hSentAt?: Date | null;
  /** 1h 리마인드 발송권 선점 만료 시각 */
  reminder1hClaimLeaseUntil?: Date | null;

  /** 취소 알림 발송 대기열 적재 시각 */
  cancellationNotificationQueuedAt?: Date | null;
  /** 취소 알림 발송 완료 시각 */
  cancellationNotificationSentAt?: Date | null;
  /** 취소 알림 발송권 선점 만료 시각 */
  cancellationNotificationClaimLeaseUntil?: Date | null;

  /** 수정 알림 발송 대기열 적재 시각 */
  updateNotificationQueuedAt?: Date | null;
  /** 수정 알림 발송 완료 시각 */
  updateNotificationSentAt?: Date | null;
  /** 수정 알림 발송권 선점 만료 시각 */
  updateNotificationClaimLeaseUntil?: Date | null;
  /** 수정 알림 발송 대상 스냅샷 (참가자 제거 대상까지 포함하기 위함) */
  updateNotificationRecipientDiscordIds?: string[] | null;
  /** 수정 알림에 표시할 변경 요약 */
  updateNotificationChanges?: string[] | null;
  /** 대기 중인 수정 알림의 기준 상태 (연속 수정 병합용). 발송·해제되면 null */
  updateNotificationBaseline?: TrpgSessionUpdateBaseline | null;

  createdAt: Date;
  updatedAt: Date;
  /** 보고서 FK 생성과 세션 삭제/수정 경합을 직렬화하는 내부 revision. */
  reportReferenceRevision?: number;
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
