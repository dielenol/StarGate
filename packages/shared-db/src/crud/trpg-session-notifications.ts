/**
 * trpg_session_notifications CRUD 리포지토리
 *
 * 세션 생성 알림 / 24h 리마인드의 발송 시도 결과 로그.
 * DM 성공 / fallback 채널 발송 / 완전 실패 를 운영 추적용으로 저장.
 *
 * 진입 시점 검증:
 *  - `recordNotificationAttempt` 는 Zod 스키마로 입력을 parse 한다.
 *  - `sessionId` 는 24자 hex 문자열로 받고 내부에서 `ObjectId` 로 환원.
 *  - `error` 는 2048자 컷오프 (스키마 max) — 디스코드 SDK 의 긴 스택 보호.
 *
 * @module crud/trpg-session-notifications
 */

import { ObjectId } from "mongodb";

import { trpgSessionNotificationsCol } from "../collections.js";
import {
  type RecordTrpgNotificationInput,
  recordTrpgNotificationInputSchema,
} from "../schemas/trpg-session-notification.schema.js";

/**
 * 알림 시도 결과 한 건을 기록한다.
 *
 * 동일 (sessionId, kind, discordUserId) 에 대해 여러 번 호출될 수 있다
 * (DM 실패 → fallback 성공 시 2개 row). 멱등 제약은 없으며, 인덱스는
 * 조회용 prefix 만 제공.
 */
export async function recordNotificationAttempt(
  input: RecordTrpgNotificationInput,
): Promise<void> {
  const validated = recordTrpgNotificationInputSchema.parse(input);

  const col = await trpgSessionNotificationsCol();
  await col.insertOne({
    sessionId: new ObjectId(validated.sessionId),
    discordUserId: validated.discordUserId,
    kind: validated.kind,
    deliveryMethod: validated.deliveryMethod,
    attemptedAt: validated.attemptedAt ?? new Date(),
    error: validated.error ?? null,
  });
}
