/**
 * trpg-bot 세션 도메인 Zod 스키마
 *
 * CRUD 진입 검증과 외부 호출처(슬래시 커맨드 페이로드 등) 모두에서 재사용.
 * DB 도큐먼트 타입(`TrpgSession`)은 `types/trpg-session.ts` 에 그대로 두고,
 * 본 파일에서는 **입력 페이로드** 만 정의·검증한다.
 *
 * @module schemas/trpg-session.schema
 */

import { z } from "zod";

/* ── 공통 primitive ── */

/** YYYY-MM-DD (KST 기준 날짜 문자열) */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** HH:mm (24h) */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const trpgSessionStatusSchema = z.enum(["open", "cancelled"]);

export const trpgSessionDateSchema = z
  .string()
  .regex(DATE_RE, "date 는 YYYY-MM-DD 형식이어야 합니다");

export const trpgSessionStartTimeSchema = z
  .string()
  .regex(TIME_RE, "startTime 은 HH:mm 24h 형식이어야 합니다");

export const trpgSessionTitleSchema = z.string().min(1).max(100);

/** 디스코드 ID (snowflake 또는 username 식별자) — 1~64자 비제로 길이 */
export const trpgDiscordIdSchema = z.string().min(1).max(64);

/* ── 입력 페이로드 ── */

/**
 * participantDiscordIds 공통 스키마.
 * - 길이 ≤ 50
 * - 동일 ID 중복 입력은 자동 dedupe (API 직접 호출 우회 방지: 중복 시 DM 다중 발송 사고 차단)
 */
const participantDiscordIdsSchema = z
  .array(trpgDiscordIdSchema)
  .max(50)
  .transform((arr) => Array.from(new Set(arr)));

/** 세션 생성 입력 — `createTrpgSession` 진입 검증에 사용 */
export const createTrpgSessionInputSchema = z.object({
  guildId: z.string().min(1),
  title: trpgSessionTitleSchema,
  date: trpgSessionDateSchema,
  startTime: trpgSessionStartTimeSchema,
  createdByDiscordId: trpgDiscordIdSchema,
  createdByUsername: z.string().min(1).max(100),
  participantDiscordIds: participantDiscordIdsSchema,
});

/**
 * 세션 부분 갱신 패치 — `updateTrpgSession` 진입 검증에 사용.
 * 모든 필드 optional. 빈 객체도 허용 (호출처 책임으로 빈 패치 차단).
 */
export const updateTrpgSessionPatchSchema = z.object({
  title: trpgSessionTitleSchema.optional(),
  date: trpgSessionDateSchema.optional(),
  startTime: trpgSessionStartTimeSchema.optional(),
  participantDiscordIds: participantDiscordIdsSchema.optional(),
});

/* ── 추론 타입 export ── */

export type CreateTrpgSessionInput = z.infer<
  typeof createTrpgSessionInputSchema
>;
export type UpdateTrpgSessionPatch = z.infer<
  typeof updateTrpgSessionPatchSchema
>;
export type TrpgSessionStatusValue = z.infer<typeof trpgSessionStatusSchema>;
