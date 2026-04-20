import { z } from "zod";

import {
  codeSchema,
  dateSchema,
  isoDateStringSchema,
  loreSourceSchema,
} from "./common.js";

/* ── NpcSheet 스키마 (types/character.ts NpcSheet 거울) ── */

export const npcSheetSchema = z.object({
  codename: z.string(),
  name: z.string(),
  nameEn: z.string(),
  mainImage: z.string(),
  quote: z.string(),
  gender: z.string(),
  age: z.string(),
  height: z.string(),
  appearance: z.string(),
  personality: z.string(),
  background: z.string(),
  roleDetail: z.string(),
  notes: z.string(),
});

/* ── 공통 필드 ── */

// previewImage는 3가지를 모두 허용:
//   1) 절대 URL (`https://…`)
//   2) 서버 루트 상대경로 (`/assets/…`) — Next.js /public 또는 CDN 프록시 전제
//   3) 빈 문자열 — 아직 지정되지 않음
// 빈 문자열은 DB 어댑터(toDbNpc)에서 `""`로 유지, frontmatter 파서는 빈 라인을 "" 로 주므로 동일 경로 수용.
const previewImageSchema = z.union([
  z.url(),
  z.string().regex(/^\//, "서버 루트 상대경로는 '/'로 시작해야 합니다."),
  z.literal(""),
]);

/** types/character.ts AgentLevel 거울. NPC에도 CharacterBase 규약상 optional. */
const agentLevelSchema = z.enum(["V", "A", "M", "H", "G", "J", "U"]);

const npcBaseFields = {
  codename: codeSchema,
  type: z.literal("NPC"),
  role: z.string().min(1).max(100),
  department: z.string().optional(),
  factionCode: codeSchema.optional(),
  institutionCode: codeSchema.optional(),
  previewImage: previewImageSchema,
  pixelCharacterImage: z.string().optional(),
  warningVideo: z.string().optional(),
  agentLevel: agentLevelSchema.optional(),
  isPublic: z.boolean(),
  sheet: npcSheetSchema,
  lore: z.string().optional(),
  // faction/institution과 일관되게 body 원문을 raw markdown으로 보존한다.
  // 섹션 파싱은 sheet 쪽에 투영되지만, 원본 문자열이 필요한 경우(예: loreTags 재추출,
  // 비정형 '## 관계' '## 데이터 연동' 참조 섹션 보존)를 위해 loreMd를 함께 저장.
  loreMd: z.string().optional(),
  loreTags: z.array(z.string().max(40)).optional(),
  appearsInEvents: z.array(z.string().max(80)).optional(),
  rawText: z.string().optional(),
  source: loreSourceSchema.optional(),
  ownerId: z.string().nullable(),
};

/* ── DB 문서 ── */

export const npcDocSchema = z.object({
  ...npcBaseFields,
  createdAt: dateSchema,
  updatedAt: dateSchema,
  authorId: z.string().optional(),
  authorName: z.string().optional(),
});

/* ── MD frontmatter 전용 ──
   긴 서술 필드(appearance/personality/background/roleDetail/notes/quote)는
   MD body 섹션으로 분리되므로 frontmatter 스키마에서 제외. */

// 빈 문자열은 "값 없음"으로 취급 (템플릿 프리필 빈 라인 허용).
// DB 어댑터(toDbNpc)에서 빈 문자열을 undefined로 정규화한다.
const optionalCodeOrEmpty = z.union([codeSchema, z.literal("")]).optional();

export const npcFrontmatterSchema = z.object({
  codename: codeSchema,
  slug: z.string().optional(),
  type: z.literal("NPC"),
  role: z.string().min(1).max(100),
  factionCode: optionalCodeOrEmpty,
  institutionCode: optionalCodeOrEmpty,
  department: z.string().optional(),
  nameKo: z.string(),
  nameEn: z.string().optional(),
  gender: z.string().optional(),
  age: z.string().optional(),
  height: z.string().optional(),
  isPublic: z.boolean(),
  loreTags: z.array(z.string().max(40)).optional(),
  appearsInEvents: z.array(z.string().max(80)).optional(),
  source: loreSourceSchema.optional(),
  previewImage: previewImageSchema.optional(),
  pixelCharacterImage: z.string().optional(),
  warningVideo: z.string().optional(),
  agentLevel: agentLevelSchema.optional(),
  createdAt: isoDateStringSchema.optional(),
  updatedAt: isoDateStringSchema.optional(),
  authorId: z.string().optional(),
  authorName: z.string().optional(),
});

export type NpcDoc = z.infer<typeof npcDocSchema>;
export type NpcFrontmatter = z.infer<typeof npcFrontmatterSchema>;
export type NpcSheetSchema = z.infer<typeof npcSheetSchema>;
