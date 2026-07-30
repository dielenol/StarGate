import type { TowaskiLicenseSlug } from "./licenses";

export const TOWASKI_LICENSE_PROGRAM_VERSION = 2;
export const TOWASKI_LICENSE_CHALLENGE_TTL_MS = 5 * 60_000;
export const TOWASKI_LICENSE_MAX_STEP_SAMPLES = 160;
export const TOWASKI_LICENSE_MIN_SAMPLE_INTERVAL_MS = 50;
export const TOWASKI_LICENSE_TIMING_TOLERANCE_MS = 500;
export const TOWASKI_PRECISION_BULLSEYE_RADIUS = 0.03;
export const TOWASKI_PRECISION_SCORING_RADIUS = 0.065;

export type TowaskiLicenseTestMode =
  | "firearm"
  | "precision"
  | "heavy"
  | "flame"
  | "sonic"
  | "explosive";

export interface TowaskiPoint {
  x: number;
  y: number;
}

export interface TowaskiZone extends TowaskiPoint {
  id: string;
  radius: number;
}

export interface TowaskiFirearmScenario extends TowaskiPoint {
  mode: "firearm";
  id: string;
  kind: "hostile" | "civilian";
  lane: "near" | "mid" | "far";
}

export interface TowaskiPrecisionScenario {
  mode: "precision";
  id: string;
  target: TowaskiPoint;
  wind: TowaskiPoint;
  protectedZone: TowaskiZone;
  distanceMeters: number;
}

export interface TowaskiHeavyScenario {
  mode: "heavy";
  id: string;
  target: TowaskiZone;
  recoil: TowaskiPoint;
  civilianZone: TowaskiZone;
  civilianWindow: {
    startMs: number;
    endMs: number;
  };
  durationMs: number;
  requiredHitSamples: number;
}

export interface TowaskiFlameScenario {
  mode: "flame";
  id: string;
  hostileZones: TowaskiZone[];
  civilianZone: TowaskiZone;
  fuelTankZone: TowaskiZone;
  durationMs: number;
}

export interface TowaskiSonicScenario {
  mode: "sonic";
  id: string;
  targetFrequencyHz: number;
  outputBand: {
    min: number;
    max: number;
  };
  widthBand: {
    min: number;
    max: number;
  };
  protectionThreshold: number;
}

export type TowaskiExplosiveMunition = "grenade" | "rocket";
export type TowaskiExplosiveLaunchLane = "left" | "center" | "right";

export interface TowaskiExplosiveScenario {
  mode: "explosive";
  id: string;
  requiredMunition: TowaskiExplosiveMunition;
  targetFuseMs: 1_000 | 2_000 | 3_000;
  blastRadius: number;
  hostileZones: TowaskiZone[];
  civilianZones: TowaskiZone[];
  safeLaunchLane: TowaskiExplosiveLaunchLane;
}

export type TowaskiLicenseV2Scenario =
  | TowaskiFirearmScenario
  | TowaskiPrecisionScenario
  | TowaskiHeavyScenario
  | TowaskiFlameScenario
  | TowaskiSonicScenario
  | TowaskiExplosiveScenario;

export interface TowaskiTimedPointerSample extends TowaskiPoint {
  t: number;
  active: boolean;
}

export type TowaskiLicenseV2StepInput =
  | {
      mode: "firearm";
      targetId?: string;
      fired: boolean;
      shots: number;
    }
  | {
      mode: "precision";
      aimX: number;
      aimY: number;
      holdMs: number;
    }
  | {
      mode: "heavy";
      samples: TowaskiTimedPointerSample[];
    }
  | {
      mode: "flame";
      samples: TowaskiTimedPointerSample[];
    }
  | {
      mode: "sonic";
      frequencyHz: number;
      output: number;
      width: number;
      pulseMs: number;
    }
  | {
      mode: "explosive";
      munition: TowaskiExplosiveMunition;
      impactX: number;
      impactY: number;
      fuseMs: 1_000 | 2_000 | 3_000;
      launchLane: TowaskiExplosiveLaunchLane;
    };

interface TowaskiLicenseProgressBase {
  mode: TowaskiLicenseTestMode;
  step: number;
}

export interface TowaskiFirearmProgress extends TowaskiLicenseProgressBase {
  mode: "firearm";
  hostileHits: number;
  civilianHits: number;
  shots: number;
}

export interface TowaskiPrecisionProgress extends TowaskiLicenseProgressBase {
  mode: "precision";
  score: number;
  protectedHits: number;
  stableShots: number;
}

export interface TowaskiHeavyProgress extends TowaskiLicenseProgressBase {
  mode: "heavy";
  neutralized: number;
  civilianHits: number;
  overheats: number;
}

export interface TowaskiFlameProgress extends TowaskiLicenseProgressBase {
  mode: "flame";
  coverageTotal: number;
  civilianExposures: number;
  fuelTankIgnitions: number;
  minimumFuelRemaining: number;
}

export interface TowaskiSonicProgress extends TowaskiLicenseProgressBase {
  mode: "sonic";
  successes: number;
  protectedExposures: number;
  overloads: number;
  frequencyDeviationTotal: number;
}

