import { z } from "zod";

import {
  codeSchema,
  dateSchema,
  isoDateStringSchema,
  loreSourceSchema,
  slugSchema,
} from "./common.js";

/* ── 상수 ── */

/**
 * @deprecated 컬렉션 이름 상수는 `collections.ts`의 `COL.FACTIONS`가
 * 단일 진실 공급원이다. 본 상수는 하위 호환을 위해 유지되며
 * 다음 메이저 버전에서 제거된다. 신규 코드는 `factionsCol()` accessor를
 * 사용하거나 `"factions"` 리터럴을 직접 쓴다.
 */
export const FACTIONS_COLLECTION = "factions" as const;

/* ── 서브 스키마 ── */

export const factionRelationshipSchema = z.object({
  targetCode: codeSchema,
  type: z.enum(["ally", "rival", "neutral", "subordinate", "parent"]),
  note: z.string().max(200).optional(),
});

/* ── 공통 필드 ── */

/**
 * Faction scope — `external` (외부 권력 블록: MILITARY/COUNCIL/CIVIL)
 *                 | `internal` (노부스 오르도 본부: NOVUS_ORDO).
 *
 * 외부 3대 권력 블록은 노부스 오르도의 정규 권한 등급 체계 바깥에 존재한다.
 * NOVUS_ORDO 자체는 internal 로 분류되어 사무국·MANUS 등 내부 기관의
 * 상위 우산 역할을 한다.
 *
 * 기존 frontmatter/문서 호환을 위해 optional 로 둔다 — 누락 시 seed 스크립트가
 * code 별 디폴트(`external`/`internal`)를 적용한다.
 */
export const factionScopeSchema = z.enum(["external", "internal"]);

const factionBaseFields = {
  code: codeSchema,
  slug: slugSchema,
  label: z.string().min(1).max(40),
  labelEn: z.string().max(60).optional(),
  scope: factionScopeSchema.optional(),
  summary: z.string().min(1).max(500),
  ideology: z.string().max(4000).optional(),
  relationships: z.array(factionRelationshipSchema).optional(),
  notableMembers: z.array(codeSchema).optional(),
  tags: z.array(z.string().max(40)).optional(),
  isPublic: z.boolean(),
  loreMd: z.string().optional(),
};

/* ── DB 문서 ── */

export const factionDocSchema = z.object({
  ...factionBaseFields,
  createdAt: dateSchema,
  updatedAt: dateSchema,
  source: loreSourceSchema.optional(),
  authorId: z.string().optional(),
  authorName: z.string().optional(),
});

/* ── MD frontmatter ── */

export const factionFrontmatterSchema = z.object({
  ...factionBaseFields,
  createdAt: isoDateStringSchema.optional(),
  updatedAt: isoDateStringSchema.optional(),
  source: loreSourceSchema.optional(),
  authorId: z.string().optional(),
  authorName: z.string().optional(),
});

export type FactionDoc = z.infer<typeof factionDocSchema>;
export type FactionFrontmatter = z.infer<typeof factionFrontmatterSchema>;
export type FactionRelationship = z.infer<typeof factionRelationshipSchema>;
