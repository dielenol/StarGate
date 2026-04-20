import type { ObjectId } from "mongodb";

/* ── Sheet 공통 필드 ── */

export interface SheetBase {
  codename: string;
  name: string;
  mainImage: string;
  quote: string;
  gender: string;
  age: string;
  height: string;
  appearance: string;
  personality: string;
  background: string;
}

/* ── Agent 전용 Sheet ── */

export interface Equipment {
  name: string;
  price: number | string;
  damage: string;
  description: string;
}

export interface Ability {
  code: string;
  name: string;
  description: string;
  effect: string;
}

export interface AgentSheet extends SheetBase {
  weight: string;
  className: string;
  hp: number;
  san: number;
  def: number;
  atk: number;
  abilityType: string;
  credit: number | string;
  weaponTraining: string;
  skillTraining: string;
  equipment: Equipment[];
  abilities: Ability[];
}

/* ── NPC 전용 Sheet ── */

export interface NpcSheet extends SheetBase {
  nameEn: string;
  roleDetail: string;
  notes: string;
}

/* ── Character 문서 (MongoDB) ── */

export type CharacterType = "AGENT" | "NPC";

export type AgentLevel = "V" | "A" | "M" | "H" | "G" | "J" | "U";

export const AGENT_LEVELS: AgentLevel[] = ["V", "A", "M", "H", "G", "J", "U"];

export const AGENT_LEVEL_LABELS: Record<AgentLevel, string> = {
  V: "VIP",
  A: "최종 관리자",
  M: "부서 관리자",
  H: "특수요원",
  G: "부서 요원",
  J: "평사원",
  U: "소모품",
};

/* ── 조직 구조 (세계관 표면적 구조) ── */

export const FACTIONS = [
  { code: "MILITARY", label: "군부", labelEn: "Military" },
  { code: "COUNCIL", label: "이사회", labelEn: "World Council" },
  { code: "CIVIL", label: "시민사회", labelEn: "Civil Society" },
] as const;

export type FactionCode = (typeof FACTIONS)[number]["code"];

export const INSTITUTIONS = [
  {
    code: "SECRETARIAT",
    label: "사무국",
    labelEn: "Secretariat",
    subUnits: [
      { code: "RESEARCH", label: "연구 기구" },
      { code: "ADMIN_BUREAU", label: "행정 기구" },
      { code: "INTL", label: "국제 기구" },
      { code: "CONTROL", label: "통제 기구" },
    ],
  },
  {
    code: "FINANCE",
    label: "재무국",
    labelEn: "Financial Bureau",
    subUnits: [],
  },
] as const;

export type InstitutionCode = (typeof INSTITUTIONS)[number]["code"];

/** @deprecated 호환용. 새 코드는 FACTIONS + INSTITUTIONS 사용 */
export const DEPARTMENTS = [
  { code: "HQ", label: "사무총장실", labelEn: "Secretary General's Office" },
  { code: "FIELD", label: "현장작전부", labelEn: "Field Operations" },
  { code: "RESEARCH", label: "연구분석부", labelEn: "Research & Analysis" },
  { code: "SECURITY", label: "보안국", labelEn: "Security Bureau (N.O.S.B)" },
  { code: "LOGISTICS", label: "후방지원부", labelEn: "Logistics & Supply" },
  { code: "EXTERNAL", label: "외부협력", labelEn: "External Affairs" },
  { code: "UNASSIGNED", label: "미배정", labelEn: "Unassigned" },
] as const;

/** @deprecated 레거시 코드 유니온 */
export type LegacyDepartmentCode = (typeof DEPARTMENTS)[number]["code"];

/** 모든 유효한 부서/세력/기관 코드 유니온 */
export type DepartmentCode =
  | FactionCode
  | InstitutionCode
  | (typeof INSTITUTIONS)[number]["subUnits"][number]["code"]
  | LegacyDepartmentCode
  | "UNASSIGNED";

interface CharacterBase {
  _id?: ObjectId;
  codename: string;
  type: CharacterType;
  role: string;
  agentLevel?: AgentLevel;
  department?: DepartmentCode;
  previewImage: string;
  pixelCharacterImage?: string;
  warningVideo?: string;
  source?: 'discord' | 'legacy-json' | 'manual';
  lore?: string;
  rawText?: string;
  ownerId: string | null;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentCharacter extends CharacterBase {
  type: "AGENT";
  sheet: AgentSheet;
}

export interface NpcCharacter extends CharacterBase {
  type: "NPC";
  sheet: NpcSheet;
}

export type Character = AgentCharacter | NpcCharacter;

/* ── 생성 입력 ── */

export type CreateCharacterInput = Omit<
  Character,
  "_id" | "createdAt" | "updatedAt"
>;

/* ── 공개 조회용 (ownerId 제외) ── */

export type CharacterPublic = Omit<Character, "ownerId">;
