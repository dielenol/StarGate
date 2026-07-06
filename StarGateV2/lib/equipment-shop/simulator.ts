export const SIMULATOR_BOARD_COLUMNS = ["A", "B", "C", "D", "E"] as const;
export const SIMULATOR_BOARD_ROWS = [1, 2, 3, 4, 5] as const;

export type SimulatorBoardColumn = (typeof SIMULATOR_BOARD_COLUMNS)[number];
export type SimulatorBoardRow = (typeof SIMULATOR_BOARD_ROWS)[number];

export interface SimulatorBoardCoord {
  col: SimulatorBoardColumn;
  row: SimulatorBoardRow;
}

export type SimulatorRangeBand = "near" | "mid" | "far";
export type SimulatorDamageKind = "physical" | "fire" | "sound";
export type SimulatorTargetStat = "hp" | "san";
export type SimulatorStatusKind = "burn";
export type SimulatorWeaponRole = "냉병기" | "화기" | "설치화기" | "특수화기";
export type SimulatorResourceKind = "ammo" | "charge";

export interface SimulatorAttackerProfile {
  codename: string;
  atk: number;
  hp: number;
  san: number;
  source: "agent" | "sandbox";
}

export interface SimulatorTargetStats {
  hp: number;
  maxHp: number;
  san: number;
  maxSan: number;
  def: number;
  statuses: SimulatorStatusKind[];
}

export interface SimulatorDamageProfile {
  amount: number;
  kind: SimulatorDamageKind;
  label: string;
  targetStat: SimulatorTargetStat;
  appliesDef: boolean;
  statuses?: SimulatorStatusKind[];
}

export interface SimulatorWeaponRule {
  slug: string;
  name: string;
  role: SimulatorWeaponRole;
  price: number;
  ranges: Partial<Record<SimulatorRangeBand, SimulatorDamageProfile>>;
  resource?: {
    kind: SimulatorResourceKind;
    label: string;
    max: number;
  };
  usesAtkBonus: boolean;
  requiresSetup?: boolean;
  cadence?: {
    cycleTurns: number;
    shotsPerCycle: number;
  };
  description: string;
  notes: string[];
}

export interface SimulatorRangeState {
  verticalDistance: number;
  band: SimulatorRangeBand;
}

export type SimulatorAttackFailureReason =
  | "NO_RULE"
  | "OUT_OF_RANGE"
  | "NO_RESOURCE"
  | "SETUP_REQUIRED"
  | "CADENCE_LOCKED";

export interface SimulatorAttackRuntime {
  resourceRemaining?: number;
  installed?: boolean;
  turn?: number;
  shotsInCycle?: number;
}

export interface SimulatorAttackInput {
  weaponSlug: string;
  attacker: SimulatorBoardCoord;
  target: SimulatorBoardCoord;
  attackerStats: Pick<SimulatorAttackerProfile, "atk">;
  targetStats: Pick<SimulatorTargetStats, "def">;
  runtime?: SimulatorAttackRuntime;
}

export interface SimulatorAttackResult {
  ok: boolean;
  reason?: SimulatorAttackFailureReason;
  reasonLabel?: string;
  range: SimulatorRangeState;
  rule?: SimulatorWeaponRule;
  profile?: SimulatorDamageProfile;
  rawDamage: number;
  mitigation: number;
  damageApplied: number;
  targetStat?: SimulatorTargetStat;
  statusesApplied: SimulatorStatusKind[];
  nextResourceRemaining?: number;
  nextShotsInCycle?: number;
  summary: string;
}

export const SIMULATOR_RANGE_BANDS = ["near", "mid", "far"] as const;

export const SIMULATOR_RANGE_LABELS: Record<SimulatorRangeBand, string> = {
  near: "근거리",
  mid: "중거리",
  far: "장거리",
};

export const SIMULATOR_DAMAGE_KIND_LABELS: Record<
  SimulatorDamageKind,
  string
> = {
  physical: "물리",
  fire: "화염",
  sound: "소리",
};

export const SIMULATOR_TARGET_STAT_LABELS: Record<SimulatorTargetStat, string> = {
  hp: "HP",
  san: "정신력",
};

