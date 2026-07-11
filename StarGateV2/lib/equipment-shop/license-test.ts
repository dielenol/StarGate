export const TOWASKI_BASIC_FIREARM_LICENSE_SLUG =
  "towaski-license-basic-firearm" as const;

export const TOWASKI_BASIC_LICENSE_TEST_RULES = {
  hostileTargets: 10,
  civilianTargets: 2,
  requiredHostileHits: 8,
  maxCivilianHits: 0,
  minAccuracy: 0.6,
  maxShots: 24,
  maxShotsPerRound: 3,
  minDurationMs: 3_000,
  maxDurationMs: 60_000,
  minHitReactionMs: 120,
  minMissWindowMs: 700,
  maxRoundDurationMs: 5_000,
  challengeTtlMs: 120_000,
} as const;

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

export type TowaskiLicenseTestRequest =
  | { action: "start" }
  | {
      action: "resolve";
      challengeId: string;
      round: number;
      hit: boolean;
      shots: number;
    };

export type TowaskiLicenseTestResponse =
  | {
      status: "active";
      challengeId: string;
      round: number;
      target: TowaskiLicenseTarget;
      stats: TowaskiLicenseTestStats;
    }
  | {
      status: "failed";
      challengeId: string;
      stats: TowaskiLicenseTestStats;
      evaluation: TowaskiBasicLicenseTestEvaluation;
    }
  | {
      status: "granted" | "already_owned";
      license: {
        slug: string;
        name: string;
        label: string;
        effect: string;
      };
      evaluation?: TowaskiBasicLicenseTestEvaluation;
    };

export function parseTowaskiLicenseTestRequest(
  value: unknown,
): TowaskiLicenseTestRequest | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (body.action === "start") return { action: "start" };
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
): TowaskiBasicLicenseTestEvaluation {
  const rules = TOWASKI_BASIC_LICENSE_TEST_RULES;
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
  round: number;
  startedAtMs: number;
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
    challengeId: session.challengeId,
    round: session.round,
    target,
    stats: session.stats,
  };
}

export function startTowaskiDebugLicenseTest(
  nowMs = Date.now(),
): {
  session: TowaskiDebugLicenseSession;
  response: TowaskiLicenseTestResponse;
} {
  const session: TowaskiDebugLicenseSession = {
    challengeId: `towaski-debug-${nowMs}`,
    round: 0,
    startedAtMs: nowMs,
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
  input: Extract<TowaskiLicenseTestRequest, { action: "resolve" }>,
  nowMs = Date.now(),
): {
  session: TowaskiDebugLicenseSession;
  response: TowaskiLicenseTestResponse;
} {
  if (
    input.challengeId !== session.challengeId ||
    input.round !== session.round ||
    input.shots < 0 ||
    input.shots > TOWASKI_BASIC_LICENSE_TEST_RULES.maxShotsPerRound ||
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
    stats,
  };

  if (nextSession.round < nextSession.targets.length) {
    return { session: nextSession, response: debugActiveResponse(nextSession) };
  }

  const evaluation = evaluateTowaskiBasicLicenseTest({
    ...stats,
    durationMs: nowMs - session.startedAtMs,
  });
  if (!evaluation.passed) {
    return {
      session: nextSession,
      response: {
        status: "failed",
        challengeId: session.challengeId,
        stats,
        evaluation,
      },
    };
  }

  return {
    session: nextSession,
    response: {
      status: "granted",
      license: {
        slug: TOWASKI_BASIC_FIREARM_LICENSE_SLUG,
        name: "토와스키 기본 화기 라이센스",
        label: "기본 화기",
        effect: "권총·소총·산탄총 반출 자격",
      },
      evaluation,
    },
  };
}