export interface TowaskiExplosiveProgress extends TowaskiLicenseProgressBase {
  mode: "explosive";
  successes: number;
  civilianHits: number;
  backblastViolations: number;
}

export type TowaskiLicenseV2Progress =
  | TowaskiFirearmProgress
  | TowaskiPrecisionProgress
  | TowaskiHeavyProgress
  | TowaskiFlameProgress
  | TowaskiSonicProgress
  | TowaskiExplosiveProgress;

interface TowaskiLicenseV2EvaluationBase<
  TMode extends TowaskiLicenseTestMode,
  TMetrics,
> {
  mode: TMode;
  valid: boolean;
  passed: boolean;
  reasons: string[];
  metrics: TMetrics;
}

export type TowaskiLicenseV2Evaluation =
  | TowaskiLicenseV2EvaluationBase<
      "firearm",
      {
        hostileHits: number;
        civilianHits: number;
        shots: number;
        accuracy: number;
      }
    >
  | TowaskiLicenseV2EvaluationBase<
      "precision",
      { score: number; protectedHits: number; stableShots: number }
    >
  | TowaskiLicenseV2EvaluationBase<
      "heavy",
      { neutralized: number; civilianHits: number; overheats: number }
    >
  | TowaskiLicenseV2EvaluationBase<
      "flame",
      {
        averageCoverage: number;
        civilianExposures: number;
        fuelTankIgnitions: number;
        minimumFuelRemaining: number;
      }
    >
  | TowaskiLicenseV2EvaluationBase<
      "sonic",
      {
        successes: number;
        protectedExposures: number;
        overloads: number;
        averageFrequencyDeviation: number;
      }
    >
  | TowaskiLicenseV2EvaluationBase<
      "explosive",
      {
        successes: number;
        civilianHits: number;
        backblastViolations: number;
      }
    >;

export interface TowaskiLicenseV2StepResult {
  progress: TowaskiLicenseV2Progress;
  safetyViolation: boolean;
  stepSucceeded: boolean;
}

export interface TowaskiLicenseV2ChallengeState {
  mode: TowaskiLicenseTestMode;
  programVersion: number;
  scenarios: TowaskiLicenseV2Scenario[];
  progress: TowaskiLicenseV2Progress;
}

type RandomIndex = (maxExclusive: number) => number;

const FIREARM_LAYOUTS = [
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
] as const;

const PRECISION_SCENARIOS: TowaskiPrecisionScenario[] = [
  {
    mode: "precision",
    id: "precision-01",
    target: { x: 0.72, y: 0.36 },
    wind: { x: 0.05, y: -0.01 },
    protectedZone: { id: "protected-01", x: 0.32, y: 0.58, radius: 0.1 },
    distanceMeters: 350,
  },
  {
    mode: "precision",
    id: "precision-02",
    target: { x: 0.31, y: 0.42 },
    wind: { x: -0.06, y: 0.02 },
    protectedZone: { id: "protected-02", x: 0.68, y: 0.62, radius: 0.09 },
    distanceMeters: 520,
  },
  {
    mode: "precision",
    id: "precision-03",
    target: { x: 0.58, y: 0.28 },
    wind: { x: 0.03, y: 0.04 },
    protectedZone: { id: "protected-03", x: 0.23, y: 0.48, radius: 0.08 },
    distanceMeters: 680,
  },
  {
    mode: "precision",
    id: "precision-04",
    target: { x: 0.4, y: 0.6 },
    wind: { x: -0.04, y: -0.03 },
    protectedZone: { id: "protected-04", x: 0.72, y: 0.35, radius: 0.09 },
    distanceMeters: 440,
  },
  {
    mode: "precision",
    id: "precision-05",
    target: { x: 0.78, y: 0.5 },
    wind: { x: 0.07, y: 0 },
    protectedZone: { id: "protected-05", x: 0.42, y: 0.52, radius: 0.09 },
    distanceMeters: 760,
  },
  {
    mode: "precision",
    id: "precision-06",
    target: { x: 0.24, y: 0.3 },
    wind: { x: -0.03, y: 0.05 },
    protectedZone: { id: "protected-06", x: 0.62, y: 0.56, radius: 0.1 },
    distanceMeters: 610,
  },
];

const HEAVY_SCENARIOS: TowaskiHeavyScenario[] = [
  {
    mode: "heavy",
    id: "heavy-01",
    target: { id: "heavy-target-01", x: 0.7, y: 0.38, radius: 0.14 },
    recoil: { x: 0.1, y: -0.14 },
    civilianZone: { id: "heavy-civilian-01", x: 0.42, y: 0.5, radius: 0.11 },
    civilianWindow: { startMs: 2_800, endMs: 4_200 },
    durationMs: 8_000,
    requiredHitSamples: 15,
  },
  {
    mode: "heavy",
    id: "heavy-02",
    target: { id: "heavy-target-02", x: 0.32, y: 0.42, radius: 0.14 },
    recoil: { x: -0.12, y: -0.12 },
    civilianZone: { id: "heavy-civilian-02", x: 0.58, y: 0.48, radius: 0.1 },
    civilianWindow: { startMs: 3_100, endMs: 4_700 },
    durationMs: 8_000,
    requiredHitSamples: 15,
  },
  {
    mode: "heavy",
    id: "heavy-03",
    target: { id: "heavy-target-03", x: 0.62, y: 0.58, radius: 0.13 },
    recoil: { x: 0.08, y: -0.16 },
    civilianZone: { id: "heavy-civilian-03", x: 0.3, y: 0.34, radius: 0.1 },
    civilianWindow: { startMs: 2_500, endMs: 4_000 },
    durationMs: 8_000,
    requiredHitSamples: 16,
  },
  {
    mode: "heavy",
    id: "heavy-04",
    target: { id: "heavy-target-04", x: 0.43, y: 0.32, radius: 0.13 },
    recoil: { x: -0.09, y: -0.15 },
    civilianZone: { id: "heavy-civilian-04", x: 0.72, y: 0.54, radius: 0.11 },
    civilianWindow: { startMs: 3_300, endMs: 5_000 },
    durationMs: 8_000,
    requiredHitSamples: 16,
  },
];

