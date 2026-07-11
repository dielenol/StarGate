export const EQUIPMENT_RESEARCH_STATUS = [
  "in_progress",
  "applying",
  "applied",
] as const;

export const EQUIPMENT_RESEARCH_SCOPES = ["personal", "team"] as const;
export const EQUIPMENT_RESEARCH_STATS = ["hp", "san", "atk", "def"] as const;
export const EQUIPMENT_RESEARCH_TIERS = [1, 2, 3, 4, 5] as const;
export const EQUIPMENT_RESEARCH_APPLY_LEASE_MS = 5 * 60 * 1000;

export type EquipmentResearchStatus = (typeof EQUIPMENT_RESEARCH_STATUS)[number];
export type EquipmentResearchScope = (typeof EQUIPMENT_RESEARCH_SCOPES)[number];
export type EquipmentResearchStat = (typeof EQUIPMENT_RESEARCH_STATS)[number];
export type EquipmentResearchTier = (typeof EQUIPMENT_RESEARCH_TIERS)[number];

export type EquipmentResearchEffect =
  | {
      kind: "stat";
      stat: EquipmentResearchStat;
      amount: number;
    }
  | {
      kind: "point";
      amount: number;
    }
  | {
      kind: "refund";
      percent: number;
      cap: number;
    }
  | {
      kind: "research_cost_discount";
      percent: number;
      cap: number;
    }
  | {
      kind: "research_time_discount";
      percent: number;
      maxHours: number;
    }
  | {
      kind: "rush_discount";
      percent: number;
    }
  | {
      kind: "credit_bonus";
      percent: number;
      cap: number;
    }
  | {
      kind: "unlock";
      code:
        | "training_module"
        | "zulu_countermeasure"
        | "custom_weapon_slot";
      label: string;
    };

export interface EquipmentResearchNode {
  key: string;
  tier: EquipmentResearchTier;
  branch: "bio" | "psy" | "mun" | "log" | "lab" | "trn" | "cnt" | "cst" | "aeg" | "pts";
  name: string;
  summary: string;
  cost: number;
  durationHours: number;
  minDurationHours?: number;
  prerequisiteKeys?: string[];
  allowedScopes: EquipmentResearchScope[];
  effects: Partial<Record<EquipmentResearchScope, EquipmentResearchEffect>>;
}

export interface EquipmentResearchRushRule {
  tier: EquipmentResearchTier;
  cost: number;
  hours: number;
  maxUses: number;
}

export interface EquipmentResearchProjectLike {
  tier: EquipmentResearchTier;
  startedAt: Date;
  completedAt: Date;
  rushUsed: number;
  rushDiscountUsed?: boolean;
}

export interface EquipmentResearchCapabilities {
  refundPercent: number;
  refundCap: number;
  researchCostDiscountPercent: number;
  researchCostDiscountCap: number;
  researchTimeDiscountPercent: number;
  researchTimeDiscountMaxHours: number;
  rushDiscountPercent: number;
  creditBonusPercent: number;
  creditBonusCap: number;
  trainingModule: boolean;
  zuluCountermeasure: boolean;
  customWeaponSlot: boolean;
}

export interface EquipmentResearchStartQuote {
  cost: number;
  durationHours: number;
  costDiscount: number;
  durationReductionHours: number;
}

export function isEquipmentResearchApplyLeaseStale(
  updatedAt: Date | string,
  now = new Date(),
): boolean {
  const updatedAtTime = new Date(updatedAt).getTime();
  return (
    Number.isFinite(updatedAtTime) &&
    now.getTime() - updatedAtTime >= EQUIPMENT_RESEARCH_APPLY_LEASE_MS
  );
}

export interface EquipmentResearchRushQuote {
  cost: number;
  hours: number;
  discountApplied: boolean;
  maxUses: number;
  nextCompletedAt: Date;
}

export const EQUIPMENT_RESEARCH_CAPS: Record<
  EquipmentResearchStat | "points",
  number