export const SIMULATOR_STATUS_LABELS: Record<SimulatorStatusKind, string> = {
  burn: "화상",
};

function physical(amount: number): SimulatorDamageProfile {
  return {
    amount,
    kind: "physical",
    label: "물리",
    targetStat: "hp",
    appliesDef: true,
  };
}

function fire(amount: number): SimulatorDamageProfile {
  return {
    amount,
    kind: "fire",
    label: "화염",
    targetStat: "hp",
    appliesDef: false,
    statuses: ["burn"],
  };
}

function sound(amount: number): SimulatorDamageProfile {
  return {
    amount,
    kind: "sound",
    label: "소리",
    targetStat: "san",
    appliesDef: false,
  };
}

export const SIMULATOR_WEAPON_RULES: Record<string, SimulatorWeaponRule> = {
  "basic-dagger": {
    slug: "basic-dagger",
    name: "보급형 단검",
    role: "냉병기",
    price: 100,
    ranges: {
      near: physical(5),
      mid: physical(5),
    },
    usesAtkBonus: true,
    description:
      "근접 공격과 투척 운용을 모두 시험할 수 있는 기본 단검입니다.",
    notes: [
      "장거리 투척 및 회수 가능 규칙은 메모로만 표시합니다.",
      "장거리 피해값은 아직 확정하지 않았습니다.",
    ],
  },
  "basic-katana": {
    slug: "basic-katana",
    name: "보급형 카타나",
    role: "냉병기",
    price: 200,
    ranges: {
      near: physical(10),
    },
    usesAtkBonus: true,
    description: "100~160 cm 장검류 기준의 근접 냉병기입니다.",
    notes: ["근거리에서만 피해를 적용합니다."],
  },
  "basic-longsword": {
    slug: "basic-longsword",
    name: "보급형 롱소드",
    role: "냉병기",
    price: 200,
    ranges: {
      near: physical(10),
    },
    usesAtkBonus: true,
    description: "100~160 cm 장검류 기준의 근접 냉병기입니다.",
    notes: ["근거리에서만 피해를 적용합니다."],
  },
  "basic-blunt-weapon": {
    slug: "basic-blunt-weapon",
    name: "보급형 둔기",
    role: "냉병기",
    price: 200,
    ranges: {
      near: physical(10),
    },
    usesAtkBonus: true,
    description: "무게와 휘두르는 힘으로 타격하는 기본 둔기류입니다.",
    notes: ["근거리에서만 피해를 적용합니다."],
  },
  "basic-chainsaw": {
    slug: "basic-chainsaw",
    name: "보급형 전기톱",
    role: "냉병기",
    price: 200,
    ranges: {
      near: physical(15),
    },
    resource: {
      kind: "charge",
      label: "시동",
      max: 5,
    },
    usesAtkBonus: true,
    description: "5회 사용 후 다시 시동을 걸어야 하는 근접 장비입니다.",
    notes: ["시동 잔량이 0이면 공격할 수 없습니다."],
  },
  "basic-pistol": {
    slug: "basic-pistol",
    name: "보급형 권총",
    role: "화기",
    price: 50,
    ranges: {
      near: physical(7),
      mid: physical(5),
    },
    resource: {
      kind: "ammo",
      label: "탄환",
      max: 5,
    },
    usesAtkBonus: false,
    description: "한 손 또는 양손으로 파지 가능한 소형 화기입니다.",
    notes: ["원거리 무기는 무기 고유 피해값을 사용합니다."],
  },
  "basic-assault-rifle": {
    slug: "basic-assault-rifle",
    name: "보급형 돌격소총",
    role: "화기",
    price: 200,
    ranges: {
      near: physical(5),
      mid: physical(10),
      far: physical(7),
    },
    resource: {
      kind: "ammo",
      label: "탄환",
      max: 6,
    },
    usesAtkBonus: false,
    description: "전 구간 시험이 가능한 기본 자동소총입니다.",
    notes: ["중거리에서 가장 높은 피해를 냅니다."],
  },
  "basic-shotgun": {
    slug: "basic-shotgun",
    name: "보급형 샷건",
    role: "화기",
    price: 200,
    ranges: {
      near: physical(15),
      mid: physical(5),
    },
    resource: {
      kind: "ammo",
      label: "탄환",
      max: 4,
    },
    usesAtkBonus: false,
    description: "근거리 산탄 피해가 큰 기본 산탄총입니다.",
    notes: ["장거리 피해는 적용하지 않습니다."],
  },
  "basic-heavy-machine-gun": {
    slug: "basic-heavy-machine-gun",
    name: "보급형 중기관총",
    role: "설치화기",
    price: 500,
    ranges: {
      mid: physical(15),
      far: physical(10),
    },
    resource: {
      kind: "ammo",
      label: "탄환",
      max: 10,
    },
    usesAtkBonus: false,
    requiresSetup: true,
    cadence: {
      cycleTurns: 3,
      shotsPerCycle: 2,
    },
    description: "설치 후 3턴 주기로 2회 사격 가능한 중화기입니다.",
    notes: ["설치 전에는 공격할 수 없습니다.", "근거리 피해는 적용하지 않습니다."],
  },
  "basic-sniper-rifle": {
    slug: "basic-sniper-rifle",
    name: "보급형 저격소총",
    role: "화기",
    price: 500,
    ranges: {
      far: physical(20),
    },
    resource: {
      kind: "ammo",
      label: "탄환",
      max: 3,
    },
    usesAtkBonus: false,
    description: "장거리에서만 강력한 피해를 내는 저격소총입니다.",
    notes: ["근거리와 중거리 피해는 적용하지 않습니다."],
  },
  "basic-flamethrower": {
    slug: "basic-flamethrower",
    name: "보급형 화염방사기",
    role: "특수화기",
    price: 500,
    ranges: {
      near: fire(10),
      mid: fire(8),
    },
    resource: {
      kind: "ammo",
      label: "연료",
      max: 4,
    },
    usesAtkBonus: false,
    description: "명중한 표적에게 화상 상태를 추가하는 화염 장비입니다.",
    notes: ["화염 피해에는 DEF를 적용하지 않습니다."],
  },
  "basic-sonic-emitter": {
    slug: "basic-sonic-emitter",
    name: "보급형 음파 방출기",
    role: "특수화기",
    price: 500,
    ranges: {
      mid: sound(15),
      far: sound(3),
    },
    resource: {
      kind: "ammo",
      label: "출력",
      max: 3,
    },
    usesAtkBonus: false,
    description: "일정 거리를 두고 정신력에 피해를 주는 음파 장비입니다.",
    notes: ["소리 피해는 HP가 아닌 정신력에 적용합니다."],
  },
};

