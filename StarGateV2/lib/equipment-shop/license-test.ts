import type { TowaskiLicenseSlug } from "./licenses";
import {
  createTowaskiLicenseV2State,
  evaluateTowaskiLicenseProgramProgress,
  getTowaskiLicenseModeForSlug,
  getTowaskiLicenseStepWindowMs,
  isTowaskiLicenseV2Complete,
  parseTowaskiLicenseV2StepInput,
  resolveTowaskiLicenseProgramStep,
  TOWASKI_LICENSE_PROGRAM_VERSION,
  validateTowaskiLicenseV2StepTiming,
  type TowaskiLicenseTestMode,
  type TowaskiLicenseV2ChallengeState,
  type TowaskiLicenseV2Evaluation,
  type TowaskiLicenseV2Progress,
  type TowaskiLicenseV2Scenario,
  type TowaskiLicenseV2StepInput,
} from "./license-test-v2.ts";

export const TOWASKI_BASIC_FIREARM_LICENSE_SLUG =
  "towaski-license-basic-firearm" as const;

export const TOWASKI_LICENSE_REDEMPTION_LEASE_MS = 20_000;

const COMMON_LICENSE_TEST_RULES = {
  hostileTargets: 10,
  civilianTargets: 2,
  maxCivilianHits: 0,
  maxShots: 24,
  maxShotsPerRound: 3,
  minDurationMs: 3_000,
  maxDurationMs: 60_000,
  challengeTtlMs: 120_000,
} as const;

export const TOWASKI_LICENSE_TEST_DIFFICULTIES = {
  basic: {
    ...COMMON_LICENSE_TEST_RULES,
    label: "기초",
    description: "큰 표적과 충분한 판정 시간",
    requiredHostileHits: 4,
    minAccuracy: 0.4,
    minHitReactionMs: 120,
    minMissWindowMs: 1_200,
    targetWindowMs: 3_000,
    maxRoundDurationMs: 8_000,
    targetScale: 1.35,
  },
  standard: {
    ...COMMON_LICENSE_TEST_RULES,
    label: "표준",
    description: "기존 자격시험 기준",
    requiredHostileHits: 8,
    minAccuracy: 0.6,
    minHitReactionMs: 120,
    minMissWindowMs: 700,
    targetWindowMs: 1_500,
    maxRoundDurationMs: 6_500,
    targetScale: 1,
  },
  expert: {
    ...COMMON_LICENSE_TEST_RULES,
    label: "숙련",
    description: "빠른 식별과 정밀 사격",
    requiredHostileHits: 10,
    minAccuracy: 0.8,
    minHitReactionMs: 120,
    minMissWindowMs: 500,
    targetWindowMs: 750,
    maxRoundDurationMs: 5_750,
    targetScale: 0.9,
  },
} as const;

export type TowaskiLicenseTestDifficulty =
  keyof typeof TOWASKI_LICENSE_TEST_DIFFICULTIES;

export type TowaskiLicenseTestTier = "basic" | "intermediate" | "advanced";

export interface TowaskiLicenseTestProgram {
  licenseSlug: TowaskiLicenseSlug;
  licenseName: string;
  licenseLabel: string;
  licenseEffect: string;
  testCode: string;
  title: string;
  tier: TowaskiLicenseTestTier;
  tierLabel: string;
  difficulty: TowaskiLicenseTestDifficulty;
  mode: TowaskiLicenseTestMode;
  programVersion: number;
  briefing: string;
  requiresBasicLicense: boolean;
}

export const TOWASKI_LICENSE_TEST_PROGRAMS: Record<
  TowaskiLicenseSlug,
  TowaskiLicenseTestProgram
