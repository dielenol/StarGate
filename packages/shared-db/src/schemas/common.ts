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

/* ── Preview image ──
   1) 절대 URL (`https://…`), 2) 서버 루트 상대경로 (`/...`),
   3) 빈 문자열 — 아직 지정되지 않음.
   NPC/Equipment/Consumable 모두 동일 union 을 공유한다. */

export const previewImageSchema = z.union([
  z.url(),
  z.string().regex(/^\//, "서버 루트 상대경로는 '/'로 시작해야 합니다."),
  z.literal(""),
]);

export const optionalPreviewImageSchema = previewImageSchema.optional();

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

/* ── Catalog (Equipment / Consumable 공통) ──
   master_items 컬렉션 mirror. 두 도메인이 70% 동일하므로 공통 부분을 base 로 추출.
   - category 와 도메인 고유 필드(damage/effect) 는 호출부에서 spread 합성.
   - doc 의 createdAt/updatedAt/authorId/authorName 은 호출부에서 추가. */

/**
 * 카탈로그 body 섹션(배경/획득/비고). master_items.lore 미러.
 * Equipment 와 Consumable 둘 다 동일 모양.
 */
export const catalogLoreSchema = z.object({
  background: z.string().optional(),
  acquisition: z.string().optional(),
  notes: z.string().optional(),
});

export type CatalogLore = z.infer<typeof catalogLoreSchema>;

/**
 * Equipment/Consumable 공통 doc base 필드.
 *
 * @param categorySchema - category 컬럼 스키마 (equipment: z.enum, consumable: z.literal)
 */
export function catalogDocBaseFields<C extends z.ZodTypeAny>(
  categorySchema: C,
) {
  return {
    code: codeSchema,
    slug: slugSchema,
    name: z.string().min(1).max(80),
    nameEn: z.string().max(80).optional(),
    category: categorySchema,
    price: z.number().nonnegative(),
    description: z.string().min(1).max(500),
    previewImage: optionalPreviewImageSchema,
    isAvailable: z.boolean(),
    isPublic: z.boolean(),
    tags: z.array(z.string().max(40)).optional(),
    loreMd: z.string().optional(),
    lore: catalogLoreSchema.optional(),
    source: loreSourceSchema.optional(),
  };
}

/**
 * Equipment/Consumable 공통 frontmatter base 필드.
 *
 * doc 과의 차이:
 * - price 는 z.coerce.number (frontmatter 는 문자열 입력 허용)
 * - description 은 optional (body "## 설명" 으로 폴백 가능)
 * - createdAt/updatedAt 은 ISO 문자열, optional
 * - authorId/authorName 도 frontmatter 단계에서 optional
 */
export function catalogFrontmatterBaseFields<C extends z.ZodTypeAny>(
  categorySchema: C,
) {
  return {
    code: codeSchema,
    slug: slugSchema,
    name: z.string().min(1).max(80),
    nameEn: z.string().max(80).optional(),
    category: categorySchema,
    price: z.coerce.number().nonnegative(),
    description: z.string().max(500).optional(),
    previewImage: optionalPreviewImageSchema,
    isAvailable: z.boolean(),
    isPublic: z.boolean(),
    tags: z.array(z.string().max(40)).optional(),
    source: loreSourceSchema.optional(),
    createdAt: isoDateStringSchema.optional(),
    updatedAt: isoDateStringSchema.optional(),
    authorId: z.string().optional(),
    authorName: z.string().optional(),
  };
}
