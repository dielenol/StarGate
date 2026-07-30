import type { TowaskiLicenseSlug } from "./licenses";
import type { TowaskiLicenseTestMode, TowaskiPoint } from "./license-test-v2";

export const TOWASKI_LICENSE_PROGRAM_VERSION_V3 = 3;
export const TOWASKI_LICENSE_V3_CHALLENGE_TTL_MS = 10 * 60_000;
export const TOWASKI_LICENSE_V3_TIMING_TOLERANCE_MS = 500;
export const TOWASKI_LICENSE_V3_RANGE_ROUNDS = 12;
export const TOWASKI_LICENSE_V3_HOSTILE_TARGETS = 10;
export const TOWASKI_LICENSE_V3_CIVILIAN_TARGETS = 2;
export const TOWASKI_LICENSE_V3_PRECISION_WINDOW_MS = 1_125;
export const TOWASKI_LICENSE_V3_RANGE_WINDOW_MS = 3_000;
export const TOWASKI_LICENSE_V3_HEAVY_JITTER_INTERVAL_MS = 80;
export const TOWASKI_LICENSE_V3_HEAVY_JITTER_MAX_X = 0.08;
export const TOWASKI_LICENSE_V3_HEAVY_JITTER_MAX_Y = 0.1;
export const TOWASKI_LICENSE_V3_SONIC_PERFECT_MS = 90;
export const TOWASKI_LICENSE_V3_SONIC_GOOD_MS = 170;
export const TOWASKI_LICENSE_V3_EXPLOSIVE_WINDOW_MS = 30_000;
export const TOWASKI_LICENSE_V3_FLAME_WINDOW_MS = 18_000;

export type TowaskiV3TargetKind = "hostile" | "civilian";
export type TowaskiV3TargetLane = "near" | "mid" | "far";

export interface TowaskiV3RangeScenario extends TowaskiPoint {
  mode: "firearm" | "precision" | "heavy";
  id: string;
  kind: TowaskiV3TargetKind;
  lane: TowaskiV3TargetLane;
  windowMs: number;
  hitRadius: number;
  visibleScale: number;
  jitter?: {
    intervalMs: typeof TOWASKI_LICENSE_V3_HEAVY_JITTER_INTERVAL_MS;
    maxX: typeof TOWASKI_LICENSE_V3_HEAVY_JITTER_MAX_X;
    maxY: typeof TOWASKI_LICENSE_V3_HEAVY_JITTER_MAX_Y;
    seedX: number;
    seedY: number;
  };
}

export type TowaskiV3SonicBeatKind = "target" | "protected";

export interface TowaskiV3SonicScenario {
  mode: "sonic";
  id: string;
  bpm: 96 | 108 | 120 | 132;
  beatKinds: TowaskiV3SonicBeatKind[];
  beatStartMs: number;
}

export type TowaskiV3ExplosiveDisposition =
  | "release"
  | "service"
  | "quarantine";

export interface TowaskiV3ExplosiveInspection {
  safetyDevice: string;
  casing: string;
  seal: string;
  inspectionValue: string;
}

export interface TowaskiV3ExplosiveItem {
  id: string;
  serial: string;
  inspection: TowaskiV3ExplosiveInspection;
}

export interface TowaskiV3ExplosiveScenario {
  mode: "explosive";
  id: string;
  munition: "grenade" | "rocket";
  items: TowaskiV3ExplosiveItem[];
  durationMs: typeof TOWASKI_LICENSE_V3_EXPLOSIVE_WINDOW_MS;
}

export interface TowaskiV3GridPoint {
  x: number;
  y: number;
}

export type TowaskiV3FlameDirection = "up" | "right" | "down" | "left";

export interface TowaskiV3TimedGridPath {
  id: string;
  cells: [TowaskiV3GridPoint, TowaskiV3GridPoint, TowaskiV3GridPoint];
}

export interface TowaskiV3FlameScenario {
  mode: "flame";
  id: string;
  width: 7;
  height: 5;
  hostilePaths: [TowaskiV3TimedGridPath, TowaskiV3TimedGridPath];
  allyPath: TowaskiV3TimedGridPath;
  fuel: TowaskiV3GridPoint;
  retreatPath: TowaskiV3TimedGridPath;
  durationMs: typeof TOWASKI_LICENSE_V3_FLAME_WINDOW_MS;
}

export type TowaskiLicenseV3Scenario =
  | TowaskiV3RangeScenario
  | TowaskiV3SonicScenario
  | TowaskiV3ExplosiveScenario
  | TowaskiV3FlameScenario;

export type TowaskiLicenseV3PublicScenario =
  TowaskiLicenseV3Scenario;

export type TowaskiLicenseV3StepInput =
  | {
      mode: "firearm" | "precision" | "heavy";
      fired: boolean;
      shots: 0 | 1;
      aimX?: number;
      aimY?: number;
      elapsedMs: number;
    }
  | {
      mode: "sonic";
      tapsMs: number[];
      elapsedMs: number;
    }
  | {
      mode: "explosive";
      decisions: Array<{
        itemId: string;
        disposition: TowaskiV3ExplosiveDisposition;
      }>;
      elapsedMs: number;
    }
  | {
      mode: "flame";
      start: TowaskiV3GridPoint;
      direction: TowaskiV3FlameDirection;
      elapsedMs: number;
    };

