import { z } from "zod";

import {
  codeSchema,
  dateSchema,
  isoDateStringSchema,
  loreSourceSchema,
} from "./common.js";

/* ── LoreSheet 스키마 (types/character.ts LoreSheet 거울) ──
   AGENT/NPC 공통 신원조회 source. */

export const loreSheetSchema = z.object({
  /* 이름 */
  name: z.string(),
  nameNative: z.string().optional(),
  nickname: z.string().optional(),

  /* 인물 신상 */
  gender: z.string(),
  age: z.string(),
  height: z.string(),
  weight: z.string(),

  /* 서사 */
  appearance: z.string(),
  personality: z.string(),
  background: z.string(),
  quote: z.string(),

  /* 이미지 */
  mainImage: z.string(),
  /** 캐릭터 상세 상단 히어로에 노출되는 공식 포스터 (와이드). mainImage(세로 초상화)와 구분. */
  posterImage: z.string().optional(),

  /* 메타 */
  loreTags: z.array(z.string().max(40)).optional(),
  appearsInEvents: z.array(z.string().max(80)).optional(),

  /* NPC 호환 필드 */
  nameEn: z.string().optional(),
  roleDetail: z.string().optional(),
  notes: z.string().optional(),
});

/* ── PlaySheet 스키마 (types/character.ts PlaySheet 거울)
   AGENT 전용 게임 시트 source. */

const equipmentSchema = z.object({
  name: z.string(),
  price: z.string().optional(),
  damage: z.string().optional(),
  ammo: z.string().optional(),
  grip: z.string().optional(),
  description: z.string().optional(),
});

const abilitySlotSchema = z.enum(["C1", "C2", "C3", "P", "A1", "A2", "A3"]);

const abilitySchema = z.object({
  slot: abilitySlotSchema,
  name: z.string(),
  code: z.string().optional(),
  description: z.string().optional(),
  effect: z.string().optional(),
});

export const playSheetSchema = z.object({
  className: z.string(),
  hp: z.number(),
  hpDelta: z.number(),
  san: z.number(),
  sanDelta: z.number(),
  def: z.number(),
  defDelta: z.number(),
  atk: z.number(),
  atkDelta: z.number(),
  abilityType: z.string().optional(),
  weaponTraining: z.array(z.string()),
  skillTraining: z.array(z.string()),
  credit: z.string(),
  equipment: z.array(equipmentSchema),
  abilities: z.array(abilitySchema),
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
  /** 신원조회 source — AGENT/NPC 공통 LoreSheet. NPC 는 play 부재. */
  lore: loreSheetSchema,
  // faction/institution과 일관되게 body 원문을 raw markdown으로 보존한다.
  // 섹션 파싱은 lore 쪽에 투영되지만, 원본 문자열이 필요한 경우(예: loreTags 재추출,
  // 비정형 '## 관계' '## 데이터 연동' 참조 섹션 보존)를 위해 loreMd를 함께 저장.
  loreMd: z.string().optional(),
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
  /** 원어 표기 (한자/일본어 등). LoreSheet.nameNative. */
  nameNative: z.string().optional(),
  /** 짧은 별칭/통칭. LoreSheet.nickname. */
  nickname: z.string().optional(),
  gender: z.string().optional(),
  age: z.string().optional(),
  height: z.string().optional(),
  /** 체중 — LoreSheet.weight. */
  weight: z.string().optional(),
  isPublic: z.boolean(),
  loreTags: z.array(z.string().max(40)).optional(),
  appearsInEvents: z.array(z.string().max(80)).optional(),
  source: loreSourceSchema.optional(),
  previewImage: previewImageSchema.optional(),
  posterImage: previewImageSchema.optional(),
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
export type LoreSheetSchema = z.infer<typeof loreSheetSchema>;
export type PlaySheetSchema = z.infer<typeof playSheetSchema>;