export type SimulatorWeaponSlug = keyof typeof SIMULATOR_WEAPON_RULES;

export const SIMULATOR_WEAPON_ORDER = Object.keys(
  SIMULATOR_WEAPON_RULES,
) as SimulatorWeaponSlug[];

export function getSimulatorWeaponRule(
  slug: string,
): SimulatorWeaponRule | null {
  return SIMULATOR_WEAPON_RULES[slug as SimulatorWeaponSlug] ?? null;
}

export function formatSimulatorCoord(coord: SimulatorBoardCoord): string {
  return `${coord.col}${coord.row}`;
}

export function getSimulatorRange(
  attacker: SimulatorBoardCoord,
  target: SimulatorBoardCoord,
): SimulatorRangeState {
  const verticalDistance = Math.abs(attacker.row - target.row);
  if (verticalDistance === 0) {
    return { verticalDistance, band: "near" };
  }
  if (verticalDistance <= 2) {
    return { verticalDistance, band: "mid" };
  }
  return { verticalDistance, band: "far" };
}

export function formatSimulatorDamage(profile: SimulatorDamageProfile): string {
  return `${profile.amount} ${profile.label}`;
}

export function getInitialSimulatorResources(): Record<string, number> {
  return Object.fromEntries(
    Object.entries(SIMULATOR_WEAPON_RULES).map(([slug, rule]) => [
      slug,
      rule.resource?.max ?? 0,
    ]),
  );
}