> = {
  hp: 45,
  san: 45,
  atk: 8,
  def: 1,
  points: 4,
};

export const EQUIPMENT_RESEARCH_RUSH_RULES: Record<
  EquipmentResearchTier,
  EquipmentResearchRushRule
> = {
  1: { tier: 1, cost: 50, hours: 6, maxUses: 2 },
  2: { tier: 2, cost: 100, hours: 12, maxUses: 3 },
  3: { tier: 3, cost: 200, hours: 24, maxUses: 5 },
  4: { tier: 4, cost: 400, hours: 48, maxUses: 5 },
  5: { tier: 5, cost: 800, hours: 72, maxUses: 10 },
};

export const DEFAULT_EQUIPMENT_RESEARCH_CAPABILITIES: EquipmentResearchCapabilities = {
  refundPercent: 0,
  refundCap: 0,
  researchCostDiscountPercent: 0,
  researchCostDiscountCap: 0,
  researchTimeDiscountPercent: 0,
  researchTimeDiscountMaxHours: 0,
  rushDiscountPercent: 0,
  creditBonusPercent: 0,
  creditBonusCap: 0,
  trainingModule: false,
  zuluCountermeasure: false,
  customWeaponSlot: false,
};

const DAY_HOURS = 24;
const T5_MIN_DURATION_HOURS = 120 * DAY_HOURS;