const FLAME_SCENARIOS: TowaskiFlameScenario[] = [
  {
    mode: "flame",
    id: "flame-01",
    hostileZones: [
      { id: "f1-h1", x: 0.18, y: 0.3, radius: 0.1 },
      { id: "f1-h2", x: 0.33, y: 0.48, radius: 0.1 },
      { id: "f1-h3", x: 0.5, y: 0.34, radius: 0.1 },
      { id: "f1-h4", x: 0.68, y: 0.5, radius: 0.1 },
      { id: "f1-h5", x: 0.82, y: 0.3, radius: 0.1 },
    ],
    civilianZone: { id: "f1-c", x: 0.52, y: 0.68, radius: 0.12 },
    fuelTankZone: { id: "f1-t", x: 0.78, y: 0.68, radius: 0.1 },
    durationMs: 12_000,
  },
  {
    mode: "flame",
    id: "flame-02",
    hostileZones: [
      { id: "f2-h1", x: 0.2, y: 0.62, radius: 0.1 },
      { id: "f2-h2", x: 0.35, y: 0.38, radius: 0.1 },
      { id: "f2-h3", x: 0.52, y: 0.56, radius: 0.1 },
      { id: "f2-h4", x: 0.68, y: 0.32, radius: 0.1 },
      { id: "f2-h5", x: 0.82, y: 0.52, radius: 0.1 },
    ],
    civilianZone: { id: "f2-c", x: 0.48, y: 0.24, radius: 0.11 },
    fuelTankZone: { id: "f2-t", x: 0.76, y: 0.76, radius: 0.1 },
    durationMs: 12_000,
  },
  {
    mode: "flame",
    id: "flame-03",
    hostileZones: [
      { id: "f3-h1", x: 0.16, y: 0.42, radius: 0.1 },
      { id: "f3-h2", x: 0.32, y: 0.66, radius: 0.1 },
      { id: "f3-h3", x: 0.5, y: 0.42, radius: 0.1 },
      { id: "f3-h4", x: 0.66, y: 0.64, radius: 0.1 },
      { id: "f3-h5", x: 0.84, y: 0.4, radius: 0.1 },
    ],
    civilianZone: { id: "f3-c", x: 0.52, y: 0.72, radius: 0.1 },
    fuelTankZone: { id: "f3-t", x: 0.74, y: 0.25, radius: 0.1 },
    durationMs: 12_000,
  },
];

const SONIC_SCENARIOS: TowaskiSonicScenario[] = [
  {
    mode: "sonic",
    id: "sonic-01",
    targetFrequencyHz: 180,
    outputBand: { min: 0.48, max: 0.68 },
    widthBand: { min: 0.35, max: 0.55 },
    protectionThreshold: 0.42,
  },
  {
    mode: "sonic",
    id: "sonic-02",
    targetFrequencyHz: 320,
    outputBand: { min: 0.55, max: 0.74 },
    widthBand: { min: 0.24, max: 0.44 },
    protectionThreshold: 0.4,
  },
  {
    mode: "sonic",
    id: "sonic-03",
    targetFrequencyHz: 460,
    outputBand: { min: 0.42, max: 0.64 },
    widthBand: { min: 0.4, max: 0.62 },
    protectionThreshold: 0.44,
  },
  {
    mode: "sonic",
    id: "sonic-04",
    targetFrequencyHz: 620,
    outputBand: { min: 0.5, max: 0.7 },
    widthBand: { min: 0.28, max: 0.48 },
    protectionThreshold: 0.41,
  },
];