export function getSimulatorCadenceCycle(turn: number, cycleTurns = 3): number {
  const normalizedTurn = Math.max(1, Math.floor(turn));
  return Math.floor((normalizedTurn - 1) / cycleTurns);
}

export function isNewSimulatorCadenceCycle(
  previousTurn: number,
  nextTurn: number,
  cycleTurns = 3,
): boolean {
  return (
    getSimulatorCadenceCycle(previousTurn, cycleTurns) !==
    getSimulatorCadenceCycle(nextTurn, cycleTurns)
  );
}

function failureResult(
  input: SimulatorAttackInput,
  reason: SimulatorAttackFailureReason,
  reasonLabel: string,
  rule?: SimulatorWeaponRule,
  profile?: SimulatorDamageProfile,
): SimulatorAttackResult {
  return {
    ok: false,
    reason,
    reasonLabel,
    range: getSimulatorRange(input.attacker, input.target),
    ...(rule ? { rule } : {}),
    ...(profile ? { profile } : {}),
    rawDamage: 0,
    mitigation: 0,
    damageApplied: 0,
    statusesApplied: [],
    summary: reasonLabel,
  };
}

export function resolveSimulatorAttack(
  input: SimulatorAttackInput,
): SimulatorAttackResult {
  const range = getSimulatorRange(input.attacker, input.target);
  const rule = getSimulatorWeaponRule(input.weaponSlug);
  if (!rule) {
    return failureResult(input, "NO_RULE", "등록되지 않은 장비입니다.");
  }

  const profile = rule.ranges[range.band];
  if (!profile) {
    return failureResult(
      input,
      "OUT_OF_RANGE",
      `${SIMULATOR_RANGE_LABELS[range.band]} 피해값이 없습니다.`,
      rule,
    );
  }

  const currentResource = rule.resource
    ? (input.runtime?.resourceRemaining ?? rule.resource.max)
    : undefined;
  if (rule.resource && (currentResource ?? 0) <= 0) {
    return failureResult(
      input,
      "NO_RESOURCE",
      `${rule.resource.label}이 부족합니다.`,
      rule,
      profile,
    );
  }

  if (rule.requiresSetup && input.runtime?.installed !== true) {
    return failureResult(
      input,
      "SETUP_REQUIRED",
      "설치 선언 후 사용할 수 있습니다.",
      rule,
      profile,
    );
  }

  const shotsInCycle = input.runtime?.shotsInCycle ?? 0;
  if (rule.cadence && shotsInCycle >= rule.cadence.shotsPerCycle) {
    return failureResult(
      input,
      "CADENCE_LOCKED",
      `${rule.cadence.cycleTurns}턴 주기 사격 횟수를 모두 사용했습니다.`,
      rule,
      profile,
    );
  }

  const atkBonus = rule.usesAtkBonus ? Math.max(0, input.attackerStats.atk) : 0;
  const rawDamage = profile.amount + atkBonus;
  const mitigation = profile.appliesDef
    ? Math.min(rawDamage, Math.max(0, input.targetStats.def))
    : 0;
  const damageApplied = Math.max(0, rawDamage - mitigation);
  const statusesApplied = profile.statuses ?? [];
  const nextResourceRemaining = rule.resource
    ? Math.max(0, (currentResource ?? rule.resource.max) - 1)
    : undefined;
  const nextShotsInCycle = rule.cadence ? shotsInCycle + 1 : undefined;

  return {
    ok: true,
    range,
    rule,
    profile,
    rawDamage,
    mitigation,
    damageApplied,
    targetStat: profile.targetStat,
    statusesApplied,
    ...(nextResourceRemaining !== undefined ? { nextResourceRemaining } : {}),
    ...(nextShotsInCycle !== undefined ? { nextShotsInCycle } : {}),
    summary: `${SIMULATOR_RANGE_LABELS[range.band]} ${damageApplied} ${SIMULATOR_TARGET_STAT_LABELS[profile.targetStat]} 피해`,
  };
}
