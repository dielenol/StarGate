export const EQUIPMENT_RESEARCH_STATUS = [
  "in_progress",
  "applying",
  "applied",
] as const;

export const EQUIPMENT_RESEARCH_SCOPES = ["personal", "team"] as const;
export const EQUIPMENT_RESEARCH_STATS = ["hp", "san", "atk", "def"] as const;
export const EQUIPMENT_RESEARCH_TIERS = [1, 2, 3, 4, 5] as const;

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
      kind: "rush_discount";
      percent: number;
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
  rushDiscountPercent: number;
  trainingModule: boolean;
  zuluCountermeasure: boolean;
  customWeaponSlot: boolean;
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
  hp: 30,
  san: 30,
  atk: 5,
  def: 1,
  points: 2,
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
  rushDiscountPercent: 0,
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
    summary: "초기 생체 반응을 안정화해 HP를 소폭 보정한다.",
    cost: 150,
    durationHours: 3 * DAY_HOURS,
    allowedScopes: ["personal", "team"],
    effects: {
      personal: { kind: "stat", stat: "hp", amount: 2 },
      team: { kind: "stat", stat: "hp", amount: 1 },
    },
  },
  {
    key: "PSY-01",
    tier: 1,
    branch: "psy",
    name: "정신 안정 보정",
    summary: "현장 투입 전 정신 안정 프로토콜을 보정한다.",
    cost: 150,
    durationHours: 3 * DAY_HOURS,
    allowedScopes: ["personal", "team"],
    effects: {
      personal: { kind: "stat", stat: "san", amount: 2 },
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
    key: "BIO-02",
    tier: 2,
    branch: "bio",
    name: "생체 강화",
    summary: "개인 생체 강화 시술로 HP를 소폭 끌어올린다.",
    cost: 350,
    durationHours: 10 * DAY_HOURS,
    allowedScopes: ["personal"],
    effects: {
      personal: { kind: "stat", stat: "hp", amount: 5 },
    },
  },
  {
    key: "PSY-02",
    tier: 2,
    branch: "psy",
    name: "전장 스트레스 완충",
    summary: "전장 노출 스트레스에 대한 개인 SAN 완충 훈련.",
    cost: 350,
    durationHours: 10 * DAY_HOURS,
    allowedScopes: ["personal"],
    effects: {
      personal: { kind: "stat", stat: "san", amount: 5 },
    },
  },
  {
    key: "MUN-02",
    tier: 2,
    branch: "mun",
    name: "조준 보정",
    summary: "개인 화기/병기 운용 데이터를 보정해 ATK를 소폭 올린다.",
    cost: 400,
    durationHours: 10 * DAY_HOURS,
    allowedScopes: ["personal"],
    effects: {
      personal: { kind: "stat", stat: "atk", amount: 1 },
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
    allowedScopes: ["personal"],
    effects: {
      personal: {
        kind: "unlock",
        code: "training_module",
        label: "훈련 추가권",
      },
    },
  },
  {
    key: "BIO-03",
    tier: 3,
    branch: "bio",
    name: "분대 생존 패키지",
    summary: "팀 단위 생존 키트와 시술 표준을 정리해 HP를 올린다.",
    cost: 900,
    durationHours: 21 * DAY_HOURS,
    allowedScopes: ["team"],
    effects: {
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
    allowedScopes: ["team"],
    effects: {
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
    key: "BIO-04",
    tier: 4,
    branch: "bio",
    name: "강화 시술",
    summary: "고급 강화 시술로 개인 또는 팀 HP를 크게 올린다.",
    cost: 1_800,
    durationHours: 45 * DAY_HOURS,
    allowedScopes: ["personal", "team"],
    effects: {
      personal: { kind: "stat", stat: "hp", amount: 12 },
      team: { kind: "stat", stat: "hp", amount: 7 },
    },
  },
  {
    key: "PSY-04",
    tier: 4,
    branch: "psy",
    name: "이상현상 내성 훈련",
    summary: "비정상 노출에 대한 고급 SAN 내성 훈련.",
    cost: 1_800,
    durationHours: 45 * DAY_HOURS,
    allowedScopes: ["personal", "team"],
    effects: {
      personal: { kind: "stat", stat: "san", amount: 12 },
      team: { kind: "stat", stat: "san", amount: 7 },
    },
  },
  {
    key: "MUN-04",
    tier: 4,
    branch: "mun",
    name: "고급 화력 제어",
    summary: "개인 병기 제어 능력을 고급 단계로 끌어올린다.",
    cost: 2_000,
    durationHours: 45 * DAY_HOURS,
    allowedScopes: ["personal"],
    effects: {
      personal: { kind: "stat", stat: "atk", amount: 2 },
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
    summary: "시즌급 생체 한계 돌파 연구. 선택 캐릭터 HP를 크게 올린다.",
    cost: 4_000,
    durationHours: 150 * DAY_HOURS,
    minDurationHours: T5_MIN_DURATION_HOURS,
    allowedScopes: ["personal"],
    effects: {
      personal: { kind: "stat", stat: "hp", amount: 20 },
    },
  },
  {
    key: "PSY-05",
    tier: 5,
    branch: "psy",
    name: "정신 한계 돌파",
    summary: "시즌급 정신 한계 돌파 연구. 선택 캐릭터 SAN을 크게 올린다.",
    cost: 4_000,
    durationHours: 150 * DAY_HOURS,
    minDurationHours: T5_MIN_DURATION_HOURS,
    allowedScopes: ["personal"],
    effects: {
      personal: { kind: "stat", stat: "san", amount: 20 },
    },
  },
  {
    key: "MUN-05",
    tier: 5,
    branch: "mun",
    name: "전술 한계 돌파",
    summary: "시즌급 전술 한계 돌파 연구. 선택 캐릭터 ATK를 크게 올린다.",
    cost: 5_000,
    durationHours: 150 * DAY_HOURS,
    minDurationHours: T5_MIN_DURATION_HOURS,
    allowedScopes: ["personal"],
    effects: {
      personal: { kind: "stat", stat: "atk", amount: 3 },
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
  if (effect.kind === "rush_discount") {
    return `첫 연구 단축 비용 ${effect.percent}% 감소`;
  }
  return effect.label;
}

export function scopeLabel(scope: EquipmentResearchScope): string {
  return scope === "team" ? "팀" : "개인";
}
