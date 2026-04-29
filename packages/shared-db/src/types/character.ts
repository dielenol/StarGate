import type { ObjectId } from "mongodb";

/* ── LoreSheet ──
   신원조회(/erp/personnel) 페이지의 source. AGENT/NPC 공통.
   외모/성격/배경/소속 등 lore 정보. 게임 시트 능력치는 PlaySheet 로 분리. */

export interface LoreSheet {
  /** 한국어 주 표기 (예: "츠키시로 쿠즈하"). */
  name: string;
  /** 원어 표기 (한자/일본어 등, 예: "月城 葛葉"). */
  nameNative?: string;
  /** 짧은 별칭/통칭 (예: "쿠즈하"). */
  nickname?: string;

  /* 인물 신상 */
  gender: string;
  age: string;
  height: string;
  /** 체중. 게임 능력치가 아닌 신상 정보로 분류 → lore 영역. */
  weight: string;

  /* 서사 */
  appearance: string;
  personality: string;
  background: string;
  quote: string;

  /* 이미지 */
  mainImage: string;
  /** 캐릭터 상세 상단 히어로에 노출되는 공식 포스터 (와이드). mainImage(세로 초상화)와 구분. */
  posterImage?: string;

  /* 메타 */
  /** 자유 태그 (예: ["행정"]). */
  loreTags?: string[];
  /** 등장 이벤트 (예: ["2025-Q1-알파"]). */
  appearsInEvents?: string[];

  /* NPC 호환 필드 (AGENT 에서는 보통 미사용) */
  /** 영문 이름 (NPC 위주). */
  nameEn?: string;
  /** 역할 상세 서술 (NPC 위주). */
  roleDetail?: string;
  /** 이름/코드네임 설명 (NPC 위주). */
  notes?: string;
}

/* ── PlaySheet ──
   캐릭터 페이지(/erp/characters) 의 source. AGENT 전용.
   게임 시트(HP/SAN/장비/능력) 정보. NPC 에는 부재. */

export interface PlaySheet {
  /** 클래스 (예: "관료"). */
  className: string;

  /* 스탯 — base + delta 메모 (delta 는 표시용 메모, default 0).
     예: 시트 표기 "HP | 20 (-30)" 의 -30 이 delta. */
  hp: number;
  hpDelta: number;
  san: number;
  sanDelta: number;
  def: number;
  defDelta: number;
  atk: number;
  atkDelta: number;

  /** 능력 origin (예: "백면금모구미호의 후손"). */
  abilityType?: string;
  /** 무기 훈련 (배열화 — 다중 가능, 예시 시트는 비어있을 수 있음). */
  weaponTraining: string[];
  /** 스킬 훈련 (예: ["유혹","설득","샘플관리"]). */
  skillTraining: string[];
  credit: string;
  equipment: Equipment[];
  /** 길이 9 고정 권장 — slot 기준으로 C1/C2/C3/C4/C5/P/A1/A2/A3.
   *  C(Cantrip) 5개 + P(Passive) 1개 + A(Active) 3개. */
  abilities: Ability[];
}

export interface Equipment {
  name: string;
  price?: string;
  damage?: string;
  /** 탄환 (예: "5/5"). */
  ammo?: string;
  /** 파지 (예: "양손, 혹은 한손"). */
  grip?: string;
  description?: string;
}

/** 어빌리티 슬롯 식별자.
 *  C1~C5 = Cantrip(5개), P = Passive(1개), A1/A2/A3 = Active(3개). 총 9슬롯.
 *  TRPG 룰: 캔트립은 캐릭터당 최대 5개까지 보유 가능. */
export type AbilitySlot =
  | "C1"
  | "C2"
  | "C3"
  | "C4"
  | "C5"
  | "P"
  | "A1"
  | "A2"
  | "A3";

export interface Ability {
  /** 슬롯 식별자 (필수). 슬롯이 비어있어도 slot 자체는 보존. */
  slot: AbilitySlot;
  /** 어빌리티 표시 이름. 빈 슬롯이면 "". */
  name: string;
  /** 어빌리티 자체 식별 코드 (예: "잔향(殘香)"). slot 과 분리. */
  code?: string;
  description?: string;
  effect?: string;
}