const EXPLOSIVE_SCENARIOS: TowaskiExplosiveScenario[] = [
  {
    mode: "explosive",
    id: "explosive-01",
    requiredMunition: "grenade",
    targetFuseMs: 2_000,
    blastRadius: 0.18,
    hostileZones: [
      { id: "e1-h1", x: 0.38, y: 0.38, radius: 0.03 },
      { id: "e1-h2", x: 0.48, y: 0.44, radius: 0.03 },
    ],
    civilianZones: [{ id: "e1-c1", x: 0.75, y: 0.55, radius: 0.05 }],
    safeLaunchLane: "center",
  },
  {
    mode: "explosive",
    id: "explosive-02",
    requiredMunition: "grenade",
    targetFuseMs: 1_000,
    blastRadius: 0.17,
    hostileZones: [
      { id: "e2-h1", x: 0.68, y: 0.32, radius: 0.03 },
      { id: "e2-h2", x: 0.75, y: 0.4, radius: 0.03 },
    ],
    civilianZones: [{ id: "e2-c1", x: 0.42, y: 0.52, radius: 0.05 }],
    safeLaunchLane: "right",
  },
  {
    mode: "explosive",
    id: "explosive-03",
    requiredMunition: "grenade",
    targetFuseMs: 3_000,
    blastRadius: 0.19,
    hostileZones: [
      { id: "e3-h1", x: 0.3, y: 0.58, radius: 0.03 },
      { id: "e3-h2", x: 0.4, y: 0.62, radius: 0.03 },
    ],
    civilianZones: [{ id: "e3-c1", x: 0.62, y: 0.35, radius: 0.05 }],
    safeLaunchLane: "left",
  },
  {
    mode: "explosive",
    id: "explosive-04",
    requiredMunition: "rocket",
    targetFuseMs: 1_000,
    blastRadius: 0.2,
    hostileZones: [
      { id: "e4-h1", x: 0.58, y: 0.38, radius: 0.03 },
      { id: "e4-h2", x: 0.67, y: 0.44, radius: 0.03 },
    ],
    civilianZones: [{ id: "e4-c1", x: 0.28, y: 0.52, radius: 0.05 }],
    safeLaunchLane: "right",
  },
  {
    mode: "explosive",
    id: "explosive-05",
    requiredMunition: "rocket",
    targetFuseMs: 2_000,
    blastRadius: 0.21,
    hostileZones: [
      { id: "e5-h1", x: 0.3, y: 0.34, radius: 0.03 },
      { id: "e5-h2", x: 0.42, y: 0.4, radius: 0.03 },
    ],
    civilianZones: [{ id: "e5-c1", x: 0.72, y: 0.6, radius: 0.05 }],
    safeLaunchLane: "left",
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

function firearmScenarios(randomIndex: RandomIndex): TowaskiFirearmScenario[] {
  const kinds = shuffled(
    [
      ...Array.from({ length: 10 }, () => "hostile" as const),
      ...Array.from({ length: 2 }, () => "civilian" as const),
    ],
    randomIndex,
  );
  return FIREARM_LAYOUTS.map((layout, index) => ({
    mode: "firearm",
    id: `firearm-${index + 1}`,
    kind: kinds[index] ?? "hostile",
    ...layout,
  }));
}

export function createTowaskiLicenseV2State(
  mode: TowaskiLicenseTestMode,
  randomIndex: RandomIndex = defaultRandomIndex,
): TowaskiLicenseV2ChallengeState {
  switch (mode) {
    case "firearm":
      return {
        mode,
        programVersion: TOWASKI_LICENSE_PROGRAM_VERSION,
        scenarios: firearmScenarios(randomIndex),
        progress: {
          mode,
          step: 0,
          hostileHits: 0,
          civilianHits: 0,
          shots: 0,
        },
      };
    case "precision":
      return {
        mode,
        programVersion: TOWASKI_LICENSE_PROGRAM_VERSION,
        scenarios: PRECISION_SCENARIOS,
        progress: {
          mode,
          step: 0,
          score: 0,
          protectedHits: 0,
          stableShots: 0,
        },
      };
    case "heavy":
      return {
        mode,
        programVersion: TOWASKI_LICENSE_PROGRAM_VERSION,
        scenarios: HEAVY_SCENARIOS,
        progress: {
          mode,
          step: 0,
          neutralized: 0,
          civilianHits: 0,
          overheats: 0,
        },
      };
    case "flame":
      return {
        mode,
        programVersion: TOWASKI_LICENSE_PROGRAM_VERSION,
        scenarios: FLAME_SCENARIOS,
        progress: {
          mode,
          step: 0,
          coverageTotal: 0,
          civilianExposures: 0,
          fuelTankIgnitions: 0,
          minimumFuelRemaining: 100,
        },
      };
    case "sonic":
      return {
        mode,
        programVersion: TOWASKI_LICENSE_PROGRAM_VERSION,
        scenarios: SONIC_SCENARIOS,
        progress: {
          mode,
          step: 0,
          successes: 0,
          protectedExposures: 0,
          overloads: 0,
          frequencyDeviationTotal: 0,
        },
      };
    case "explosive":
      return {
        mode,
        programVersion: TOWASKI_LICENSE_PROGRAM_VERSION,
        scenarios: EXPLOSIVE_SCENARIOS,
        progress: {
          mode,
          step: 0,
          successes: 0,
          civilianHits: 0,
          backblastViolations: 0,
        },
      };
  }
}

export function getTowaskiLicenseModeForSlug(
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

export function getTowaskiLicenseStepWindowMs(
  scenario: TowaskiLicenseV2Scenario,
): number {
  switch (scenario.mode) {
    case "firearm":
      return 3_000;
    case "precision":
      return 9_000;
    case "heavy":
    case "flame":
      return scenario.durationMs;
    case "sonic":
      return 12_000;
    case "explosive":
      return 10_000;
  }
}

export function getTowaskiLicenseMinimumResolveMs(
  scenario: TowaskiLicenseV2Scenario,
  input: TowaskiLicenseV2StepInput,
): number {
  if (scenario.mode !== input.mode) {
    return Number.POSITIVE_INFINITY;
  }
  switch (input.mode) {
    case "firearm":
      return input.fired ? 120 : 1_200;
    case "precision":
      return 500;
    case "heavy":
      return scenario.mode === "heavy"
        ? Math.max(2_000, scenario.durationMs - 250)
        : Number.POSITIVE_INFINITY;
    case "flame":
      return 1_000;
    case "sonic":
      return 600;
    case "explosive":
      return 500;
  }
}

export function validateTowaskiLicenseV2StepTiming(args: {
  scenario: TowaskiLicenseV2Scenario;
  input: TowaskiLicenseV2StepInput;
  elapsedMs: number;
}): boolean {
  const { scenario, input, elapsedMs } = args;
  if (
    scenario.mode !== input.mode ||
    !Number.isFinite(elapsedMs) ||
    elapsedMs < getTowaskiLicenseMinimumResolveMs(scenario, input) ||
    elapsedMs > getTowaskiLicenseStepWindowMs(scenario) + 5_000
  ) {
    return false;
  }

  const reportedHorizonMs =
    input.mode === "precision"
      ? input.holdMs
      : input.mode === "sonic"
        ? input.pulseMs
        : input.mode === "heavy" || input.mode === "flame"
          ? input.samples.at(-1)?.t
          : undefined;
  if (
    reportedHorizonMs !== undefined &&
    reportedHorizonMs > elapsedMs + TOWASKI_LICENSE_TIMING_TOLERANCE_MS
  ) {
    return false;
  }

  if (input.mode === "heavy") {
    if (scenario.mode !== "heavy") return false;
    const finalSample = input.samples.at(-1);
    return Boolean(
      finalSample &&
        finalSample.t >= scenario.durationMs - 250 &&
        finalSample.t <= scenario.durationMs,
    );
  }
  if (input.mode === "flame") {
    if (scenario.mode !== "flame") return false;
    const firstSample = input.samples[0];
    const finalSample = input.samples.at(-1);
    if (
      !firstSample ||
      !finalSample ||
      finalSample.t > scenario.durationMs
    ) {
      return false;
    }
    const activeSamples = input.samples.filter((sample) => sample.active);
    return (
      activeSamples.length < 4 ||
      activeSamples.at(-1)!.t - activeSamples[0]!.t >= 200
    );
  }
  return true;
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

function parseSamples(value: unknown): TowaskiTimedPointerSample[] | null {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > TOWASKI_LICENSE_MAX_STEP_SAMPLES
  ) {
    return null;
  }
  const samples: TowaskiTimedPointerSample[] = [];
  let previousTime = -1;
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      !isIntegerRange(entry.t, 0, 15_000) ||
      (previousTime >= 0 &&
        entry.t - previousTime < TOWASKI_LICENSE_MIN_SAMPLE_INTERVAL_MS) ||
      !isFiniteRange(entry.x, 0, 1) ||
      !isFiniteRange(entry.y, 0, 1) ||
      typeof entry.active !== "boolean"
    ) {
      return null;
    }
    previousTime = entry.t;
    samples.push({
      t: entry.t,
      x: entry.x,
      y: entry.y,
      active: entry.active,
    });
  }
  return samples;
}

export function parseTowaskiLicenseV2StepInput(
  value: unknown,
): TowaskiLicenseV2StepInput | null {
  if (!isRecord(value) || typeof value.mode !== "string") return null;
  switch (value.mode) {
    case "firearm":
      if (
        typeof value.fired !== "boolean" ||
        !isIntegerRange(value.shots, 0, 2) ||
        (value.targetId !== undefined && typeof value.targetId !== "string") ||
        (value.fired && value.shots < 1) ||
        (!value.fired && value.shots !== 0)
      ) {
        return null;
      }
      return {
        mode: "firearm",
        fired: value.fired,
        shots: value.shots,
        ...(typeof value.targetId === "string"
          ? { targetId: value.targetId }
          : {}),
      };
    case "precision":
      if (
        !isFiniteRange(value.aimX, 0, 1) ||
        !isFiniteRange(value.aimY, 0, 1) ||
        !isIntegerRange(value.holdMs, 0, 10_000)
      ) {
        return null;
      }
      return {
        mode: "precision",
        aimX: value.aimX,
        aimY: value.aimY,
        holdMs: value.holdMs,
      };
    case "heavy":
    case "flame": {
      const samples = parseSamples(value.samples);
      return samples ? { mode: value.mode, samples } : null;
    }
    case "sonic":
      if (
        !isFiniteRange(value.frequencyHz, 80, 1_200) ||
        !isFiniteRange(value.output, 0, 1) ||
        !isFiniteRange(value.width, 0, 1) ||
        !isIntegerRange(value.pulseMs, 0, 3_000)
      ) {
        return null;
      }
      return {
        mode: "sonic",
        frequencyHz: value.frequencyHz,
        output: value.output,
        width: value.width,
        pulseMs: value.pulseMs,
      };
    case "explosive":
      if (
        !["grenade", "rocket"].includes(String(value.munition)) ||
        !isFiniteRange(value.impactX, 0, 1) ||
        !isFiniteRange(value.impactY, 0, 1) ||
        ![1_000, 2_000, 3_000].includes(Number(value.fuseMs)) ||
        !["left", "center", "right"].includes(String(value.launchLane))
      ) {
        return null;
      }
      return {
        mode: "explosive",
        munition: value.munition as TowaskiExplosiveMunition,
        impactX: value.impactX,
        impactY: value.impactY,
        fuseMs: value.fuseMs as 1_000 | 2_000 | 3_000,
        launchLane: value.launchLane as TowaskiExplosiveLaunchLane,
      };
    default:
      return null;
  }
}

function distance(first: TowaskiPoint, second: TowaskiPoint): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function maxContinuousActiveMs(samples: TowaskiTimedPointerSample[]): number {
  let segmentStart: number | null = null;
  let maximum = 0;
  for (const sample of samples) {
    if (sample.active && segmentStart === null) segmentStart = sample.t;
    if (!sample.active && segmentStart !== null) {
      maximum = Math.max(maximum, sample.t - segmentStart);
      segmentStart = null;
    }
  }
  if (segmentStart !== null) {
    maximum = Math.max(
      maximum,
      samples[samples.length - 1]!.t - segmentStart,
    );
  }
  return maximum;
}

function resolveFirearm(
  scenario: TowaskiFirearmScenario,
  input: Extract<TowaskiLicenseV2StepInput, { mode: "firearm" }>,
  progress: TowaskiFirearmProgress,
): TowaskiLicenseV2StepResult {
  const hit = input.fired && input.targetId === scenario.id;
  const civilianHit = scenario.kind === "civilian" && hit;
  const hostileHit = scenario.kind === "hostile" && hit;
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
      (scenario.kind === "civilian" && !hit),
  };
}

