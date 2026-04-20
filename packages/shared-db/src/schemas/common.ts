import { z } from "zod";

/* ── Primitive ── */

export const objectIdStringSchema = z
  .string()
  .regex(/^[a-f0-9]{24}$/i, "invalid ObjectId hex (24자 16진수)");

export const slugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "kebab-case 문자열만 허용 (소문자·숫자·하이픈)"
  );

export const codeSchema = z
  .string()
  .min(2)
  .max(32)
  .regex(
    /^[A-Z_][A-Z0-9_]*$/,
    "UPPER_SNAKE_CASE 식별자만 허용"
  );

export const isoDateStringSchema = z.iso.datetime({
  message: "ISO 8601 datetime 문자열이어야 함",
});

export const dateSchema = z.date();

/* ── Lore 출처 ── */

export const loreSourceSchema = z.enum([
  "discord",
  "legacy-json",
  "manual",
  "create-lore",
]);

/* ── Metadata ── */

export const metadataFieldsSchema = z.object({
  createdAt: dateSchema,
  updatedAt: dateSchema,
  source: loreSourceSchema.optional(),
  authorId: z.string().optional(),
  authorName: z.string().optional(),
});

export const metadataFrontmatterSchema = z.object({
  createdAt: isoDateStringSchema,
  updatedAt: isoDateStringSchema,
  source: loreSourceSchema.optional(),
  authorId: z.string().optional(),
  authorName: z.string().optional(),
});
