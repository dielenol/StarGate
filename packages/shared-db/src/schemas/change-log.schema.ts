import { ObjectId } from "mongodb";
import { z } from "zod";

import { ROLE_LEVELS } from "../types/character.js";

import { dateSchema, objectIdStringSchema } from "./common.js";

/* ── CharacterChangeLog ── */

/** characters.ts ROLE_LEVELS 거울 (GM 포함 8단). */
const roleLevelSchema = z.enum(ROLE_LEVELS);

export const characterChangeLogEntrySchema = z.object({
  field: z.string().min(1).max(200),
  /** 임의 JSON 값. Mongo에 저장될 값을 그대로 수용 (string/number/boolean/null/array/object). */
  before: z.unknown(),
  after: z.unknown(),
});

export const characterChangeLogSchema = z.object({
  /** ObjectId 인스턴스 또는 24-char hex 문자열 모두 허용 (serialize 단계에 따라 다름). */
  characterId: z.union([z.instanceof(ObjectId), objectIdStringSchema]),
  actorId: z.string().min(1),
  actorRole: roleLevelSchema,
  actorIsOwner: z.boolean(),
  source: z.enum(["player", "admin"]),
  changes: z.array(characterChangeLogEntrySchema).min(1),
  reason: z.string().max(500).optional(),
  createdAt: dateSchema,
  revertedAt: dateSchema.nullable().optional(),
  revertedBy: z.string().nullable().optional(),
});

export type CharacterChangeLogSchema = z.infer<typeof characterChangeLogSchema>;
export type CharacterChangeLogEntrySchema = z.infer<
  typeof characterChangeLogEntrySchema
>;
