/**
 * trpg-bot 길드 멤버 캐시 Zod 스키마
 *
 * 게이트웨이 이벤트/주기적 동기화에서 들어오는 `upsertTrpgGuildMember` 입력을
 * 진입 시점에 검증한다. DB 도큐먼트 타입(`TrpgGuildMember`)은
 * `types/trpg-guild-member.ts` 에 유지.
 *
 * @module schemas/trpg-guild-member.schema
 */

import { z } from "zod";

import { dateSchema } from "./common.js";
import { trpgDiscordIdSchema } from "./trpg-session.schema.js";

/** upsert 입력 — `upsertTrpgGuildMember` 진입 검증에 사용 */
export const upsertTrpgGuildMemberInputSchema = z.object({
  guildId: z.string().min(1),
  discordUserId: trpgDiscordIdSchema,
  discordUsername: z.string().min(1).max(100),
  displayName: z.string().min(1).max(100),
  joinedAt: dateSchema,
  lastSyncedAt: dateSchema,
  leftAt: dateSchema.nullable(),
});

export type UpsertTrpgGuildMemberInput = z.infer<
  typeof upsertTrpgGuildMemberInputSchema
>;