export const EQUIPMENT_RESEARCH_NODES: EquipmentResearchNode[] = [
  {
    key: "BIO-01",
    tier: 1,
    branch: "bio",
    name: "생체 보정",
    summary: "초기 생체 반응을 안정화해 HP를 1단계 보정한다.",
    cost: 120,
    durationHours: 2 * DAY_HOURS,
    allowedScopes: ["personal", "team"],
    effects: {
      personal: { kind: "stat", stat: "hp", amount: 1 },
      team: { kind: "stat", stat: "hp", amount: 1 },
    },
  },
  {
    key: "BIO-01B",
    tier: 1,
    branch: "bio",
    name: "생체 추가 보정",
    summary: "기초 보정 데이터를 한 번 더 맞춰 초반 HP 안정성을 확보한다.",
    cost: 140,
    durationHours: 3 * DAY_HOURS,
    prerequisiteKeys: ["BIO-01"],
    allowedScopes: ["personal", "team"],
    effects: {
      personal: { kind: "stat", stat: "hp", amount: 1 },
      team: { kind: "stat", stat: "hp", amount: 1 },
    },
  },
  {
    key: "PSY-01",
    tier: 1,
    branch: "psy",
    name: "정신 안정 보정",
    summary: "현장 투입 전 정신 안정 프로토콜을 1단계 보정한다.",
    cost: 120,
    durationHours: 2 * DAY_HOURS,
    allowedScopes: ["personal", "team"],
    effects: {
      personal: { kind: "stat", stat: "san", amount: 1 },
      team: { kind: "stat", stat: "san", amount: 1 },
    },
  },
  {
    key: "PSY-01B",
    tier: 1,
    branch: "psy",
    name: "정신 추가 보정",
    summary: "초기 안정 훈련을 보강해 SAN 변동폭을 한 번 더 줄인다.",
    cost: 140,
    durationHours: 3 * DAY_HOURS,
    prerequisiteKeys: ["PSY-01"],
    allowedScopes: ["personal", "team"],
    effects: {
      personal: { kind: "stat", stat: "san", amount: 1 },
      team: { kind: "stat", stat: "san", amount: 1 },
    },
  },
  {
    key: "LOG-01",
    tier: 1,
    branch: "log",
    name: "보급 정리",
    summary: "병기부 구매 후 일부 금액을 연구 정산 환급으로 돌린다.",
    cost: 100,
    durationHours: 3 * DAY_HOURS,
    allowedScopes: ["personal"],
    effects: {
      personal: { kind: "refund", percent: 3, cap: 30 },
    },
  },
  {
    key: "LAB-01",
    tier: 1,
    branch: "lab",
    name: "연구 기록 표준화",
    summary: "이후 연구의 첫 단축 집행 비용을 10% 낮춘다.",
    cost: 100,
    durationHours: 3 * DAY_HOURS,
    allowedScopes: ["personal"],
    effects: {
      personal: { kind: "rush_discount", percent: 10 },
    },
  },
  {
    key: "LAB-01B",
    tier: 1,
    branch: "lab",
    name: "견적 표준화",
    summary: "연구 견적 산식을 통일해 이후 연구 시작 비용을 낮춘다.",
    cost: 140,
    durationHours: 3 * DAY_HOURS,
    prerequisiteKeys: ["LAB-01"],
    allowedScopes: ["personal"],
    effects: {
      personal: { kind: "research_cost_discount", percent: 5, cap: 50 },
    },
  },
  {
    key: "BIO-02",
    tier: 2,
    branch: "bio",
    name: "생체 기초 강화",
    summary: "기초 생체 강화 시술로 HP를 안정적으로 끌어올린다.",
    cost: 300,
    durationHours: 8 * DAY_HOURS,
    allowedScopes: ["personal", "team"],
    effects: {
      personal: { kind: "stat", stat: "hp", amount: 2 },
      team: { kind: "stat", stat: "hp", amount: 1 },
    },
  },
  {
    key: "BIO-02B",
    tier: 2,
    branch: "bio",
    name: "생체 보강 강화",
    summary: "기초 강화 이후 회복력과 피로 저항을 추가 보강한다.",
    cost: 380,
    durationHours: 10 * DAY_HOURS,
    prerequisiteKeys: ["BIO-02"],
    allowedScopes: ["personal", "team"],
    effects: {
      personal: { kind: "stat", stat: "hp", amount: 3 },
      team: { kind: "stat", stat: "hp", amount: 2 },
    },
  },
  {
    key: "PSY-02",
    tier: 2,
    branch: "psy",
    name: "스트레스 기초 완충",
    summary: "전장 노출 스트레스에 대한 SAN 완충 훈련을 시작한다.",
    cost: 300,
    durationHours: 8 * DAY_HOURS,
    allowedScopes: ["personal", "team"],
    effects: {
      personal: { kind: "stat", stat: "san", amount: 2 },
      team: { kind: "stat", stat: "san", amount: 1 },
    },
  },
  {
    key: "PSY-02B",
    tier: 2,
    branch: "psy",
    name: "스트레스 보강 완충",
    summary: "기초 완충 훈련 이후 이상현상 노출 대응 절차를 보강한다.",
    cost: 380,
    durationHours: 10 * DAY_HOURS,
    prerequisiteKeys: ["PSY-02"],
    allowedScopes: ["personal", "team"],
    effects: {
      personal: { kind: "stat", stat: "san", amount: 3 },
      team: { kind: "stat", stat: "san", amount: 2 },
    },
  },
  {
    key: "MUN-02",
    tier: 2,
    branch: "mun",
    name: "조준 보정",
    summary: "개인 화기/병기 운용 데이터를 보정하고 분대 조준 표준을 정리한다.",
    cost: 400,
    durationHours: 10 * DAY_HOURS,
    allowedScopes: ["personal", "team"],
    effects: {
      personal: { kind: "stat", stat: "atk", amount: 1 },
      team: {
        kind: "unlock",
        code: "training_module",
        label: "분대 조준 표준화",
      },
    },
  },
  {
    key: "TRN-02",
    tier: 2,
    branch: "trn",
    name: "훈련 모듈",
    summary: "무기 훈련 또는 기술 훈련 추가권을 해금한다.",
    cost: 300,
    durationHours: 10 * DAY_HOURS,
    allowedScopes: ["personal", "team"],
    effects: {
      personal: {
        kind: "unlock",
        code: "training_module",
        label: "훈련 추가권",
      },
      team: {
        kind: "unlock",
        code: "training_module",
        label: "팀 훈련 모듈",
      },
    },
  },
  {
    key: "LOG-02",
    tier: 2,
    branch: "log",
    name: "구매 환급 라인",
    summary: "병기부 구매 환급률과 회당 환급 상한을 한 단계 올린다.",
    cost: 280,
    durationHours: 8 * DAY_HOURS,
    prerequisiteKeys: ["LOG-01"],
    allowedScopes: ["personal"],
    effects: {
      personal: { kind: "refund", percent: 5, cap: 75 },
    },
  },
  {
    key: "LAB-02",
    tier: 2,
    branch: "lab",
    name: "연구 동선 단축",
    summary: "승인, 장비 반출, 시료 대기 시간을 줄여 연구 기본 시간을 낮춘다.",
    cost: 320,
    durationHours: 8 * DAY_HOURS,
    prerequisiteKeys: ["LAB-01B"],
    allowedScopes: ["personal"],
    effects: {
      personal: { kind: "research_time_discount", percent: 5, maxHours: 24 },
    },
  },
  {
    key: "BIO-03",
    tier: 3,
    branch: "bio",
    name: "분대 생존 패키지",
    summary: "개인 또는 팀 단위 생존 키트와 시술 표준을 정리해 HP를 올린다.",
    cost: 900,
    durationHours: 21 * DAY_HOURS,
    allowedScopes: ["personal", "team"],
    effects: {
      personal: { kind: "stat", stat: "hp", amount: 4 },
      team: { kind: "stat", stat: "hp", amount: 4 },
    },
  },
  {
    key: "PSY-03",
    tier: 3,
    branch: "psy",
    name: "현장 안정 프로토콜",
    summary: "현장팀 전체의 이상현상 대응 안정성을 끌어올린다.",
    cost: 900,
    durationHours: 21 * DAY_HOURS,
    allowedScopes: ["personal", "team"],
    effects: {
      personal: { kind: "stat", stat: "san", amount: 4 },
      team: { kind: "stat", stat: "san", amount: 4 },
    },
  },
  {
    key: "MUN-03",
    tier: 3,
    branch: "mun",
    name: "화력 교범",
    summary: "실전 화력 교범을 갱신해 개인 또는 팀 ATK를 보정한다.",
    cost: 1_000,
    durationHours: 21 * DAY_HOURS,
    allowedScopes: ["personal", "team"],
    effects: {
      personal: { kind: "stat", stat: "atk", amount: 1 },
      team: { kind: "stat", stat: "atk", amount: 1 },
    },
  },
  {
    key: "CNT-03",
    tier: 3,
    branch: "cnt",
    name: "개체 대응 교범",
    summary: "특정 ZULU 또는 피해 유형 대응 장비 해금 후보를 연다.",
    cost: 800,
    durationHours: 21 * DAY_HOURS,
    allowedScopes: ["personal"],
    effects: {
      personal: {
        kind: "unlock",
        code: "zulu_countermeasure",
        label: "개체 대응 장비 후보",
      },
    },
  },
  {
    key: "LOG-03",
    tier: 3,
    branch: "log",
    name: "성과 보너스 정산",
    summary: "임무 성과 정산 시 크레딧 보너스를 받을 수 있는 회계 항목을 연다.",
    cost: 700,
    durationHours: 18 * DAY_HOURS,
    prerequisiteKeys: ["LOG-02"],
    allowedScopes: ["personal"],
    effects: {
      personal: { kind: "credit_bonus", percent: 3, cap: 100 },
    },
  },
  {
    key: "LAB-03",
    tier: 3,
    branch: "lab",
    name: "공용 시약 조달",
    summary: "공용 시약과 표준 부품을 선구매해 연구 시작 비용을 더 낮춘다.",
    cost: 750,
    durationHours: 18 * DAY_HOURS,
    prerequisiteKeys: ["LAB-02"],
    allowedScopes: ["personal"],
    effects: {
      personal: { kind: "research_cost_discount", percent: 8, cap: 120 },
    },
  },
  {
    key: "BIO-04",
    tier: 4,
    branch: "bio",
    name: "강화 시술",
    summary: "고급 강화 시술로 개인 또는 팀 HP를 크게 올린다.",
    cost: 1_600,
    durationHours: 45 * DAY_HOURS,
    allowedScopes: ["personal", "team"],
    effects: {
      personal: { kind: "stat", stat: "hp", amount: 7 },
      team: { kind: "stat", stat: "hp", amount: 5 },
    },
  },
  {
    key: "BIO-04B",
    tier: 4,
    branch: "bio",
    name: "강화 시술 보강",
    summary: "고급 강화 시술 이후 거부 반응을 줄이고 HP 상승분을 보강한다.",
    cost: 1_850,
    durationHours: 45 * DAY_HOURS,
    prerequisiteKeys: ["BIO-04"],
    allowedScopes: ["personal", "team"],
    effects: {
      personal: { kind: "stat", stat: "hp", amount: 5 },
      team: { kind: "stat", stat: "hp", amount: 3 },
    },
  },
  {
    key: "PSY-04",
    tier: 4,
    branch: "psy",
    name: "이상현상 내성 훈련",
    summary: "비정상 노출에 대한 고급 SAN 내성 훈련.",
    cost: 1_600,
    durationHours: 45 * DAY_HOURS,
    allowedScopes: ["personal", "team"],
    effects: {
      personal: { kind: "stat", stat: "san", amount: 7 },
      team: { kind: "stat", stat: "san", amount: 5 },
    },
  },
  {
    key: "PSY-04B",
    tier: 4,
    branch: "psy",
    name: "내성 훈련 보강",
    summary: "고급 SAN 내성 훈련의 사후 보정과 현장 복귀 절차를 강화한다.",
    cost: 1_850,
    durationHours: 45 * DAY_HOURS,
    prerequisiteKeys: ["PSY-04"],
    allowedScopes: ["personal", "team"],
    effects: {
      personal: { kind: "stat", stat: "san", amount: 5 },
      team: { kind: "stat", stat: "san", amount: 3 },
    },
  },
  {
    key: "MUN-04",
    tier: 4,
    branch: "mun",
    name: "고급 화력 제어",
    summary: "개인 또는 분대 병기 제어 능력을 고급 단계로 끌어올린다.",
    cost: 2_000,
    durationHours: 45 * DAY_HOURS,
    allowedScopes: ["personal", "team"],
    effects: {
      personal: { kind: "stat", stat: "atk", amount: 2 },
      team: { kind: "stat", stat: "atk", amount: 1 },
    },
  },
  {
    key: "CST-04",
    tier: 4,
    branch: "cst",
    name: "전용무기 설계 슬롯",
    summary: "캐릭터별 전용무기 제작 요청 슬롯을 해금한다.",
    cost: 1_500,
    durationHours: 45 * DAY_HOURS,
    allowedScopes: ["personal"],
    effects: {
      personal: {
        kind: "unlock",
        code: "custom_weapon_slot",
        label: "전용무기 제작 슬롯",
      },
    },
  },
  {
    key: "LOG-04",
    tier: 4,
    branch: "log",
    name: "고급 환급 계약",
    summary: "고가 장비 구매 시 적용되는 환급 계약 한도를 확장한다.",
    cost: 1_200,
    durationHours: 36 * DAY_HOURS,
    prerequisiteKeys: ["LOG-03"],
    allowedScopes: ["personal"],
    effects: {
      personal: { kind: "refund", percent: 8, cap: 150 },
    },
  },
  {
    key: "LAB-04",
    tier: 4,
    branch: "lab",
    name: "병렬 연구 셀",
    summary: "일부 연구 절차를 병렬화해 장기 연구의 기본 소요 시간을 줄인다.",
    cost: 1_250,
    durationHours: 36 * DAY_HOURS,
    prerequisiteKeys: ["LAB-03"],
    allowedScopes: ["personal"],
    effects: {
      personal: { kind: "research_time_discount", percent: 10, maxHours: 72 },
    },
  },
  {
    key: "AEG-05",
    tier: 5,
    branch: "aeg",
    name: "최종 방호 프로토콜",
    summary: "시즌급 최종 방호 연구. 선택 캐릭터 DEF를 1 올린다.",
    cost: 5_000,
    durationHours: 150 * DAY_HOURS,
    minDurationHours: T5_MIN_DURATION_HOURS,
    allowedScopes: ["personal"],
    effects: {
      personal: { kind: "stat", stat: "def", amount: 1 },
    },
  },
  {
    key: "BIO-05",
    tier: 5,
    branch: "bio",
    name: "생체 한계 돌파",
    summary: "시즌급 생체 한계 돌파 연구. 개인 또는 분대 HP를 크게 올린다.",
    cost: 4_000,
    durationHours: 150 * DAY_HOURS,
    minDurationHours: T5_MIN_DURATION_HOURS,
    allowedScopes: ["personal", "team"],
    effects: {
      personal: { kind: "stat", stat: "hp", amount: 10 },
      team: { kind: "stat", stat: "hp", amount: 8 },
    },
  },
  {
    key: "PSY-05",
    tier: 5,
    branch: "psy",
    name: "정신 한계 돌파",
    summary: "시즌급 정신 한계 돌파 연구. 개인 또는 분대 SAN을 크게 올린다.",
    cost: 4_000,
    durationHours: 150 * DAY_HOURS,
    minDurationHours: T5_MIN_DURATION_HOURS,
    allowedScopes: ["personal", "team"],
    effects: {
      personal: { kind: "stat", stat: "san", amount: 10 },
      team: { kind: "stat", stat: "san", amount: 8 },
    },
  },
  {
    key: "MUN-05",
    tier: 5,
    branch: "mun",
    name: "전술 한계 돌파",
    summary: "시즌급 전술 한계 돌파 연구. 개인 또는 분대 ATK를 크게 올린다.",
    cost: 5_000,
    durationHours: 150 * DAY_HOURS,
    minDurationHours: T5_MIN_DURATION_HOURS,
    allowedScopes: ["personal", "team"],
    effects: {
      personal: { kind: "stat", stat: "atk", amount: 3 },
      team: { kind: "stat", stat: "atk", amount: 2 },
    },
  },
  {
    key: "PTS-05",
    tier: 5,
    branch: "pts",
    name: "특별 성장 배정",
    summary: "시즌당 1회급 특별 성장 연구. 선택 캐릭터에게 보너스 포인트를 지급한다.",
    cost: 3_000,
    durationHours: 150 * DAY_HOURS,
    minDurationHours: T5_MIN_DURATION_HOURS,
    allowedScopes: ["personal"],
    effects: {
      personal: { kind: "point", amount: 2 },
    },
  },
  {
    key: "LOG-05",
    tier: 5,
    branch: "log",
    name: "성과 배당 계약",
    summary: "시즌급 임무 성과 정산에 더 높은 크레딧 보너스 한도를 적용한다.",
    cost: 2_500,
    durationHours: 150 * DAY_HOURS,
    minDurationHours: T5_MIN_DURATION_HOURS,
    prerequisiteKeys: ["LOG-04"],
    allowedScopes: ["personal"],
    effects: {
      personal: { kind: "credit_bonus", percent: 5, cap: 250 },
    },
  },
  {
    key: "LAB-05",
    tier: 5,
    branch: "lab",
    name: "최종 연구 승인권",
    summary: "고위 승인권과 전담 장비 슬롯을 배정해 연구 단축 비용을 크게 낮춘다.",
    cost: 2_700,
    durationHours: 150 * DAY_HOURS,
    minDurationHours: T5_MIN_DURATION_HOURS,
    prerequisiteKeys: ["LAB-04"],
    allowedScopes: ["personal"],
    effects: {
      personal: { kind: "rush_discount", percent: 20 },
    },
  },
];