function resolvePrecision(
  scenario: TowaskiPrecisionScenario,
  input: Extract<TowaskiLicenseV2StepInput, { mode: "precision" }>,
  progress: TowaskiPrecisionProgress,
): TowaskiLicenseV2StepResult {
  const impact = {
    x: input.aimX + scenario.wind.x,
    y: input.aimY + scenario.wind.y,
  };
  const targetDistance = distance(impact, scenario.target);
  const protectedHit =
    distance(impact, scenario.protectedZone) <= scenario.protectedZone.radius;
  const stable = input.holdMs >= 500;
  const points = stable && !protectedHit
    ? targetDistance <= TOWASKI_PRECISION_BULLSEYE_RADIUS
      ? 2
      : targetDistance <= TOWASKI_PRECISION_SCORING_RADIUS
        ? 1
        : 0
    : 0;
  return {
    progress: {
      ...progress,
      step: progress.step + 1,
      score: progress.score + points,
      protectedHits: progress.protectedHits + (protectedHit ? 1 : 0),
      stableShots: progress.stableShots + (stable ? 1 : 0),
    },
    safetyViolation: protectedHit,
    stepSucceeded: points > 0,
  };
}

function resolveHeavy(
  scenario: TowaskiHeavyScenario,
  input: Extract<TowaskiLicenseV2StepInput, { mode: "heavy" }>,
  progress: TowaskiHeavyProgress,
): TowaskiLicenseV2StepResult {
  const activeSamples = input.samples.filter((sample) => sample.active);
  const effectiveSamples = activeSamples.map((sample) => {
    const elapsedRatio = Math.min(1, sample.t / scenario.durationMs);
    return {
      ...sample,
      x: sample.x + scenario.recoil.x * elapsedRatio,
      y: sample.y + scenario.recoil.y * elapsedRatio,
    };
  });
  const hitSamples = effectiveSamples.filter(
    (sample) => distance(sample, scenario.target) <= scenario.target.radius,
  );
  const civilianHit = effectiveSamples.some(
    (sample) =>
      sample.t >= scenario.civilianWindow.startMs &&
      sample.t <= scenario.civilianWindow.endMs &&
      distance(sample, scenario.civilianZone) <= scenario.civilianZone.radius,
  );
  const overheated = maxContinuousActiveMs(input.samples) > 1_800;
  const neutralized =
    hitSamples.length >= scenario.requiredHitSamples &&
    !civilianHit &&
    !overheated;
  return {
    progress: {
      ...progress,
      step: progress.step + 1,
      neutralized: progress.neutralized + (neutralized ? 1 : 0),
      civilianHits: progress.civilianHits + (civilianHit ? 1 : 0),
      overheats: progress.overheats + (overheated ? 1 : 0),
    },
    safetyViolation: civilianHit || overheated,
    stepSucceeded: neutralized,
  };
}

