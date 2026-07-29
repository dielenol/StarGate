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
export type SimulatorStatusKind = "burn" | "dazed";
export type SimulatorWeaponActionKind =
  | "knockback"
  | "area-spray"
  | "incendiary-line";
export type SimulatorWeaponRole = "냉병기" | "화기" | "설치화기" | "특수화기";
export type SimulatorResourceKind = "ammo" | "charge";

export interface SimulatorAttackerProfile {
  codename: string;
  atk: number;
  hp: number;
  san: number;
  portraitUrl?: string;
  characterUrl?: string;
  source: "agent" | "sandbox";
}

export interface SimulatorEquippedWeapon {
  key: string;
  slug?: SimulatorWeaponSlug;
  name: string;
  previewImage?: string;
}

export interface SimulatorTargetStats {
  hp: number;
  maxHp: number;
  san: number;
  maxSan: number;
  def: number;
  statuses: SimulatorStatusKind[];
  statusRounds: Partial<Record<SimulatorStatusKind, number>>;
}

export interface SimulatorDamageProfile {
  amount: number;
  kind: SimulatorDamageKind;
  label: string;
  targetStat: SimulatorTargetStat;
  appliesDef: boolean;
  armorPenetration?: number;
  statuses?: SimulatorStatusKind[];
}

export interface SimulatorWeaponAction {
  kind: SimulatorWeaponActionKind;
  name: string;
  resourceCost: number | "all";
  description: string;
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
  actions?: SimulatorWeaponAction[];
  description: string;
  notes: string[];
}

export interface SimulatorRangeState {
  verticalDistance: number;
  band: SimulatorRangeBand;
  attackDistance?: number;
  attackAxis?: "horizontal" | "vertical" | "diamond";
}

export type SimulatorAttackFailureReason =
  | "NO_RULE"
  | "NOT_CARDINAL"
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
  attackerStatuses?: Pick<SimulatorTargetStats, "statuses" | "statusRounds">;
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

export interface SimulatorAreaSprayOutcome {
  result: SimulatorAttackResult;
  roll: number;
  hit: boolean;
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
  dazed: "멍함",
};

export const SIMULATOR_STATUS_RULES: Record<
  SimulatorStatusKind,
  {
    description: string;
    effect: string;
    durationRounds?: number;
    persistentUntilRecovery?: boolean;
    ongoingDamage?: number;
    armorReduction?: number;
    rangedAttackReductionPercent?: number;
  }
> = {
  burn: {
    description: "화염방사기에 명중하거나 소이선에 들어선 대상에게 부여됩니다.",
    effect: "3라운드 동안 라운드마다 5 피해를 입고 방어력이 5 감소합니다.",
    durationRounds: 3,
    ongoingDamage: 5,
    armorReduction: 5,
  },
  dazed: {
    description: "음파 방출기에 명중한 대상에게 부여됩니다.",
    effect: "다음 1라운드 동안 원거리 공격 피해가 20% 감소합니다.",
    durationRounds: 1,
    rangedAttackReductionPercent: 20,
  },
};

function physical(
  amount: number,
  armorPenetration?: number,
): SimulatorDamageProfile {
  return {
    amount,
    kind: "physical",
    label: "물리",
    targetStat: "hp",
    appliesDef: true,
    ...(armorPenetration ? { armorPenetration } : {}),
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
    statuses: ["dazed"],
  };
}