> = {
  "towaski-license-basic-firearm": {
    licenseSlug: "towaski-license-basic-firearm",
    licenseName: "토와스키 기본 화기 라이센스",
    licenseLabel: "기본 화기",
    licenseEffect: "권총·소총·산탄총 반출 자격",
    testCode: "B-01",
    title: "기본 화기 자격시험",
    tier: "basic",
    tierLabel: "기초",
    difficulty: "basic",
    mode: "firearm",
    programVersion: TOWASKI_LICENSE_PROGRAM_VERSION,
    briefing:
      "적성 표적을 식별해 사격하고 민간 표적에는 사격하지 마십시오.",
    requiresBasicLicense: false,
  },
  "towaski-license-precision-firearm": {
    licenseSlug: "towaski-license-precision-firearm",
    licenseName: "토와스키 정밀 사격 라이센스",
    licenseLabel: "정밀 사격",
    licenseEffect: "저격소총 반출 자격",
    testCode: "M-02",
    title: "정밀 사격 자격시험",
    tier: "intermediate",
    tierLabel: "중급",
    difficulty: "standard",
    mode: "precision",
    programVersion: TOWASKI_LICENSE_PROGRAM_VERSION,
    briefing:
      "거리와 풍향을 역산해 여섯 표적의 조준점을 보정하고, 호흡을 안정시킨 뒤 한 발만 발사하십시오.",
    requiresBasicLicense: true,
  },
  "towaski-license-heavy-weapon": {
    licenseSlug: "towaski-license-heavy-weapon",
    licenseName: "토와스키 중화기 라이센스",
    licenseLabel: "중화기",
    licenseEffect: "중기관총·설치화기 반출 자격",
    testCode: "A-11",
    title: "중화기 운용 자격시험",
    tier: "advanced",
    tierLabel: "고급",
    difficulty: "expert",
    mode: "heavy",
    programVersion: TOWASKI_LICENSE_PROGRAM_VERSION,
    briefing:
      "네 제압 구간에서 반동을 억제해 짧게 점사하고, 횡단 인원과 총열 과열을 피하십시오.",
    requiresBasicLicense: true,
  },
  "towaski-license-flame-weapon": {
    licenseSlug: "towaski-license-flame-weapon",
    licenseName: "토와스키 화염 장비 라이센스",
    licenseLabel: "화염 장비",
    licenseEffect: "화염방사기 반출 자격",
    testCode: "A-12",
    title: "화염 장비 운용 자격시험",
    tier: "advanced",
    tierLabel: "고급",
    difficulty: "expert",
    mode: "flame",
    programVersion: TOWASKI_LICENSE_PROGRAM_VERSION,
    briefing:
      "화염 원뿔을 끊어 분사하며 적성 구역만 소각하고, 민간 구역과 연료통을 피하십시오.",
    requiresBasicLicense: true,
  },
  "towaski-license-sonic-equipment": {
    licenseSlug: "towaski-license-sonic-equipment",
    licenseName: "토와스키 음파 장비 라이센스",
    licenseLabel: "음파 장비",
    licenseEffect: "음파 방출기 반출 자격",
    testCode: "A-13",
    title: "음파 장비 운용 자격시험",
    tier: "advanced",
    tierLabel: "고급",
    difficulty: "expert",
    mode: "sonic",
    programVersion: TOWASKI_LICENSE_PROGRAM_VERSION,
    briefing:
      "상황별 공진 주파수에 파형을 맞춘 뒤 출력과 폭을 안전 범위로 봉인해 펄스를 방출하십시오.",
    requiresBasicLicense: true,
  },
  "towaski-license-explosive-ordnance": {
    licenseSlug: "towaski-license-explosive-ordnance",
    licenseName: "토와스키 폭발물 취급 라이센스",
    licenseLabel: "폭발물 취급",
    licenseEffect: "수류탄·로켓 런처 반출 자격",
    testCode: "A-14",
    title: "폭발물 취급 자격시험",
    tier: "advanced",
    tierLabel: "고급",
    difficulty: "expert",
    mode: "explosive",
    programVersion: TOWASKI_LICENSE_PROGRAM_VERSION,
    briefing:
      "탄종·착탄점·신관을 선택해 적성 집단만 제압하고, 민간 피해와 로켓 후폭풍을 방지하십시오.",
    requiresBasicLicense: true,
  },
};

export function getTowaskiLicenseTestProgram(
  licenseSlug: TowaskiLicenseSlug,
): TowaskiLicenseTestProgram {
  return TOWASKI_LICENSE_TEST_PROGRAMS[licenseSlug];
}

function isTowaskiLicenseTestSlug(value: unknown): value is TowaskiLicenseSlug {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(TOWASKI_LICENSE_TEST_PROGRAMS, value)
  );
}

export function isTowaskiLicenseTestDifficulty(
  value: unknown,
): value is TowaskiLicenseTestDifficulty {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(
      TOWASKI_LICENSE_TEST_DIFFICULTIES,
      value,
    )
  );
}

