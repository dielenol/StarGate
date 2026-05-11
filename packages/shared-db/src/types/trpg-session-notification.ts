/**
 * trpg-bot 세션 알림 발송 시도 로그 타입
 *
 * 세션 생성 알림 / 24h 리마인드 발송 시도 결과를 기록한다.
 * DM 실패 → fallback 채널 발송 → 그조차 실패 시 failed 로 남겨 운영 추적.
 *
 * 입력 페이로드(`RecordTrpgNotificationInput`) 는
 * `schemas/trpg-session-notification.schema.ts` 에서 Zod 스키마 + `z.infer` 로
 * 단일 출처 관리. 스키마 경계에서는 `sessionId` 를 24자 hex 문자열로 받고,
 * CRUD 내부에서 `ObjectId` 로 환원한다.
 *
 * @module types/trpg-session-notification
 */

import type { ObjectId } from "mongodb";

/** 알림 종류: 세션 생성 시 발송 / 시작 24h 전 리마인드 */
export type TrpgNotificationKind = "creation" | "reminder24h";

/** 발송 방식: DM 성공 / fallback 채널 / 완전 실패 */
export type TrpgNotificationDeliveryMethod = "dm" | "fallback" | "failed";

/** DB 에 저장되는 trpg 알림 시도 로그 */
export interface TrpgSessionNotification {
  _id?: ObjectId;
  sessionId: ObjectId;
  discordUserId: string;
  kind: TrpgNotificationKind;
  deliveryMethod: TrpgNotificationDeliveryMethod;
  attemptedAt: Date;
  error?: string | null;
}