export function isEquipmentResearchScope(
  value: unknown,
): value is EquipmentResearchScope {
  return (
    typeof value === "string" &&
    (EQUIPMENT_RESEARCH_SCOPES as readonly string[]).includes(value)
  );
}

export function isEquipmentResearchStat(
  value: unknown,
): value is EquipmentResearchStat {
  return (
    typeof value === "string" &&
    (EQUIPMENT_RESEARCH_STATS as readonly string[]).includes(value)
  );
}

export function isEquipmentResearchTier(
  value: unknown,
): value is EquipmentResearchTier {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    (EQUIPMENT_RESEARCH_TIERS as readonly number[]).includes(value)
  );
}

export function getEquipmentResearchNode(
  key: string,
): EquipmentResearchNode | null {
  return EQUIPMENT_RESEARCH_NODES.find((node) => node.key === key) ?? null;
}

export function getEquipmentResearchEffect(
  node: EquipmentResearchNode,
  scope: EquipmentResearchScope,
): EquipmentResearchEffect | null {
  if (!node.allowedScopes.includes(scope)) return null;
  return node.effects[scope] ?? null;
}

export function getEquipmentResearchPrerequisiteTier(
  tier: EquipmentResearchTier,
): EquipmentResearchTier | null {
  if (tier === 1) return null;
  return (tier - 1) as EquipmentResearchTier;
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

export function getComputedResearchStatus(
  project: Pick<EquipmentResearchProjectLike, "completedAt"> & {
    status: EquipmentResearchStatus;
  },
  now = new Date(),
): EquipmentResearchStatus | "completed" {
  if (project.status !== "in_progress") return project.status;
  return project.completedAt.getTime() <= now.getTime()
    ? "completed"
    : "in_progress";
}

export function getMinimumCompletedAt(
  node: EquipmentResearchNode,
  startedAt: Date,
): Date {
  return addHours(startedAt, node.minDurationHours ?? 0);
}

export function applyEquipmentResearchCapabilityEffect(
  capabilities: EquipmentResearchCapabilities,
  effect: EquipmentResearchEffect,
): EquipmentResearchCapabilities {
  if (effect.kind === "refund") {
    return {
      ...capabilities,
      refundPercent: Math.max(capabilities.refundPercent, effect.percent),
      refundCap: Math.max(capabilities.refundCap, effect.cap),
    };
  }
  if (effect.kind === "research_cost_discount") {
    return {
      ...capabilities,
      researchCostDiscountPercent: Math.max(
        capabilities.researchCostDiscountPercent,
        effect.percent,
      ),
      researchCostDiscountCap: Math.max(
        capabilities.researchCostDiscountCap,
        effect.cap,
      ),
    };
  }
  if (effect.kind === "research_time_discount") {
    return {
      ...capabilities,
      researchTimeDiscountPercent: Math.max(
        capabilities.researchTimeDiscountPercent,
        effect.percent,
      ),
      researchTimeDiscountMaxHours: Math.max(
        capabilities.researchTimeDiscountMaxHours,
        effect.maxHours,
      ),
    };
  }
  if (effect.kind === "rush_discount") {
    return {
      ...capabilities,
      rushDiscountPercent: Math.max(
        capabilities.rushDiscountPercent,
        effect.percent,
      ),
    };
  }
  if (effect.kind === "credit_bonus") {
    return {
      ...capabilities,
      creditBonusPercent: Math.max(
        capabilities.creditBonusPercent,
        effect.percent,
      ),
      creditBonusCap: Math.max(capabilities.creditBonusCap, effect.cap),
    };
  }
  if (effect.kind === "unlock") {
    return {
      ...capabilities,
      trainingModule:
        capabilities.trainingModule || effect.code === "training_module",
      zuluCountermeasure:
        capabilities.zuluCountermeasure ||
        effect.code === "zulu_countermeasure",
      customWeaponSlot:
        capabilities.customWeaponSlot || effect.code === "custom_weapon_slot",
    };
  }
  return capabilities;
}

export function quoteEquipmentResearchStart(args: {
  node: EquipmentResearchNode;
  capabilities: EquipmentResearchCapabilities;
}): EquipmentResearchStartQuote {
  const { node, capabilities } = args;
  const rawCostDiscount = Math.floor(
    (node.cost * capabilities.researchCostDiscountPercent) / 100,
  );
  const costDiscount = Math.min(
    capabilities.researchCostDiscountCap,
    rawCostDiscount,
  );
  const rawDurationReductionHours = Math.floor(
    (node.durationHours * capabilities.researchTimeDiscountPercent) / 100,
  );
  const durationReductionHours = Math.min(
    capabilities.researchTimeDiscountMaxHours,
    rawDurationReductionHours,
  );
  const minDurationHours = node.minDurationHours ?? 1;
  const durationHours = Math.max(
    minDurationHours,
    node.durationHours - durationReductionHours,
  );

  return {
    cost: Math.max(1, node.cost - costDiscount),
    durationHours,
    costDiscount,
    durationReductionHours: node.durationHours - durationHours,
  };
}

export function quoteEquipmentResearchRush(args: {
  node: EquipmentResearchNode;
  project: EquipmentResearchProjectLike;
  capabilities: EquipmentResearchCapabilities;
  now?: Date;
}): EquipmentResearchRushQuote | null {
  const { node, project, capabilities } = args;
  const now = args.now ?? new Date();
  const rule = EQUIPMENT_RESEARCH_RUSH_RULES[project.tier];
  if (project.rushUsed >= rule.maxUses) return null;
  if (project.completedAt.getTime() <= now.getTime()) return null;

  const minCompletedAt = getMinimumCompletedAt(node, project.startedAt);
  const rawNextCompletedAt = addHours(project.completedAt, -rule.hours);
  const nextCompletedAt =
    rawNextCompletedAt.getTime() < minCompletedAt.getTime()
      ? minCompletedAt
      : rawNextCompletedAt;
  const reducedHours = Math.floor(
    (project.completedAt.getTime() - nextCompletedAt.getTime()) /
      (60 * 60 * 1000),
  );
  if (reducedHours <= 0) return null;

  const discountApplied =
    capabilities.rushDiscountPercent > 0 && project.rushDiscountUsed !== true;
  const cost = discountApplied
    ? Math.max(
        1,
        Math.round(rule.cost * (1 - capabilities.rushDiscountPercent / 100)),
      )
    : rule.cost;

  return {
    cost,
    hours: reducedHours,
    discountApplied,
    maxUses: rule.maxUses,
    nextCompletedAt,
  };
}

export function describeEquipmentResearchEffect(
  effect: EquipmentResearchEffect,
): string {
  if (effect.kind === "stat") {
    return `${effect.stat.toUpperCase()} +${effect.amount}`;
  }
  if (effect.kind === "point") {
    return `BONUS POINT +${effect.amount}`;
  }
  if (effect.kind === "refund") {
    return `구매 환급 ${effect.percent}% · cap ${effect.cap} CR`;
  }
  if (effect.kind === "research_cost_discount") {
    return `연구 비용 ${effect.percent}% 감소 · cap ${effect.cap} CR`;
  }
  if (effect.kind === "research_time_discount") {
    return `연구 시간 ${effect.percent}% 감소 · 최대 ${effect.maxHours}h`;
  }
  if (effect.kind === "rush_discount") {
    return `첫 연구 단축 비용 ${effect.percent}% 감소`;
  }
  if (effect.kind === "credit_bonus") {
    return `크레딧 보너스 ${effect.percent}% · cap ${effect.cap} CR`;
  }
  return effect.label;
}

export function scopeLabel(scope: EquipmentResearchScope): string {
  return scope === "team" ? "팀" : "개인";
}