export function getTowaskiLicenseTestRules(
  difficulty: TowaskiLicenseTestDifficulty,
) {
  return TOWASKI_LICENSE_TEST_DIFFICULTIES[difficulty];
}

export function getTowaskiLicenseTargetRemainingMs(
  roundDeadlineAt: string,
  targetWindowMs: number,
  nowMs = Date.now(),
): number {
  const deadlineMs = Date.parse(roundDeadlineAt);
  const serverRemainingMs = Number.isFinite(deadlineMs)
    ? Math.max(0, deadlineMs - nowMs)
    : 0;

  // API 응답 지연이 짧은 숙련 표적의 실제 클릭 시간을 소진하지 않게 한다.
  return Math.max(targetWindowMs, serverRemainingMs);
}

// 기존 진행 중 challenge는 배포 전 기준인 표준 난이도로 판정한다.
export const TOWASKI_BASIC_LICENSE_TEST_RULES =
  TOWASKI_LICENSE_TEST_DIFFICULTIES.standard;

export type TowaskiLicenseTargetKind = "hostile" | "civilian";
export type TowaskiLicenseTargetLane = "near" | "mid" | "far";

export interface TowaskiLicenseTarget {
  kind: TowaskiLicenseTargetKind;
  x: number;
  y: number;
  lane: TowaskiLicenseTargetLane;
}

export const TOWASKI_LICENSE_TARGET_LAYOUTS: readonly Omit<
  TowaskiLicenseTarget,
  "kind"
>[] = [
  { x: 12, y: 48, lane: "near" },
  { x: 72, y: 30, lane: "far" },
  { x: 42, y: 42, lane: "mid" },
  { x: 84, y: 52, lane: "near" },
  { x: 27, y: 25, lane: "far" },
  { x: 55, y: 47, lane: "mid" },
  { x: 18, y: 35, lane: "mid" },
  { x: 67, y: 22, lane: "far" },
  { x: 36, y: 54, lane: "near" },
  { x: 80, y: 39, lane: "mid" },
  { x: 48, y: 28, lane: "far" },
  { x: 8, y: 54, lane: "near" },
] as const;

export interface TowaskiBasicLicenseTestResult {
  hostileHits: number;
  civilianHits: number;
  shots: number;
  durationMs: number;
}

export interface TowaskiBasicLicenseTestEvaluation {
  valid: boolean;
  passed: boolean;
  accuracy: number;
  reasons: string[];
}

export interface TowaskiLicenseTestStats {
  hostileHits: number;
  civilianHits: number;
  shots: number;
}

export type TowaskiLegacyLicenseTestResolveRequest = {
  action: "resolve";
  challengeId: string;
  round: number;
  hit: boolean;
  shots: number;
};

export type TowaskiLicenseV2ResolveRequest = {
  action: "resolve";
  challengeId: string;
  step: number;
  input: TowaskiLicenseV2StepInput;
};

export type TowaskiLicenseTestRequest =
  | { action: "start"; licenseSlug: TowaskiLicenseSlug }
  | TowaskiLegacyLicenseTestResolveRequest
  | TowaskiLicenseV2ResolveRequest;

export type TowaskiLicenseTestEvaluation =
  | TowaskiBasicLicenseTestEvaluation
  | TowaskiLicenseV2Evaluation;

export type TowaskiLicenseTestResponse =
  | {
      status: "active";
      programVersion: 1;
      mode: "firearm";
      challengeId: string;
      round: number;
      target: TowaskiLicenseTarget;
      licenseSlug: TowaskiLicenseSlug;
      difficulty: TowaskiLicenseTestDifficulty;
      stats: TowaskiLicenseTestStats;
      roundDeadlineAt: string;
    }
  | {
      status: "active";
      programVersion: number;
      mode: TowaskiLicenseTestMode;
      challengeId: string;
      step: number;
      scenario: TowaskiLicenseV2Scenario;
      licenseSlug: TowaskiLicenseSlug;
      difficulty: TowaskiLicenseTestDifficulty;
      progress: TowaskiLicenseV2Progress;
      stepDeadlineAt: string;
    }
  | {
      status: "processing";
      challengeId: string;
      licenseSlug: TowaskiLicenseSlug;
      difficulty: TowaskiLicenseTestDifficulty;
      programVersion?: number;
      mode?: TowaskiLicenseTestMode;
    }
  | {
      status: "failed";
      programVersion: 1;
      mode: "firearm";
      challengeId: string;
      licenseSlug: TowaskiLicenseSlug;
      difficulty: TowaskiLicenseTestDifficulty;
      stats: TowaskiLicenseTestStats;
      evaluation: TowaskiBasicLicenseTestEvaluation;
    }
  | {
      status: "failed";
      programVersion: number;
      mode: TowaskiLicenseTestMode;
      challengeId: string;
      licenseSlug: TowaskiLicenseSlug;
      difficulty: TowaskiLicenseTestDifficulty;
      progress: TowaskiLicenseV2Progress;
      evaluation: TowaskiLicenseV2Evaluation;
    }
  | {
      status: "granted" | "already_owned";
      license: {
        slug: string;
        name: string;
        label: string;
        effect: string;
      };
      difficulty?: TowaskiLicenseTestDifficulty;
      programVersion?: number;
      mode?: TowaskiLicenseTestMode;
      evaluation?: TowaskiLicenseTestEvaluation;
    };