const RANGED_RANGE_RULE_NOTE =
  "같은 영역은 근거리, 1~2영역 차이는 중거리, 3영역 이상 차이는 장거리로 판정합니다.";

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
    notes: [
      "원거리 무기는 무기 고유 피해값을 사용합니다.",
      RANGED_RANGE_RULE_NOTE,
    ],
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
    description: "흔히 자동소총을 의미하는 기본 소총류입니다.",
    notes: [RANGED_RANGE_RULE_NOTE],
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
    actions: [
      {
        kind: "knockback",
        name: "넉백",
        resourceCost: 2,
        description:
          "탄환 2를 소모합니다. 명중한 대상을 1칸 뒤로 물러나게 하며, 세로 전장에서는 사용할 수 없습니다.",
      },
    ],
    description: "근거리 산탄 피해가 큰 기본 샷건입니다.",
    notes: [RANGED_RANGE_RULE_NOTE, "장거리 피해는 적용하지 않습니다."],
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
      cycleTurns: 1,
      shotsPerCycle: 2,
    },
    actions: [
      {
        kind: "area-spray",
        name: "광역 난사",
        resourceCost: "all",
        description:
          "모든 탄환을 소모해 사거리 안의 모든 개체를 공격합니다. 각 대상은 1d6에서 4 이하가 나오면 피해를 입습니다.",
      },
    ],
    description: "설치 후 매 턴 2회 공격할 수 있는 중기관총입니다.",
    notes: [
      "자신의 턴에 설치를 선언한 뒤 사용할 수 있으며, 설치 후에는 이동할 수 없습니다.",
      "수평 전투에서는 대각선 범위에도 사거리를 부여합니다.",
      RANGED_RANGE_RULE_NOTE,
      "근거리 피해는 적용하지 않습니다.",
    ],
  },
  "basic-sniper-rifle": {
    slug: "basic-sniper-rifle",
    name: "보급형 저격소총",
    role: "화기",
    price: 500,
    ranges: {
      far: physical(20, 10),
    },
    resource: {
      kind: "ammo",
      label: "탄환",
      max: 3,
    },
    usesAtkBonus: false,
    description: "강력한 파괴력을 지닌 장거리 저격소총입니다.",
    notes: [
      RANGED_RANGE_RULE_NOTE,
      "철갑탄은 대상 방어력 10을 관통합니다.",
      "근거리와 중거리 피해는 적용하지 않습니다.",
    ],
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
      label: "탄환",
      max: 4,
    },
    usesAtkBonus: false,
    actions: [
      {
        kind: "incendiary-line",
        name: "소이선",
        resourceCost: 2,
        description:
          "탄환 2를 소모해 영역 하나 또는 전방 3칸의 가로·세로 화염 지대를 만듭니다. 지대는 3라운드 지속되며, 들어선 대상은 화상을 얻습니다.",
      },
    ],
    description:
      "화염 피해와 “화상” 상태이상을 부여하는 기본 군용 화염방사기입니다.",
    notes: [
      RANGED_RANGE_RULE_NOTE,
      "화염 피해에는 DEF를 적용하지 않습니다.",
      "소각: 명중한 대상은 3라운드 동안 라운드마다 5 피해를 입고 방어력이 5 감소하는 화상을 얻습니다.",
    ],
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
      label: "탄환",
      max: 3,
    },
    usesAtkBonus: false,
    description: "일정 거리를 두고 정신력에 피해를 주는 음파 장비입니다.",
    notes: [
      RANGED_RANGE_RULE_NOTE,
      "소리 피해는 HP가 아닌 정신력에 적용합니다.",
      "정신 혼미: 명중한 대상은 다음 1라운드 동안 원거리 공격 피해가 20% 감소하는 멍함을 얻습니다.",
    ],
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

export function getSimulatorEquippedWeapons(
  entries: readonly {
    itemName: string;
    slug?: string;
    previewImage?: string;
    equippedSlot?: string;
  }[],
): SimulatorEquippedWeapon[] {
  const seen = new Set<string>();

  return entries.flatMap((entry) => {
    if (entry.equippedSlot !== "WEAPON") return [];
    const rule = entry.slug ? getSimulatorWeaponRule(entry.slug) : null;
    const key = entry.slug ?? `equipped:${entry.itemName}`;
    if (seen.has(key)) return [];

    seen.add(key);
    return [
      {
        key,
        ...(rule ? { slug: rule.slug as SimulatorWeaponSlug } : {}),
        name: entry.itemName,
        ...(entry.previewImage ? { previewImage: entry.previewImage } : {}),
      },
    ];
  });
}

