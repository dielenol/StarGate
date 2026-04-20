import { z } from "zod";

import {
  codeSchema,
  dateSchema,
  isoDateStringSchema,
  loreSourceSchema,
  slugSchema,
} from "./common.js";
import { factionRelationshipSchema } from "./faction.schema.js";

/* ── 상수 ── */

/**
 * @deprecated 컬렉션 이름 상수는 `collections.ts`의 `COL.INSTITUTIONS`가
 * 단일 진실 공급원이다. 본 상수는 하위 호환을 위해 유지되며
 * 다음 메이저 버전에서 제거된다. 신규 코드는 `institutionsCol()` accessor를
 * 사용하거나 `"institutions"` 리터럴을 직접 쓴다.
 */
export const INSTITUTIONS_COLLECTION = "institutions" as const;

/* ── 서브 스키마 ── */

export const institutionSubUnitSchema = z.object({
  code: codeSchema,
  label: z.string().min(1).max(40),
  labelEn: z.string().max(60).optional(),
  summary: z.string().max(300).optional(),
});

/* ── 공통 필드 ── */

const institutionBaseFields = {
  code: codeSchema,
  slug: slugSchema,
  label: z.string().min(1).max(40),
  labelEn: z.string().max(60).optional(),
  parentFactionCode: codeSchema.optional(),
  subUnits: z.array(institutionSubUnitSchema).optional(),
  summary: z.string().min(1).max(500),
  mission: z.string().max(4000).optional(),
  headquartersLocation: z.string().max(120).optional(),
  leaderCodename: codeSchema.optional(),
  relationships: z.array(factionRelationshipSchema).optional(),
  tags: z.array(z.string().max(40)).optional(),
  isPublic: z.boolean(),
  loreMd: z.string().optional(),
};

/* ── DB 문서 ── */

export const institutionDocSchema = z.object({
  ...institutionBaseFields,
  createdAt: dateSchema,
  updatedAt: dateSchema,
  source: loreSourceSchema.optional(),
  authorId: z.string().optional(),
  authorName: z.string().optional(),
});

/* ── MD frontmatter ──
   빈 문자열을 "값 없음"으로 허용 (템플릿 프리필 빈 라인 수용).
   어댑터(toDbInstitution)에서 빈 문자열을 undefined로 정규화한다. */

const optionalCodeOrEmpty = z.union([codeSchema, z.literal("")]).optional();

export const institutionFrontmatterSchema = z.object({
  ...institutionBaseFields,
  parentFactionCode: optionalCodeOrEmpty,
  leaderCodename: optionalCodeOrEmpty,
  createdAt: isoDateStringSchema.optional(),
  updatedAt: isoDateStringSchema.optional(),
  source: loreSourceSchema.optional(),
  authorId: z.string().optional(),
  authorName: z.string().optional(),
});

export type InstitutionDoc = z.infer<typeof institutionDocSchema>;
export type InstitutionFrontmatter = z.infer<typeof institutionFrontmatterSchema>;
export type InstitutionSubUnit = z.infer<typeof institutionSubUnitSchema>;