/* ── Character 문서 (MongoDB) ── */

export type CharacterType = "AGENT" | "NPC";

/**
 * 운영 분류 — AGENT 캐릭터를 메인/미니로 구분 (한 명의 owner가 복수 캐릭터 보유 가능).
 * NPC 는 personnel 화면에서만 노출되며 tier 의미 없음 (사용해도 무시).
 *
 * 기존 데이터에는 tier 가 없을 수 있으므로 UI/쿼리에서 미설정은 MAIN 으로 fallback.
 */
export const CHARACTER_TIERS = ["MAIN", "MINI"] as const;
export type CharacterTier = (typeof CHARACTER_TIERS)[number];

/** 8단 역할 계층: GM > V > A > M > H > G > J > U (높을수록 권한 큼) */
export const ROLE_LEVELS = ["GM", "V", "A", "M", "H", "G", "J", "U"] as const;
export type RoleLevel = (typeof ROLE_LEVELS)[number];

/** 수치 rank (rbac.ts/personnel.ts 공용) */
export const ROLE_LEVEL_RANK: Record<RoleLevel, number> = {
  GM: 100,
  V: 90,
  A: 80,
  M: 70,
  H: 60,
  G: 50,
  J: 40,
  U: 30,
};

/** AgentLevel은 RoleLevel과 동일 union으로 alias (Phase 2-A 일체화) */
export type AgentLevel = RoleLevel;

/** AGENT_LEVELS는 character.agentLevel 입력 전용 (GM 제외, 명시 7단 리터럴) */
export const AGENT_LEVELS = ["V", "A", "M", "H", "G", "J", "U"] as const satisfies readonly AgentLevel[];

export const AGENT_LEVEL_LABELS: Record<AgentLevel, string> = {
  GM: "운영진",
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
      { code: "HQ", label: "사무총장실" },
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
  /** AGENT 운영 분류. NPC 에는 무의미. 미설정은 UI/쿼리에서 MAIN 으로 fallback. */
  tier?: CharacterTier;
  role: string;
  agentLevel?: AgentLevel;
  department?: DepartmentCode;
  /** DB 승격 후 신규 코드를 수용하기 위해 string (FactionCode 유니온과 별개). */
  factionCode?: string;
  /** DB 승격 후 신규 코드를 수용하기 위해 string. */
  institutionCode?: string;
  /** NPC 카드 썸네일 등에 쓰이는 미리보기 이미지. */
  previewImage: string;
  pixelCharacterImage?: string;
  warningVideo?: string;
  source?: 'discord' | 'legacy-json' | 'manual' | 'create-lore';
  /** 원본 MD body 보존 (frontmatter 미커버 섹션 복원용). faction/institution과 일관. */
  loreMd?: string;
  rawText?: string;
  ownerId: string | null;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  /**
   * 통짜 데이터 동기화(bulk reset) 시각 — Claude/스크립트로 시트 본문·스탯·어빌리티를
   * 일괄 덮어쓴 작업의 시점만 기록한다. 사용자 폼 편집(/erp/characters/[id] 편집,
   * change-logs revert 등)에서는 갱신하지 않는다. GM 전용으로 노출.
   */
  bulkUpdatedAt?: Date;
}

export interface AgentCharacter extends CharacterBase {
  type: "AGENT";
  /** 신원조회 source — AGENT/NPC 공통. */
  lore: LoreSheet;
  /** 캐릭터 시트 source — AGENT 전용. */
  play: PlaySheet;
}

export interface NpcCharacter extends CharacterBase {
  type: "NPC";
  /** 신원조회 source — NPC 는 play 없음. */
  lore: LoreSheet;
}

export type Character = AgentCharacter | NpcCharacter;

/* ── 생성 입력 ── */

export type CreateCharacterInput = Omit<
  Character,
  "_id" | "createdAt" | "updatedAt"
>;

/* ── 공개 조회용 (ownerId 제외) ── */

export type CharacterPublic = Omit<Character, "ownerId">;
