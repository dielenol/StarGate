/**
 * trpg-bot 알림 시도 로그 Zod 스키마
 *
 * `recordNotificationAttempt` 진입 검증에 사용. `sessionId` 는 호출처에서
 * `ObjectId#toHexString()` 으로 직렬화한 24자 hex 문자열을 받고, CRUD 내부에서
 * 다시 `ObjectId` 로 환원한다 (스키마 경계는 plain object 유지).
 *
 * `error` 필드는 운영상 디스코드 SDK 의 긴 스택을 그대로 받지 않도록 2048자 컷오프.
 *
 * @module schemas/trpg-session-notification.schema
 */

import { z } from "zod";

import { dateSchema, objectIdStringSchema } from "./common.js";
import { trpgDiscordIdSchema } from "./trpg-session.schema.js";

export const trpgNotificationKindSchema = z.enum([
  "creation",
  "reminder24h",
  "update",
  "cancellation",
]);

export const trpgNotificationDeliveryMethodSchema = z.enum([
  "dm",
  "fallback",
  "failed",
]);

/**
 * 알림 시도 입력.
 *
 * `sessionId` 는 hex 문자열로 받는다 — `ObjectId` 인스턴스를 그대로 받으면
 * Zod 가 `instanceof` 검증을 위해 별도 분기를 두어야 하고, 다른 도메인 입력
 * 페이로드(스케줄러 worker) 와의 직렬화 호환성을 잃는다.
 */
export const recordTrpgNotificationInputSchema = z.object({
  sessionId: objectIdStringSchema,
  discordUserId: trpgDiscordIdSchema,
  kind: trpgNotificationKindSchema,
  deliveryMethod: trpgNotificationDeliveryMethodSchema,
  attemptedAt: dateSchema.optional(),
  error: z.string().max(2048).nullable().optional(),
});

export type TrpgNotificationKindValue = z.infer<
  typeof trpgNotificationKindSchema
>;
export type TrpgNotificationDeliveryMethodValue = z.infer<
  typeof trpgNotificationDeliveryMethodSchema
>;
export type RecordTrpgNotificationInput = z.infer<
  typeof recordTrpgNotificationInputSchema
>;