export function formatSimulatorCoord(coord: SimulatorBoardCoord): string {
  return `${coord.col}${coord.row}`;
}

export function getSimulatorRange(
  attacker: SimulatorBoardCoord,
  target: SimulatorBoardCoord,
): SimulatorRangeState {
  const verticalDistance = Math.abs(attacker.row - target.row);
  return { verticalDistance, band: getSimulatorRangeBand(verticalDistance) };
}

function getSimulatorRangeBand(distance: number): SimulatorRangeBand {
  if (distance === 0) return "near";
  if (distance <= 2) return "mid";
  return "far";
}

function requiresCardinalAlignment(rule: SimulatorWeaponRule): boolean {
  return (
    rule.role !== "냉병기" && rule.slug !== "basic-heavy-machine-gun"
  );
}

function getCardinalRange(
  attacker: SimulatorBoardCoord,
  target: SimulatorBoardCoord,
): SimulatorRangeState | null {
  const baseRange = getSimulatorRange(attacker, target);
  if (attacker.row === target.row) {
    const attackerColumn = SIMULATOR_BOARD_COLUMNS.indexOf(attacker.col);
    const targetColumn = SIMULATOR_BOARD_COLUMNS.indexOf(target.col);
    const attackDistance = Math.abs(attackerColumn - targetColumn);
    return {
      ...baseRange,
      band: getSimulatorRangeBand(attackDistance),
      attackDistance,
      attackAxis: "horizontal",
    };
  }
  if (attacker.col === target.col) {
    const attackDistance = baseRange.verticalDistance;
    return {
      ...baseRange,
      band: getSimulatorRangeBand(attackDistance),
      attackDistance,
      attackAxis: "vertical",
    };
  }
  return null;
}

function getManhattanRange(
  attacker: SimulatorBoardCoord,
  target: SimulatorBoardCoord,
): SimulatorRangeState {
  const attackerColumn = SIMULATOR_BOARD_COLUMNS.indexOf(attacker.col);
  const targetColumn = SIMULATOR_BOARD_COLUMNS.indexOf(target.col);
  const attackDistance =
    Math.abs(attackerColumn - targetColumn) +
    Math.abs(attacker.row - target.row);

  return {
    ...getSimulatorRange(attacker, target),
    band: getSimulatorRangeBand(attackDistance),
    attackDistance,
    attackAxis: "diamond",
  };
}

export function getSimulatorWeaponRange(
  weaponSlug: string,
  attacker: SimulatorBoardCoord,
  target: SimulatorBoardCoord,
): SimulatorRangeState | null {
  const rule = getSimulatorWeaponRule(weaponSlug);
  if (!rule) return null;
  if (rule.slug === "basic-heavy-machine-gun") {
    return getManhattanRange(attacker, target);
  }
  if (requiresCardinalAlignment(rule)) {
    return getCardinalRange(attacker, target);
  }
  return getSimulatorRange(attacker, target);
}