interface TowaskiV3ProgressBase {
  mode: TowaskiLicenseTestMode;
  step: number;
}

export interface TowaskiV3RangeProgress extends TowaskiV3ProgressBase {
  mode: "firearm" | "precision" | "heavy";
  hostileHits: number;
  civilianHits: number;
  shots: number;
}

export interface TowaskiV3SonicProgress extends TowaskiV3ProgressBase {
  mode: "sonic";
  successfulStages: number;
  targetHits: number;
  perfectHits: number;
  goodHits: number;
  protectedHits: number;
}

export interface TowaskiV3ExplosiveProgress extends TowaskiV3ProgressBase {
  mode: "explosive";
  correctDecisions: number;
  unsafeReleases: number;
  quarantineBreaches: number;
}

export interface TowaskiV3FlameProgress extends TowaskiV3ProgressBase {
  mode: "flame";
  successfulRoutes: number;
  hostilesBlocked: number;
  allyHits: number;
  fuelHits: number;
  retreatHits: number;
  invalidRoutes: number;
}

export type TowaskiLicenseV3Progress =
  | TowaskiV3RangeProgress
  | TowaskiV3SonicProgress
  | TowaskiV3ExplosiveProgress
  | TowaskiV3FlameProgress;

type TowaskiLicenseV3EvaluationBase<
  TMode extends TowaskiLicenseTestMode,
  TMetrics,
> = {
  mode: TMode;
  valid: true;
  passed: boolean;
  reasons: string[];
  metrics: TMetrics;
};

export type TowaskiLicenseV3Evaluation =
  | TowaskiLicenseV3EvaluationBase<
      "firearm" | "precision" | "heavy",
      {
        hostileHits: number;
        civilianHits: number;
        shots: number;
        accuracy: number;
      }
    >
  | TowaskiLicenseV3EvaluationBase<
      "sonic",
      {
        successfulStages: number;
        targetHits: number;
        perfectHits: number;
        goodHits: number;
        protectedHits: number;
      }
    >
  | TowaskiLicenseV3EvaluationBase<
      "explosive",
      {
        correctDecisions: number;
        unsafeReleases: number;
        quarantineBreaches: number;
      }
    >
  | TowaskiLicenseV3EvaluationBase<
      "flame",
      {
        successfulRoutes: number;
        hostilesBlocked: number;
        allyHits: number;
        fuelHits: number;
        retreatHits: number;
        invalidRoutes: number;
      }
    >;

export interface TowaskiLicenseV3StepResult {
  progress: TowaskiLicenseV3Progress;
  safetyViolation: boolean;
  stepSucceeded: boolean;
}

export interface TowaskiLicenseV3ChallengeState {
  mode: TowaskiLicenseTestMode;
  programVersion: typeof TOWASKI_LICENSE_PROGRAM_VERSION_V3;
  scenarios: TowaskiLicenseV3Scenario[];
  progress: TowaskiLicenseV3Progress;
}

type RandomIndex = (maxExclusive: number) => number;

const RANGE_LAYOUTS = [
  { x: 0.12, y: 0.48, lane: "near" },
  { x: 0.72, y: 0.3, lane: "far" },
  { x: 0.42, y: 0.42, lane: "mid" },
  { x: 0.84, y: 0.52, lane: "near" },
  { x: 0.27, y: 0.25, lane: "far" },
  { x: 0.55, y: 0.47, lane: "mid" },
  { x: 0.18, y: 0.35, lane: "mid" },
  { x: 0.67, y: 0.22, lane: "far" },
  { x: 0.36, y: 0.54, lane: "near" },
  { x: 0.8, y: 0.39, lane: "mid" },
  { x: 0.48, y: 0.28, lane: "far" },
  { x: 0.08, y: 0.54, lane: "near" },
] as const satisfies ReadonlyArray<
  TowaskiPoint & { lane: TowaskiV3TargetLane }
>;

const SONIC_BPMS = [96, 108, 120, 132] as const;