export function parseTowaskiLicenseTestRequest(
  value: unknown,
): TowaskiLicenseTestRequest | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (body.action === "start") {
    const licenseSlug =
      body.licenseSlug ?? TOWASKI_BASIC_FIREARM_LICENSE_SLUG;
    return isTowaskiLicenseTestSlug(licenseSlug)
      ? { action: "start", licenseSlug }
      : null;
  }
  if (
    body.action === "resolve" &&
    typeof body.challengeId === "string" &&
    typeof body.step === "number" &&
    Number.isInteger(body.step) &&
    body.step >= 0 &&
    body.step < TOWASKI_LICENSE_TARGET_LAYOUTS.length
  ) {
    const input = parseTowaskiLicenseV2StepInput(body.input);
    return input
      ? {
          action: "resolve",
          challengeId: body.challengeId,
          step: body.step,
          input,
        }
      : null;
  }
  if (
    body.action !== "resolve" ||
    typeof body.challengeId !== "string" ||
    typeof body.round !== "number" ||
    !Number.isInteger(body.round) ||
    body.round < 0 ||
    body.round >= TOWASKI_LICENSE_TARGET_LAYOUTS.length ||
    typeof body.hit !== "boolean" ||
    typeof body.shots !== "number" ||
    !Number.isInteger(body.shots) ||
    body.shots < 0 ||
    body.shots > TOWASKI_BASIC_LICENSE_TEST_RULES.maxShotsPerRound ||
    (body.hit && body.shots < 1)
  ) {
    return null;
  }
  return {
    action: "resolve",
    challengeId: body.challengeId,
    round: body.round,
    hit: body.hit,
    shots: body.shots,
  };
}