function resolveFlame(
  scenario: TowaskiFlameScenario,
  input: Extract<TowaskiLicenseV2StepInput, { mode: "flame" }>,
  progress: TowaskiFlameProgress,
): TowaskiLicenseV2StepResult {
  const activeSamples = input.samples.filter((sample) => sample.active);
  const covered = scenario.hostileZones.filter((zone) =>
    activeSamples.some((sample) => distance(sample, zone) <= zone.radius),
  ).length;
  const coverage = covered / scenario.hostileZones.length;
  const civilianExposure = activeSamples.some(
    (sample) =>
      distance(sample, scenario.civilianZone) <= scenario.civilianZone.radius,
  );
  const fuelTankIgnition = activeSamples.some(
    (sample) =>
      distance(sample, scenario.fuelTankZone) <= scenario.fuelTankZone.radius,
  );
  const fuelRemaining = Math.max(0, 100 - activeSamples.length * 0.7);
  return {
    progress: {
      ...progress,
      step: progress.step + 1,
      coverageTotal: progress.coverageTotal + coverage,
      civilianExposures:
        progress.civilianExposures + (civilianExposure ? 1 : 0),
      fuelTankIgnitions:
        progress.fuelTankIgnitions + (fuelTankIgnition ? 1 : 0),
      minimumFuelRemaining: Math.min(
        progress.minimumFuelRemaining,
        fuelRemaining,
      ),
    },
    safetyViolation: civilianExposure || fuelTankIgnition,
    stepSucceeded:
      coverage >= 0.8 &&
      !civilianExposure &&
      !fuelTankIgnition &&
      fuelRemaining >= 10,
  };
}