const EXPLOSIVE_SCENARIOS: TowaskiV3ExplosiveScenario[] = [
  {
    mode: "explosive",
    id: "grenade-manifest",
    munition: "grenade",
    durationMs: TOWASKI_LICENSE_V3_EXPLOSIVE_WINDOW_MS,
    items: [
      {
        id: "g-01",
        serial: "GR-4401",
        inspection: {
          safetyDevice: "LOCKED",
          casing: "NOMINAL",
          seal: "INTACT",
          inspectionValue: "A-00",
        },
      },
      {
        id: "g-02",
        serial: "GR-4402",
        inspection: {
          safetyDevice: "LOCKED",
          casing: "NOMINAL",
          seal: "INTACT",
          inspectionValue: "A-02",
        },
      },
      {
        id: "g-03",
        serial: "GR-4403",
        inspection: {
          safetyDevice: "LOCKED",
          casing: "NOMINAL",
          seal: "INTACT",
          inspectionValue: "A-04",
        },
      },
      {
        id: "g-04",
        serial: "GR-4404",
        inspection: {
          safetyDevice: "PLAY +2",
          casing: "NOMINAL",
          seal: "INTACT",
          inspectionValue: "C-17",
        },
      },
      {
        id: "g-05",
        serial: "GR-4405",
        inspection: {
          safetyDevice: "LOCKED",
          casing: "CORROSION RED",
          seal: "BROKEN",
          inspectionValue: "X-91",
        },
      },
    ],
  },
  {
    mode: "explosive",
    id: "rocket-manifest",
    munition: "rocket",
    durationMs: TOWASKI_LICENSE_V3_EXPLOSIVE_WINDOW_MS,
    items: [
      {
        id: "r-01",
        serial: "RK-7711",
        inspection: {
          safetyDevice: "LOCKED",
          casing: "NOMINAL",
          seal: "INTACT",
          inspectionValue: "A-11",
        },
      },
      {
        id: "r-02",
        serial: "RK-7712",
        inspection: {
          safetyDevice: "LOCKED",
          casing: "NOMINAL",
          seal: "INTACT",
          inspectionValue: "A-13",
        },
      },
      {
        id: "r-03",
        serial: "RK-7713",
        inspection: {
          safetyDevice: "LOCKED",
          casing: "NOMINAL",
          seal: "INTACT",
          inspectionValue: "A-15",
        },
      },
      {
        id: "r-04",
        serial: "RK-7714",
        inspection: {
          safetyDevice: "CONTACT OUT",
          casing: "NOMINAL",
          seal: "INTACT",
          inspectionValue: "C-24",
        },
      },
      {
        id: "r-05",
        serial: "RK-7715",
        inspection: {
          safetyDevice: "LOCKED",
          casing: "SWELL RED",
          seal: "BROKEN",
          inspectionValue: "X-72",
        },
      },
    ],
  },
];

const FLAME_SCENARIOS: TowaskiV3FlameScenario[] = [
  {
    mode: "flame",
    id: "flame-route-01",
    width: 7,
    height: 5,
    hostilePaths: [
      {
        id: "H1",
        cells: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }],
      },
      {
        id: "H2",
        cells: [{ x: 3, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }],
      },
    ],
    allyPath: {
      id: "ALLY",
      cells: [{ x: 6, y: 0 }, { x: 5, y: 1 }, { x: 5, y: 2 }],
    },
    fuel: { x: 3, y: 4 },
    retreatPath: {
      id: "EXIT",
      cells: [{ x: 0, y: 4 }, { x: 1, y: 4 }, { x: 2, y: 4 }],
    },
    durationMs: TOWASKI_LICENSE_V3_FLAME_WINDOW_MS,
  },
  {
    mode: "flame",
    id: "flame-route-02",
    width: 7,
    height: 5,
    hostilePaths: [
      {
        id: "H1",
        cells: [{ x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }],
      },
      {
        id: "H2",
        cells: [{ x: 6, y: 2 }, { x: 5, y: 2 }, { x: 4, y: 2 }],
      },
    ],
    allyPath: {
      id: "ALLY",
      cells: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }],
    },
    fuel: { x: 2, y: 3 },
    retreatPath: {
      id: "EXIT",
      cells: [{ x: 6, y: 4 }, { x: 5, y: 4 }, { x: 4, y: 4 }],
    },
    durationMs: TOWASKI_LICENSE_V3_FLAME_WINDOW_MS,
  },
  {
    mode: "flame",
    id: "flame-route-03",
    width: 7,
    height: 5,
    hostilePaths: [
      {
        id: "H1",
        cells: [{ x: 2, y: 0 }, { x: 2, y: 2 }, { x: 2, y: 3 }],
      },
      {
        id: "H2",
        cells: [{ x: 6, y: 1 }, { x: 5, y: 2 }, { x: 4, y: 3 }],
      },
    ],
    allyPath: {
      id: "ALLY",
      cells: [{ x: 0, y: 3 }, { x: 1, y: 2 }, { x: 1, y: 1 }],
    },
    fuel: { x: 5, y: 1 },
    retreatPath: {
      id: "EXIT",
      cells: [{ x: 6, y: 4 }, { x: 5, y: 4 }, { x: 4, y: 4 }],
    },
    durationMs: TOWASKI_LICENSE_V3_FLAME_WINDOW_MS,
  },
];