function isIntegerInRange(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

export function evaluateTowaskiBasicLicenseTest(
  value: unknown,
  difficulty: TowaskiLicenseTestDifficulty = "standard",
): TowaskiBasicLicenseTestEvaluation {
  const rules = getTowaskiLicenseTestRules(difficulty);
  if (!value || typeof value !== "object") {
    return { valid: false, passed: false, accuracy: 0, reasons: ["invalid"] };
  }

  const result = value as Partial<TowaskiBasicLicenseTestResult>;
  const hostileHits = result.hostileHits;
  const civilianHits = result.civilianHits;
  const shots = result.shots;
  const durationMs = result.durationMs;
  if (
    !isIntegerInRange(hostileHits, 0, rules.hostileTargets) ||
    !isIntegerInRange(civilianHits, 0, rules.civilianTargets) ||
    !isIntegerInRange(shots, 0, rules.maxShots) ||
    !isIntegerInRange(durationMs, rules.minDurationMs, rules.maxDurationMs) ||
    shots < hostileHits + civilianHits
  ) {
    return { valid: false, passed: false, accuracy: 0, reasons: ["invalid"] };
  }

  const accuracy = shots === 0 ? 0 : hostileHits / shots;
  const reasons: string[] = [];
  if (hostileHits < rules.requiredHostileHits) reasons.push("hostile_hits");
  if (civilianHits > rules.maxCivilianHits) reasons.push("civilian_hit");
  if (accuracy < rules.minAccuracy) reasons.push("accuracy");

  return {
    valid: true,
    passed: reasons.length === 0,
    accuracy,
    reasons,
  };
}

const DEBUG_CIVILIAN_ROUNDS = new Set([3, 8]);

export interface TowaskiDebugLicenseSession {
  challengeId: string;
  licenseSlug: TowaskiLicenseSlug;
  difficulty: TowaskiLicenseTestDifficulty;
  round: number;
  startedAtMs: number;
  roundStartedAtMs: number;
  stats: TowaskiLicenseTestStats;
  targets: TowaskiLicenseTarget[];
}

function debugActiveResponse(
  session: TowaskiDebugLicenseSession,
): TowaskiLicenseTestResponse {
  const target = session.targets[session.round];
  if (!target) throw new Error("DEBUG_LICENSE_TARGET_MISSING");
  return {
    status: "active",
    programVersion: 1,
    mode: "firearm",
    challengeId: session.challengeId,
    round: session.round,
    target,
    licenseSlug: session.licenseSlug,
    difficulty: session.difficulty,
    stats: session.stats,
    roundDeadlineAt: new Date(
      session.roundStartedAtMs +
        getTowaskiLicenseTestRules(session.difficulty).targetWindowMs,
    ).toISOString(),
  };
}

export function startTowaskiDebugLicenseTest(
  licenseSlug: TowaskiLicenseSlug = TOWASKI_BASIC_FIREARM_LICENSE_SLUG,
  nowMs = Date.now(),
): {
  session: TowaskiDebugLicenseSession;
  response: TowaskiLicenseTestResponse;
} {
  const difficulty = getTowaskiLicenseTestProgram(licenseSlug).difficulty;
  const session: TowaskiDebugLicenseSession = {
    challengeId: `towaski-debug-${nowMs}`,
    licenseSlug,
    difficulty,
    round: 0,
    startedAtMs: nowMs,
    roundStartedAtMs: nowMs,
    stats: { hostileHits: 0, civilianHits: 0, shots: 0 },
    targets: TOWASKI_LICENSE_TARGET_LAYOUTS.map((layout, index) => ({
      ...layout,
      kind: DEBUG_CIVILIAN_ROUNDS.has(index) ? "civilian" : "hostile",
    })),
  };
  return { session, response: debugActiveResponse(session) };
}

export function resolveTowaskiDebugLicenseTest(
  session: TowaskiDebugLicenseSession,
  input: TowaskiLegacyLicenseTestResolveRequest,
  nowMs = Date.now(),
): {
  session: TowaskiDebugLicenseSession;
  response: TowaskiLicenseTestResponse;
} {
  if (
    input.challengeId !== session.challengeId ||
    input.round !== session.round ||
    input.shots < 0 ||
    input.shots >
      getTowaskiLicenseTestRules(session.difficulty).maxShotsPerRound ||
    (input.hit && input.shots < 1)
  ) {
    throw new Error("DEBUG_LICENSE_STALE_ROUND");
  }

  const target = session.targets[session.round];
  if (!target) throw new Error("DEBUG_LICENSE_TARGET_MISSING");

  const stats: TowaskiLicenseTestStats = {
    hostileHits:
      session.stats.hostileHits +
      (target.kind === "hostile" && input.hit ? 1 : 0),
    civilianHits:
      session.stats.civilianHits +
      (target.kind === "civilian" && input.hit ? 1 : 0),
    shots: session.stats.shots + input.shots,
  };
  const nextSession = {
    ...session,
    round: session.round + 1,
    roundStartedAtMs: nowMs,
    stats,
  };

  if (nextSession.round < nextSession.targets.length) {
    return { session: nextSession, response: debugActiveResponse(nextSession) };
  }

  const evaluation = evaluateTowaskiBasicLicenseTest(
    {
      ...stats,
      durationMs: nowMs - session.startedAtMs,
    },
    session.difficulty,
  );
  if (!evaluation.passed) {
    return {
      session: nextSession,
      response: {
        status: "failed",
        programVersion: 1,
        mode: "firearm",
        challengeId: session.challengeId,
        licenseSlug: session.licenseSlug,
        difficulty: session.difficulty,
        stats,
        evaluation,
      },
    };
  }

  const program = getTowaskiLicenseTestProgram(session.licenseSlug);

  return {
    session: nextSession,
    response: {
      status: "granted",
      programVersion: 1,
      mode: "firearm",
      difficulty: session.difficulty,
      license: {
        slug: session.licenseSlug,
        name: program.licenseName,
        label: program.licenseLabel,
        effect: program.licenseEffect,
      },
      evaluation,
    },
  };
}

export interface TowaskiDebugLicenseV2Session {
  challengeId: string;
  licenseSlug: TowaskiLicenseSlug;
  difficulty: TowaskiLicenseTestDifficulty;
  state: TowaskiLicenseV2ChallengeState;
  stepStartedAtMs: number;
}

function debugV2ActiveResponse(
  session: TowaskiDebugLicenseV2Session,
): TowaskiLicenseTestResponse {
  const scenario = session.state.scenarios[session.state.progress.step];
  if (!scenario) throw new Error("DEBUG_LICENSE_SCENARIO_MISSING");
  return {
    status: "active",
    programVersion: session.state.programVersion,
    mode: session.state.mode,
    challengeId: session.challengeId,
    step: session.state.progress.step,
    scenario,
    licenseSlug: session.licenseSlug,
    difficulty: session.difficulty,
    progress: session.state.progress,
    stepDeadlineAt: new Date(
      session.stepStartedAtMs + getTowaskiLicenseStepWindowMs(scenario),
    ).toISOString(),
  };
}

export function startTowaskiDebugLicenseTestV2(
  licenseSlug: TowaskiLicenseSlug = TOWASKI_BASIC_FIREARM_LICENSE_SLUG,
  nowMs = Date.now(),
): {
  session: TowaskiDebugLicenseV2Session;
  response: TowaskiLicenseTestResponse;
} {
  const program = getTowaskiLicenseTestProgram(licenseSlug);
  const mode = getTowaskiLicenseModeForSlug(licenseSlug);
  const session: TowaskiDebugLicenseV2Session = {
    challengeId: `towaski-debug-v2-${nowMs}`,
    licenseSlug,
    difficulty: program.difficulty,
    state: createTowaskiLicenseV2State(mode, () => 0),
    stepStartedAtMs: nowMs,
  };
  return { session, response: debugV2ActiveResponse(session) };
}

export function resolveTowaskiDebugLicenseTestV2(
  session: TowaskiDebugLicenseV2Session,
  input: TowaskiLicenseV2ResolveRequest,
  nowMs = Date.now(),
): {
  session: TowaskiDebugLicenseV2Session;
  response: TowaskiLicenseTestResponse;
} {
  if (
    input.challengeId !== session.challengeId ||
    input.step !== session.state.progress.step ||
    input.input.mode !== session.state.mode
  ) {
    throw new Error("DEBUG_LICENSE_STALE_STEP");
  }
  const scenario = session.state.scenarios[session.state.progress.step];
  if (!scenario) throw new Error("DEBUG_LICENSE_SCENARIO_MISSING");
  if (
    !validateTowaskiLicenseV2StepTiming({
      scenario,
      input: input.input,
      elapsedMs: nowMs - session.stepStartedAtMs,
    })
  ) {
    throw new Error("DEBUG_LICENSE_TIMING_INVALID");
  }
  const result = resolveTowaskiLicenseProgramStep({
    programVersion: session.state.programVersion,
    scenario,
    input: input.input,
    progress: session.state.progress,
  });
  const state = { ...session.state, progress: result.progress };
  const nextSession = {
    ...session,
    state,
    stepStartedAtMs: nowMs,
  };
  const program = getTowaskiLicenseTestProgram(session.licenseSlug);
  const completed = isTowaskiLicenseV2Complete(state);
  const failedEarly = program.tier === "advanced" && result.safetyViolation;
  if (!completed && !failedEarly) {
    return {
      session: nextSession,
      response: debugV2ActiveResponse(nextSession),
    };
  }

  const evaluation = evaluateTowaskiLicenseProgramProgress(
    state.programVersion,
    state.progress,
  );
  if (!completed || !evaluation.passed) {
    return {
      session: nextSession,
      response: {
        status: "failed",
        programVersion: state.programVersion,
        mode: state.mode,
        challengeId: session.challengeId,
        licenseSlug: session.licenseSlug,
        difficulty: session.difficulty,
        progress: state.progress,
        evaluation,
      },
    };
  }

  return {
    session: nextSession,
    response: {
      status: "granted",
      programVersion: state.programVersion,
      mode: state.mode,
      difficulty: session.difficulty,
      license: {
        slug: session.licenseSlug,
        name: program.licenseName,
        label: program.licenseLabel,
        effect: program.licenseEffect,
      },
      evaluation,
    },
  };
}