function resolveSonic(
  scenario: TowaskiSonicScenario,
  input: Extract<TowaskiLicenseV2StepInput, { mode: "sonic" }>,
  progress: TowaskiSonicProgress,
): TowaskiLicenseV2StepResult {
  const deviation =
    Math.abs(input.frequencyHz - scenario.targetFrequencyHz) /
    scenario.targetFrequencyHz;
  const inOutputBand =
    input.output >= scenario.outputBand.min &&
    input.output <= scenario.outputBand.max;
  const inWidthBand =
    input.width >= scenario.widthBand.min &&
    input.width <= scenario.widthBand.max;
  const protectedExposure =
    input.output * input.width > scenario.protectionThreshold;
  const overloaded = input.output > 0.9 || input.pulseMs > 1_600;
  const succeeded =
    deviation <= 0.05 &&
    inOutputBand &&
    inWidthBand &&
    input.pulseMs >= 600 &&
    input.pulseMs <= 1_500 &&
    !protectedExposure &&
    !overloaded;
  return {
    progress: {
      ...progress,
      step: progress.step + 1,
      successes: progress.successes + (succeeded ? 1 : 0),
      protectedExposures:
        progress.protectedExposures + (protectedExposure ? 1 : 0),
      overloads: progress.overloads + (overloaded ? 1 : 0),
      frequencyDeviationTotal:
        progress.frequencyDeviationTotal + deviation,
    },
    safetyViolation: protectedExposure || overloaded,
    stepSucceeded: succeeded,
  };
}

function resolveExplosive(
  scenario: TowaskiExplosiveScenario,
  input: Extract<TowaskiLicenseV2StepInput, { mode: "explosive" }>,
  progress: TowaskiExplosiveProgress,
): TowaskiLicenseV2StepResult {
  const impact = { x: input.impactX, y: input.impactY };
  const neutralized = scenario.hostileZones.filter(
    (zone) => distance(impact, zone) <= scenario.blastRadius,
  ).length;
  const civilianHits = scenario.civilianZones.filter(
    (zone) => distance(impact, zone) <= scenario.blastRadius,
  ).length;
  const backblastViolation =
    input.munition === "rocket" &&
    input.launchLane !== scenario.safeLaunchLane;
  const succeeded =
    input.munition === scenario.requiredMunition &&
    input.fuseMs === scenario.targetFuseMs &&
    neutralized === scenario.hostileZones.length &&
    civilianHits === 0 &&
    !backblastViolation;
  return {
    progress: {
      ...progress,
      step: progress.step + 1,
      successes: progress.successes + (succeeded ? 1 : 0),
      civilianHits: progress.civilianHits + civilianHits,
      backblastViolations:
        progress.backblastViolations + (backblastViolation ? 1 : 0),
    },
    safetyViolation: civilianHits > 0 || backblastViolation,
    stepSucceeded: succeeded,
  };
}

export function resolveTowaskiLicenseV2Step(args: {
  scenario: TowaskiLicenseV2Scenario;
  input: TowaskiLicenseV2StepInput;
  progress: TowaskiLicenseV2Progress;
}): TowaskiLicenseV2StepResult {
  const { scenario, input, progress } = args;
  if (
    scenario.mode !== input.mode ||
    progress.mode !== scenario.mode
  ) {
    throw new Error("TOWASKI_LICENSE_MODE_MISMATCH");
  }
  switch (scenario.mode) {
    case "firearm":
      return resolveFirearm(
        scenario,
        input as Extract<TowaskiLicenseV2StepInput, { mode: "firearm" }>,
        progress as TowaskiFirearmProgress,
      );
    case "precision":
      return resolvePrecision(
        scenario,
        input as Extract<TowaskiLicenseV2StepInput, { mode: "precision" }>,
        progress as TowaskiPrecisionProgress,
      );
    case "heavy":
      return resolveHeavy(
        scenario,
        input as Extract<TowaskiLicenseV2StepInput, { mode: "heavy" }>,
        progress as TowaskiHeavyProgress,
      );
    case "flame":
      return resolveFlame(
        scenario,
        input as Extract<TowaskiLicenseV2StepInput, { mode: "flame" }>,
        progress as TowaskiFlameProgress,
      );
    case "sonic":
      return resolveSonic(
        scenario,
        input as Extract<TowaskiLicenseV2StepInput, { mode: "sonic" }>,
        progress as TowaskiSonicProgress,
      );
    case "explosive":
      return resolveExplosive(
        scenario,
        input as Extract<TowaskiLicenseV2StepInput, { mode: "explosive" }>,
        progress as TowaskiExplosiveProgress,
      );
  }
}