function defaultRandomIndex(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

function shuffled<T>(values: readonly T[], randomIndex: RandomIndex): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function rangeScenarios(
  mode: "firearm" | "precision" | "heavy",
  randomIndex: RandomIndex,
): TowaskiV3RangeScenario[] {
  const kinds = shuffled(
    [
      ...Array.from(
        { length: TOWASKI_LICENSE_V3_HOSTILE_TARGETS },
        () => "hostile" as const,
      ),
      ...Array.from(
        { length: TOWASKI_LICENSE_V3_CIVILIAN_TARGETS },
        () => "civilian" as const,
      ),
    ],
    randomIndex,
  );
  const precision = mode === "precision";
  const heavy = mode === "heavy";
  return RANGE_LAYOUTS.map((layout, index) => ({
    mode,
    id: `${mode}-${index + 1}`,
    kind: kinds[index] ?? "hostile",
    ...layout,
    windowMs: precision
      ? TOWASKI_LICENSE_V3_PRECISION_WINDOW_MS
      : TOWASKI_LICENSE_V3_RANGE_WINDOW_MS,
    hitRadius: precision ? 0.0225 : 0.09,
    visibleScale: precision ? 0.25 : 1,
    ...(heavy
      ? {
          jitter: {
            intervalMs: TOWASKI_LICENSE_V3_HEAVY_JITTER_INTERVAL_MS,
            maxX: TOWASKI_LICENSE_V3_HEAVY_JITTER_MAX_X,
            maxY: TOWASKI_LICENSE_V3_HEAVY_JITTER_MAX_Y,
            seedX: randomIndex(1_000_000),
            seedY: randomIndex(1_000_000),
          },
        }
      : {}),
  }));
}

function sonicScenarios(randomIndex: RandomIndex): TowaskiV3SonicScenario[] {
  return SONIC_BPMS.map((bpm, index) => ({
    mode: "sonic",
    id: `sonic-stage-${index + 1}`,
    bpm,
    beatStartMs: 700,
    beatKinds: shuffled(
      [
        ...Array.from({ length: 6 }, () => "target" as const),
        ...Array.from({ length: 2 }, () => "protected" as const),
      ],
      randomIndex,
    ),
  }));
}

export function createTowaskiLicenseV3State(
  mode: TowaskiLicenseTestMode,
  randomIndex: RandomIndex = defaultRandomIndex,
): TowaskiLicenseV3ChallengeState {
  switch (mode) {
    case "firearm":
    case "precision":
    case "heavy":
      return {
        mode,
        programVersion: TOWASKI_LICENSE_PROGRAM_VERSION_V3,
        scenarios: rangeScenarios(mode, randomIndex),
        progress: {
          mode,
          step: 0,
          hostileHits: 0,
          civilianHits: 0,
          shots: 0,
        },
      };
    case "sonic":
      return {
        mode,
        programVersion: TOWASKI_LICENSE_PROGRAM_VERSION_V3,
        scenarios: sonicScenarios(randomIndex),
        progress: {
          mode,
          step: 0,
          successfulStages: 0,
          targetHits: 0,
          perfectHits: 0,
          goodHits: 0,
          protectedHits: 0,
        },
      };
    case "explosive":
      return {
        mode,
        programVersion: TOWASKI_LICENSE_PROGRAM_VERSION_V3,
        scenarios: EXPLOSIVE_SCENARIOS.map((scenario) => ({
          ...scenario,
          items: shuffled(scenario.items, randomIndex),
        })),
        progress: {
          mode,
          step: 0,
          correctDecisions: 0,
          unsafeReleases: 0,
          quarantineBreaches: 0,
        },
      };
    case "flame":
      return {
        mode,
        programVersion: TOWASKI_LICENSE_PROGRAM_VERSION_V3,
        scenarios: FLAME_SCENARIOS,
        progress: {
          mode,
          step: 0,
          successfulRoutes: 0,
          hostilesBlocked: 0,
          allyHits: 0,
          fuelHits: 0,
          retreatHits: 0,
          invalidRoutes: 0,
        },
      };
  }
}

export function getTowaskiLicenseV3ModeForSlug(
  licenseSlug: TowaskiLicenseSlug,
): TowaskiLicenseTestMode {
  switch (licenseSlug) {
    case "towaski-license-basic-firearm":
      return "firearm";
    case "towaski-license-precision-firearm":
      return "precision";
    case "towaski-license-heavy-weapon":
      return "heavy";
    case "towaski-license-flame-weapon":
      return "flame";
    case "towaski-license-sonic-equipment":
      return "sonic";
    case "towaski-license-explosive-ordnance":
      return "explosive";
  }
}

export function getTowaskiLicenseV3StepWindowMs(
  scenario: TowaskiLicenseV3Scenario,
): number {
  switch (scenario.mode) {
    case "firearm":
    case "precision":
    case "heavy":
      return scenario.windowMs;
    case "sonic": {
      const intervalMs = 60_000 / scenario.bpm;
      return Math.ceil(
        scenario.beatStartMs +
          intervalMs * (scenario.beatKinds.length - 1) +
          1_000,
      );
    }
    case "explosive":
    case "flame":
      return scenario.durationMs;
  }
}

export function toTowaskiLicenseV3PublicScenario(
  scenario: TowaskiLicenseV3Scenario,
): TowaskiLicenseV3PublicScenario {
  if (scenario.mode !== "explosive") return scenario;
  return {
    ...scenario,
    items: scenario.items.map((item) => ({
      ...item,
      inspection: { ...item.inspection },
    })),
  };
}

export function getTowaskiExplosiveRequiredDisposition(
  item: TowaskiV3ExplosiveItem,
): TowaskiV3ExplosiveDisposition {
  if (
    item.inspection.seal === "BROKEN" ||
    item.inspection.casing.endsWith("RED")
  ) {
    return "quarantine";
  }
  if (
    item.inspection.safetyDevice !== "LOCKED" ||
    item.inspection.inspectionValue.startsWith("C-")
  ) {
    return "service";
  }
  return "release";
}

function hashUnit(seed: number, tick: number): number {
  let value = (seed ^ Math.imul(tick + 1, 0x45d9f3b)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b) >>> 0;
  return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
}

export function computeTowaskiHeavyImpact(
  scenario: TowaskiV3RangeScenario,
  base: TowaskiPoint,
  elapsedMs: number,
): TowaskiPoint {
  if (scenario.mode !== "heavy" || !scenario.jitter) return base;
  const position = Math.max(0, elapsedMs) / scenario.jitter.intervalMs;
  const tick = Math.floor(position);
  const interpolation = position - tick;
  const startX = hashUnit(scenario.jitter.seedX, tick) * 2 - 1;
  const endX = hashUnit(scenario.jitter.seedX, tick + 1) * 2 - 1;
  const startY = hashUnit(scenario.jitter.seedY, tick) * 2 - 1;
  const endY = hashUnit(scenario.jitter.seedY, tick + 1) * 2 - 1;
  return {
    x:
      base.x +
      (startX + (endX - startX) * interpolation) *
        scenario.jitter.maxX,
    y:
      base.y +
      (startY + (endY - startY) * interpolation) *
        scenario.jitter.maxY,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteRange(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}

function isIntegerRange(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && isFiniteRange(value, min, max);
}

function parseGridPoint(value: unknown): TowaskiV3GridPoint | null {
  if (
    !isRecord(value) ||
    !isIntegerRange(value.x, 0, 6) ||
    !isIntegerRange(value.y, 0, 4)
  ) {
    return null;
  }
  return { x: value.x, y: value.y };
}

export function parseTowaskiLicenseV3StepInput(
  value: unknown,
): TowaskiLicenseV3StepInput | null {
  if (!isRecord(value) || typeof value.mode !== "string") return null;
  if (["firearm", "precision", "heavy"].includes(value.mode)) {
    if (
      typeof value.fired !== "boolean" ||
      !isIntegerRange(value.shots, 0, 1) ||
      !isIntegerRange(value.elapsedMs, 0, 30_000) ||
      (value.fired &&
        (value.shots !== 1 ||
          !isFiniteRange(value.aimX, 0, 1) ||
          !isFiniteRange(value.aimY, 0, 1))) ||
      (!value.fired && value.shots !== 0)
    ) {
      return null;
    }
    return {
      mode: value.mode as "firearm" | "precision" | "heavy",
      fired: value.fired,
      shots: value.shots as 0 | 1,
      elapsedMs: value.elapsedMs,
      ...(value.fired
        ? { aimX: value.aimX as number, aimY: value.aimY as number }
        : {}),
    };
  }
  if (value.mode === "sonic") {
    if (
      !Array.isArray(value.tapsMs) ||
      value.tapsMs.length > 8 ||
      !isIntegerRange(value.elapsedMs, 0, 30_000)
    ) {
      return null;
    }
    const tapsMs: number[] = [];
    let previous = -1;
    for (const tap of value.tapsMs) {
      if (!isIntegerRange(tap, 0, 30_000) || tap <= previous) return null;
      tapsMs.push(tap);
      previous = tap;
    }
    return { mode: "sonic", tapsMs, elapsedMs: value.elapsedMs };
  }
  if (value.mode === "explosive") {
    if (
      !Array.isArray(value.decisions) ||
      value.decisions.length !== 5 ||
      !isIntegerRange(value.elapsedMs, 0, TOWASKI_LICENSE_V3_EXPLOSIVE_WINDOW_MS)
    ) {
      return null;
    }
    const decisions: Extract<
      TowaskiLicenseV3StepInput,
      { mode: "explosive" }
    >["decisions"] = [];
    const seen = new Set<string>();
    for (const decision of value.decisions) {
      if (
        !isRecord(decision) ||
        typeof decision.itemId !== "string" ||
        seen.has(decision.itemId) ||
        !["release", "service", "quarantine"].includes(
          String(decision.disposition),
        )
      ) {
        return null;
      }
      seen.add(decision.itemId);
      decisions.push({
        itemId: decision.itemId,
        disposition: decision.disposition as TowaskiV3ExplosiveDisposition,
      });
    }
    return {
      mode: "explosive",
      decisions,
      elapsedMs: value.elapsedMs,
    };
  }
  if (value.mode === "flame") {
    const start = parseGridPoint(value.start);
    if (
      !start ||
      !["up", "right", "down", "left"].includes(String(value.direction)) ||
      !isIntegerRange(value.elapsedMs, 0, TOWASKI_LICENSE_V3_FLAME_WINDOW_MS)
    ) {
      return null;
    }
    return {
      mode: "flame",
      start,
      direction: value.direction as TowaskiV3FlameDirection,
      elapsedMs: value.elapsedMs,
    };
  }
  return null;
}

export function validateTowaskiLicenseV3StepTiming(args: {
  scenario: TowaskiLicenseV3Scenario;
  input: TowaskiLicenseV3StepInput;
  elapsedMs: number;
}): boolean {
  const { scenario, input, elapsedMs } = args;
  if (
    scenario.mode !== input.mode ||
    !Number.isFinite(elapsedMs) ||
    elapsedMs < 0 ||
    elapsedMs >
      getTowaskiLicenseV3StepWindowMs(scenario) +
        TOWASKI_LICENSE_V3_TIMING_TOLERANCE_MS ||
    input.elapsedMs > getTowaskiLicenseV3StepWindowMs(scenario) ||
    Math.abs(input.elapsedMs - elapsedMs) >
      TOWASKI_LICENSE_V3_TIMING_TOLERANCE_MS
  ) {
    return false;
  }

  if (
    input.mode === "firearm" ||
    input.mode === "precision" ||
    input.mode === "heavy"
  ) {
    if (scenario.mode !== input.mode) return false;
    if (input.fired) {
      return input.elapsedMs >= 120 && elapsedMs >= 120;
    }
    return input.elapsedMs >= 120 && elapsedMs >= 120;
  }
  if (input.mode === "sonic") {
    if (scenario.mode !== "sonic") return false;
    const intervalMs = 60_000 / scenario.bpm;
    const finalBeatMs =
      scenario.beatStartMs +
      intervalMs * (scenario.beatKinds.length - 1);
    return input.elapsedMs >= finalBeatMs + TOWASKI_LICENSE_V3_SONIC_GOOD_MS;
  }
  return input.elapsedMs >= 300;
}

function distance(first: TowaskiPoint, second: TowaskiPoint): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function resolveRange(
  scenario: TowaskiV3RangeScenario,
  input: Extract<
    TowaskiLicenseV3StepInput,
    { mode: "firearm" | "precision" | "heavy" }
  >,
  progress: TowaskiV3RangeProgress,
): TowaskiLicenseV3StepResult {
  const impact =
    input.fired && input.aimX !== undefined && input.aimY !== undefined
      ? computeTowaskiHeavyImpact(
          scenario,
          { x: input.aimX, y: input.aimY },
          input.elapsedMs,
        )
      : null;
  const hit = Boolean(
    impact && distance(impact, scenario) <= scenario.hitRadius,
  );
  const hostileHit = hit && scenario.kind === "hostile";
  const civilianHit = hit && scenario.kind === "civilian";
  return {
    progress: {
      ...progress,
      step: progress.step + 1,
      hostileHits: progress.hostileHits + (hostileHit ? 1 : 0),
      civilianHits: progress.civilianHits + (civilianHit ? 1 : 0),
      shots: progress.shots + input.shots,
    },
    safetyViolation: civilianHit,
    stepSucceeded:
      (scenario.kind === "hostile" && hostileHit) ||
      (scenario.kind === "civilian" && !input.fired),
  };
}

function resolveSonic(
  scenario: TowaskiV3SonicScenario,
  input: Extract<TowaskiLicenseV3StepInput, { mode: "sonic" }>,
  progress: TowaskiV3SonicProgress,
): TowaskiLicenseV3StepResult {
  const intervalMs = 60_000 / scenario.bpm;
  const unmatchedTaps = new Set(input.tapsMs.map((_, index) => index));
  let targetHits = 0;
  let perfectHits = 0;
  let goodHits = 0;
  let protectedHits = 0;

  scenario.beatKinds.forEach((kind, beatIndex) => {
    const beatMs = scenario.beatStartMs + beatIndex * intervalMs;
    let nearestIndex = -1;
    let nearestDelta = Number.POSITIVE_INFINITY;
    for (const tapIndex of unmatchedTaps) {
      const delta = Math.abs(input.tapsMs[tapIndex]! - beatMs);
      if (delta < nearestDelta) {
        nearestDelta = delta;
        nearestIndex = tapIndex;
      }
    }
    if (
      nearestIndex < 0 ||
      nearestDelta > TOWASKI_LICENSE_V3_SONIC_GOOD_MS
    ) {
      return;
    }
    unmatchedTaps.delete(nearestIndex);
    if (kind === "protected") {
      protectedHits += 1;
      return;
    }
    targetHits += 1;
    if (nearestDelta <= TOWASKI_LICENSE_V3_SONIC_PERFECT_MS) {
      perfectHits += 1;
    } else {
      goodHits += 1;
    }
  });

  const successful = targetHits >= 5 && protectedHits === 0;
  return {
    progress: {
      ...progress,
      step: progress.step + 1,
      successfulStages:
        progress.successfulStages + (successful ? 1 : 0),
      targetHits: progress.targetHits + targetHits,
      perfectHits: progress.perfectHits + perfectHits,
      goodHits: progress.goodHits + goodHits,
      protectedHits: progress.protectedHits + protectedHits,
    },
    safetyViolation: protectedHits > 0,
    stepSucceeded: successful,
  };
}

function resolveExplosive(
  scenario: TowaskiV3ExplosiveScenario,
  input: Extract<TowaskiLicenseV3StepInput, { mode: "explosive" }>,
  progress: TowaskiV3ExplosiveProgress,
): TowaskiLicenseV3StepResult {
  const decisions = new Map(
    input.decisions.map((decision) => [
      decision.itemId,
      decision.disposition,
    ]),
  );
  let correct = 0;
  let unsafeReleases = 0;
  let quarantineBreaches = 0;
  for (const item of scenario.items) {
    const disposition = decisions.get(item.id);
    const requiredDisposition =
      getTowaskiExplosiveRequiredDisposition(item);
    if (disposition === requiredDisposition) correct += 1;
    if (
      disposition === "release" &&
      requiredDisposition !== "release"
    ) {
      unsafeReleases += 1;
    }
    if (
      requiredDisposition === "quarantine" &&
      disposition !== "quarantine"
    ) {
      quarantineBreaches += 1;
    }
  }
  return {
    progress: {
      ...progress,
      step: progress.step + 1,
      correctDecisions: progress.correctDecisions + correct,
      unsafeReleases: progress.unsafeReleases + unsafeReleases,
      quarantineBreaches:
        progress.quarantineBreaches + quarantineBreaches,
    },
    safetyViolation: unsafeReleases > 0 || quarantineBreaches > 0,
    stepSucceeded:
      correct === scenario.items.length &&
      unsafeReleases === 0 &&
      quarantineBreaches === 0,
  };
}

function sameGridPoint(
  first: TowaskiV3GridPoint,
  second: TowaskiV3GridPoint,
): boolean {
  return first.x === second.x && first.y === second.y;
}

export function getTowaskiFlameRouteCells(
  start: TowaskiV3GridPoint,
  direction: TowaskiV3FlameDirection,
  width = 7,
  height = 5,
): TowaskiV3GridPoint[] | null {
  const delta: Record<TowaskiV3FlameDirection, TowaskiV3GridPoint> = {
    up: { x: 0, y: -1 },
    right: { x: 1, y: 0 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
  };
  const step = delta[direction];
  const cells = Array.from({ length: 3 }, (_, index) => ({
    x: start.x + step.x * index,
    y: start.y + step.y * index,
  }));
  return cells.every(
    (cell) =>
      cell.x >= 0 &&
      cell.x < width &&
      cell.y >= 0 &&
      cell.y < height,
  )
    ? cells
    : null;
}

export interface TowaskiV3FlamePlacement {
  cells: TowaskiV3GridPoint[] | null;
  hostilesBlocked: number;
  allyHit: boolean;
  fuelHit: boolean;
  retreatHit: boolean;
}

export function evaluateTowaskiFlamePlacement(
  scenario: TowaskiV3FlameScenario,
  start: TowaskiV3GridPoint,
  direction: TowaskiV3FlameDirection,
): TowaskiV3FlamePlacement {
  const cells = getTowaskiFlameRouteCells(
    start,
    direction,
    scenario.width,
    scenario.height,
  );
  const intersects = (pathCells: TowaskiV3GridPoint[]) =>
    Boolean(
      cells?.some((cell) =>
        pathCells.some((pathCell) => sameGridPoint(cell, pathCell)),
      ),
    );
  return {
    cells,
    hostilesBlocked: cells
      ? scenario.hostilePaths.filter((path) => intersects(path.cells)).length
      : 0,
    allyHit: intersects(scenario.allyPath.cells),
    fuelHit: Boolean(
      cells?.some((cell) => sameGridPoint(cell, scenario.fuel)),
    ),
    retreatHit: intersects(scenario.retreatPath.cells),
  };
}

function resolveFlame(
  scenario: TowaskiV3FlameScenario,
  input: Extract<TowaskiLicenseV3StepInput, { mode: "flame" }>,
  progress: TowaskiV3FlameProgress,
): TowaskiLicenseV3StepResult {
  const {
    cells,
    hostilesBlocked,
    allyHit,
    fuelHit,
    retreatHit,
  } = evaluateTowaskiFlamePlacement(
    scenario,
    input.start,
    input.direction,
  );
  const successful =
    Boolean(cells) &&
    hostilesBlocked === 2 &&
    !allyHit &&
    !fuelHit &&
    !retreatHit;
  return {
    progress: {
      ...progress,
      step: progress.step + 1,
      successfulRoutes:
        progress.successfulRoutes + (successful ? 1 : 0),
      hostilesBlocked: progress.hostilesBlocked + hostilesBlocked,
      allyHits: progress.allyHits + (allyHit ? 1 : 0),
      fuelHits: progress.fuelHits + (fuelHit ? 1 : 0),
      retreatHits: progress.retreatHits + (retreatHit ? 1 : 0),
      invalidRoutes: progress.invalidRoutes + (cells ? 0 : 1),
    },
    safetyViolation: allyHit || fuelHit || retreatHit,
    stepSucceeded: successful,
  };
}

export function resolveTowaskiLicenseV3Step(args: {
  scenario: TowaskiLicenseV3Scenario;
  input: TowaskiLicenseV3StepInput;
  progress: TowaskiLicenseV3Progress;
}): TowaskiLicenseV3StepResult {
  const { scenario, input, progress } = args;
  if (scenario.mode !== input.mode || progress.mode !== scenario.mode) {
    throw new Error("TOWASKI_LICENSE_MODE_MISMATCH");
  }
  if (
    scenario.mode === "firearm" ||
    scenario.mode === "precision" ||
    scenario.mode === "heavy"
  ) {
    return resolveRange(
      scenario,
      input as Extract<
        TowaskiLicenseV3StepInput,
        { mode: "firearm" | "precision" | "heavy" }
      >,
      progress as TowaskiV3RangeProgress,
    );
  }
  switch (scenario.mode) {
    case "sonic":
      return resolveSonic(
        scenario,
        input as Extract<TowaskiLicenseV3StepInput, { mode: "sonic" }>,
        progress as TowaskiV3SonicProgress,
      );
    case "explosive":
      return resolveExplosive(
        scenario,
        input as Extract<TowaskiLicenseV3StepInput, { mode: "explosive" }>,
        progress as TowaskiV3ExplosiveProgress,
      );
    case "flame":
      return resolveFlame(
        scenario,
        input as Extract<TowaskiLicenseV3StepInput, { mode: "flame" }>,
        progress as TowaskiV3FlameProgress,
      );
  }
}

export function evaluateTowaskiLicenseV3Progress(
  progress: TowaskiLicenseV3Progress,
): TowaskiLicenseV3Evaluation {
  const reasons: string[] = [];
  if (
    progress.mode === "firearm" ||
    progress.mode === "precision" ||
    progress.mode === "heavy"
  ) {
    const requiredHits = progress.mode === "precision" ? 8 : 7;
    const minAccuracy = progress.mode === "precision" ? 0.6 : 0.65;
    const accuracy =
      progress.shots === 0 ? 0 : progress.hostileHits / progress.shots;
    if (progress.hostileHits < requiredHits) {
      reasons.push(
        progress.mode === "precision" ? "precision_hits" : "hostile_hits",
      );
    }
    if (progress.civilianHits > 0) reasons.push("civilian_hit");
    if (accuracy < minAccuracy) reasons.push("accuracy");
    return {
      mode: progress.mode,
      valid: true,
      passed: reasons.length === 0,
      reasons,
      metrics: {
        hostileHits: progress.hostileHits,
        civilianHits: progress.civilianHits,
        shots: progress.shots,
        accuracy,
      },
    };
  }
  switch (progress.mode) {
    case "sonic":
      if (progress.successfulStages < 3) reasons.push("rhythm_stages");
      if (progress.protectedHits > 0) reasons.push("protected_hit");
      return {
        mode: "sonic",
        valid: true,
        passed: reasons.length === 0,
        reasons,
        metrics: {
          successfulStages: progress.successfulStages,
          targetHits: progress.targetHits,
          perfectHits: progress.perfectHits,
          goodHits: progress.goodHits,
          protectedHits: progress.protectedHits,
        },
      };
    case "explosive":
      if (progress.correctDecisions < 9) reasons.push("manifest_accuracy");
      if (progress.unsafeReleases > 0) reasons.push("unsafe_release");
      if (progress.quarantineBreaches > 0) {
        reasons.push("quarantine_breach");
      }
      return {
        mode: "explosive",
        valid: true,
        passed: reasons.length === 0,
        reasons,
        metrics: {
          correctDecisions: progress.correctDecisions,
          unsafeReleases: progress.unsafeReleases,
          quarantineBreaches: progress.quarantineBreaches,
        },
      };
    case "flame":
      if (progress.successfulRoutes < 2) reasons.push("route_clearance");
      if (progress.allyHits > 0) reasons.push("ally_hit");
      if (progress.fuelHits > 0) reasons.push("fuel_hit");
      if (progress.retreatHits > 0) reasons.push("retreat_blocked");
      return {
        mode: "flame",
        valid: true,
        passed: reasons.length === 0,
        reasons,
        metrics: {
          successfulRoutes: progress.successfulRoutes,
          hostilesBlocked: progress.hostilesBlocked,
          allyHits: progress.allyHits,
          fuelHits: progress.fuelHits,
          retreatHits: progress.retreatHits,
          invalidRoutes: progress.invalidRoutes,
        },
      };
  }
}

export function isTowaskiLicenseV3Complete(
  state: TowaskiLicenseV3ChallengeState,
): boolean {
  return state.progress.step >= state.scenarios.length;
}