export function isSimulatorAttackableCell(
  weaponSlug: string,
  attacker: SimulatorBoardCoord,
  target: SimulatorBoardCoord,
): boolean {
  const rule = getSimulatorWeaponRule(weaponSlug);
  const range = getSimulatorWeaponRange(weaponSlug, attacker, target);
  if (!rule || !range) return false;
  if (
    rule.slug === "basic-heavy-machine-gun" &&
    (range.attackDistance ?? 0) > 4
  ) {
    return false;
  }
  return Boolean(rule.ranges[range.band]);
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

export function getSimulatorEffectiveDef(
  target: Pick<SimulatorTargetStats, "def" | "statuses" | "statusRounds">,
): number {
  const armorReduction = target.statuses.reduce((total, status) => {
    if ((target.statusRounds[status] ?? 0) <= 0) return total;
    return total + (SIMULATOR_STATUS_RULES[status].armorReduction ?? 0);
  }, 0);
  return Math.max(0, target.def - armorReduction);
}

export function getSimulatorRangedDamageMultiplier(
  attacker?: Pick<SimulatorTargetStats, "statuses" | "statusRounds">,
): number {
  if (!attacker) return 1;
  const reductionPercent = attacker.statuses.reduce((total, status) => {
    if ((attacker.statusRounds[status] ?? 0) <= 0) return total;
    return total + (SIMULATOR_STATUS_RULES[status].rangedAttackReductionPercent ?? 0);
  }, 0);
  return Math.max(0, 1 - reductionPercent / 100);
}

export function resolveSimulatorAreaSpray(
  results: readonly SimulatorAttackResult[],
  rollD6: () => number,
): SimulatorAreaSprayOutcome[] {
  return results.map((result) => {
    const roll = rollD6();
    return { result, roll, hit: result.ok && roll <= 4 };
  });
}

export function applySimulatorStatuses(
  target: SimulatorTargetStats,
  statuses: readonly SimulatorStatusKind[],
): SimulatorTargetStats {
  if (statuses.length === 0) return target;

  const nextStatuses = Array.from(new Set([...target.statuses, ...statuses]));
  const nextStatusRounds = { ...target.statusRounds };
  for (const status of statuses) {
    const rule = SIMULATOR_STATUS_RULES[status];
    if (rule.persistentUntilRecovery) {
      nextStatusRounds[status] = Math.max(nextStatusRounds[status] ?? 0, 1);
      continue;
    }
    nextStatusRounds[status] = Math.max(
      nextStatusRounds[status] ?? 0,
      rule.durationRounds ?? 0,
    );
  }

  return {
    ...target,
    statuses: nextStatuses,
    statusRounds: nextStatusRounds,
  };
}

export function advanceSimulatorTargetRound(
  target: SimulatorTargetStats,
): SimulatorTargetStats {
  let ongoingDamage = 0;
  const nextStatusRounds: Partial<Record<SimulatorStatusKind, number>> = {};
  const nextStatuses: SimulatorStatusKind[] = [];

  for (const status of target.statuses) {
    const remaining = target.statusRounds[status] ?? 0;
    if (remaining <= 0) continue;
    const rule = SIMULATOR_STATUS_RULES[status];
    ongoingDamage += rule.ongoingDamage ?? 0;
    if (rule.persistentUntilRecovery) {
      nextStatuses.push(status);
      nextStatusRounds[status] = remaining;
      continue;
    }
    const nextRemaining = remaining - 1;
    if (nextRemaining > 0) {
      nextStatuses.push(status);
      nextStatusRounds[status] = nextRemaining;
    }
  }

  return {
    ...target,
    hp: Math.max(0, target.hp - ongoingDamage),
    statuses: nextStatuses,
    statusRounds: nextStatusRounds,
  };
}

export function getSimulatorKnockbackTarget(
  attacker: SimulatorBoardCoord,
  target: SimulatorBoardCoord,
  columns: readonly SimulatorBoardColumn[] = SIMULATOR_BOARD_COLUMNS,
  rows: readonly SimulatorBoardRow[] = SIMULATOR_BOARD_ROWS,
): SimulatorBoardCoord | null {
  const attackerColumn = columns.indexOf(attacker.col);
  const targetColumn = columns.indexOf(target.col);
  const attackerRow = rows.indexOf(attacker.row);
  const targetRow = rows.indexOf(target.row);

  if (attacker.row === target.row && attackerColumn !== targetColumn) {
    const nextColumn = targetColumn + Math.sign(targetColumn - attackerColumn);
    const col = columns[nextColumn];
    return col ? { col, row: target.row } : null;
  }
  if (attacker.col === target.col && attackerRow !== targetRow) {
    const nextRow = targetRow + Math.sign(targetRow - attackerRow);
    const row = rows[nextRow];
    return row ? { col: target.col, row } : null;
  }
  return null;
}

export function getSimulatorIncendiaryLineCells(
  attacker: SimulatorBoardCoord,
  target: SimulatorBoardCoord,
  columns: readonly SimulatorBoardColumn[] = SIMULATOR_BOARD_COLUMNS,
  rows: readonly SimulatorBoardRow[] = SIMULATOR_BOARD_ROWS,
): SimulatorBoardCoord[] {
  if (attacker.col === target.col && attacker.row === target.row) {
    return [target];
  }

  const attackerColumn = columns.indexOf(attacker.col);
  const targetColumn = columns.indexOf(target.col);
  const attackerRow = rows.indexOf(attacker.row);
  const targetRow = rows.indexOf(target.row);
  const cells: SimulatorBoardCoord[] = [];

  if (attacker.row === target.row && attackerColumn !== targetColumn) {
    const direction = Math.sign(targetColumn - attackerColumn);
    for (let distance = 1; distance <= 3; distance += 1) {
      const col = columns[attackerColumn + direction * distance];
      if (!col) break;
      cells.push({ col, row: attacker.row });
    }
    return cells;
  }
  if (attacker.col === target.col && attackerRow !== targetRow) {
    const direction = Math.sign(targetRow - attackerRow);
    for (let distance = 1; distance <= 3; distance += 1) {
      const row = rows[attackerRow + direction * distance];
      if (!row) break;
      cells.push({ col: attacker.col, row });
    }
    return cells;
  }
  return [target];
}

export function getSimulatorCadenceCycle(turn: number, cycleTurns = 1): number {
  const normalizedTurn = Math.max(1, Math.floor(turn));
  return Math.floor((normalizedTurn - 1) / cycleTurns);
}

export function isNewSimulatorCadenceCycle(
  previousTurn: number,
  nextTurn: number,
  cycleTurns = 1,
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
  range = getSimulatorRange(input.attacker, input.target),
): SimulatorAttackResult {
  return {
    ok: false,
    reason,
    reasonLabel,
    range,
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
  const rule = getSimulatorWeaponRule(input.weaponSlug);
  if (!rule) {
    return failureResult(input, "NO_RULE", "등록되지 않은 장비입니다.");
  }

  const range = getSimulatorWeaponRange(
    rule.slug,
    input.attacker,
    input.target,
  );
  if (!range && requiresCardinalAlignment(rule)) {
    return failureResult(
      input,
      "NOT_CARDINAL",
      "화기는 나와 적이 같은 가로줄 또는 세로줄에 있을 때만 공격할 수 있습니다.",
      rule,
    );
  }

  if (!range) {
    return failureResult(input, "OUT_OF_RANGE", "사거리를 계산할 수 없습니다.", rule);
  }
  if (
    rule.slug === "basic-heavy-machine-gun" &&
    (range.attackDistance ?? 0) > 4
  ) {
    return failureResult(
      input,
      "OUT_OF_RANGE",
      "중기관총 사거리는 가로·세로 이동 칸의 합 4칸 이내입니다.",
      rule,
      undefined,
      range,
    );
  }
  const profile = rule.ranges[range.band];
  if (!profile) {
    return failureResult(
      input,
      "OUT_OF_RANGE",
      `${SIMULATOR_RANGE_LABELS[range.band]} 피해값이 없습니다.`,
      rule,
      undefined,
      range,
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
      range,
    );
  }

  if (rule.requiresSetup && input.runtime?.installed !== true) {
    return failureResult(
      input,
      "SETUP_REQUIRED",
      "설치 선언 후 사용할 수 있습니다.",
      rule,
      profile,
      range,
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
      range,
    );
  }

  const atkBonus = rule.usesAtkBonus ? Math.max(0, input.attackerStats.atk) : 0;
  const rangedDamageMultiplier = rule.usesAtkBonus
    ? 1
    : getSimulatorRangedDamageMultiplier(input.attackerStatuses);
  const rawDamage = (profile.amount + atkBonus) * rangedDamageMultiplier;
  const penetratedDef = Math.max(
    0,
    input.targetStats.def - (profile.armorPenetration ?? 0),
  );
  const mitigation = profile.appliesDef
    ? Math.min(rawDamage, penetratedDef)
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