export function resolveTowaskiLicenseProgramStep(args: {
  programVersion: number;
  scenario: TowaskiLicenseV2Scenario;
  input: TowaskiLicenseV2StepInput;
  progress: TowaskiLicenseV2Progress;
}): TowaskiLicenseV2StepResult {
  switch (args.programVersion) {
    case TOWASKI_LICENSE_PROGRAM_VERSION:
      return resolveTowaskiLicenseV2Step(args);
    default:
      throw new Error("TOWASKI_LICENSE_UNSUPPORTED_PROGRAM_VERSION");
  }
}

export function evaluateTowaskiLicenseV2Progress(
  progress: TowaskiLicenseV2Progress,
): TowaskiLicenseV2Evaluation {
  const reasons: string[] = [];
  switch (progress.mode) {
    case "firearm": {
      const accuracy =
        progress.shots === 0 ? 0 : progress.hostileHits / progress.shots;
      if (progress.hostileHits < 7) reasons.push("hostile_hits");
      if (progress.civilianHits > 0) reasons.push("civilian_hit");
      if (accuracy < 0.65) reasons.push("accuracy");
      return {
        mode: "firearm",
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
    case "precision": {
      if (progress.score < 8) reasons.push("precision_score");
      if (progress.protectedHits > 0) reasons.push("protected_hit");
      if (progress.stableShots < 6) reasons.push("unstable_shot");
      return {
        mode: "precision",
        valid: true,
        passed: reasons.length === 0,
        reasons,
        metrics: {
          score: progress.score,
          protectedHits: progress.protectedHits,
          stableShots: progress.stableShots,
        },
      };
    }
    case "heavy": {
      if (progress.neutralized < 3) reasons.push("suppression");
      if (progress.civilianHits > 0) reasons.push("civilian_hit");
      if (progress.overheats > 0) reasons.push("overheat");
      return {
        mode: "heavy",
        valid: true,
        passed: reasons.length === 0,
        reasons,
        metrics: {
          neutralized: progress.neutralized,
          civilianHits: progress.civilianHits,
          overheats: progress.overheats,
        },
      };
    }
    case "flame": {
      const averageCoverage =
        progress.step === 0 ? 0 : progress.coverageTotal / progress.step;
      if (averageCoverage < 0.8 - 1e-9) reasons.push("coverage");
      if (progress.civilianExposures > 0) reasons.push("civilian_exposure");
      if (progress.fuelTankIgnitions > 0) reasons.push("fuel_tank");
      if (progress.minimumFuelRemaining < 10) reasons.push("fuel");
      return {
        mode: "flame",
        valid: true,
        passed: reasons.length === 0,
        reasons,
        metrics: {
          averageCoverage,
          civilianExposures: progress.civilianExposures,
          fuelTankIgnitions: progress.fuelTankIgnitions,
          minimumFuelRemaining: progress.minimumFuelRemaining,
        },
      };
    }
    case "sonic": {
      const averageFrequencyDeviation =
        progress.step === 0
          ? 1
          : progress.frequencyDeviationTotal / progress.step;
      if (progress.successes < 3) reasons.push("resonance");
      if (averageFrequencyDeviation > 0.05) {
        reasons.push("frequency_deviation");
      }
      if (progress.protectedExposures > 0) {
        reasons.push("protected_exposure");
      }
      if (progress.overloads > 0) reasons.push("overload");
      return {
        mode: "sonic",
        valid: true,
        passed: reasons.length === 0,
        reasons,
        metrics: {
          successes: progress.successes,
          protectedExposures: progress.protectedExposures,
          overloads: progress.overloads,
          averageFrequencyDeviation,
        },
      };
    }
    case "explosive": {
      if (progress.successes < 4) reasons.push("clearance");
      if (progress.civilianHits > 0) reasons.push("civilian_hit");
      if (progress.backblastViolations > 0) reasons.push("backblast");
      return {
        mode: "explosive",
        valid: true,
        passed: reasons.length === 0,
        reasons,
        metrics: {
          successes: progress.successes,
          civilianHits: progress.civilianHits,
          backblastViolations: progress.backblastViolations,
        },
      };
    }
  }
}

export function evaluateTowaskiLicenseProgramProgress(
  programVersion: number,
  progress: TowaskiLicenseV2Progress,
): TowaskiLicenseV2Evaluation {
  switch (programVersion) {
    case TOWASKI_LICENSE_PROGRAM_VERSION:
      return evaluateTowaskiLicenseV2Progress(progress);
    default:
      throw new Error("TOWASKI_LICENSE_UNSUPPORTED_PROGRAM_VERSION");
  }
}

export function isTowaskiLicenseV2Complete(
  state: TowaskiLicenseV2ChallengeState,
): boolean {
  return state.progress.step >= state.scenarios.length;
}
