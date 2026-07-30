import {
  getTowaskiLicenseTestProgram,
  TOWASKI_BASIC_FIREARM_LICENSE_SLUG,
  type TowaskiLicenseTestDifficulty,
  type TowaskiLicenseTestResponse,
  type TowaskiLicenseV3ResolveRequest,
} from "./license-test.ts";
import {
  createTowaskiLicenseV3State,
  evaluateTowaskiLicenseV3Progress,
  getTowaskiLicenseV3StepWindowMs,
  isTowaskiLicenseV3Complete,
  resolveTowaskiLicenseV3Step,
  toTowaskiLicenseV3PublicScenario,
  TOWASKI_LICENSE_PROGRAM_VERSION_V3,
  validateTowaskiLicenseV3StepTiming,
  type TowaskiLicenseV3ChallengeState,
} from "./license-test-v3.ts";
import type { TowaskiLicenseSlug } from "./licenses.ts";

export interface TowaskiDebugLicenseV3Session {
  challengeId: string;
  licenseSlug: TowaskiLicenseSlug;
  difficulty: TowaskiLicenseTestDifficulty;
  state: TowaskiLicenseV3ChallengeState;
  stepStartedAtMs: number;
}

function debugV3ActiveResponse(
  session: TowaskiDebugLicenseV3Session,
): TowaskiLicenseTestResponse {
  const scenario = session.state.scenarios[session.state.progress.step];
  if (!scenario) throw new Error("DEBUG_LICENSE_SCENARIO_MISSING");
  return {
    status: "active",
    programVersion: TOWASKI_LICENSE_PROGRAM_VERSION_V3,
    mode: session.state.mode,
    challengeId: session.challengeId,
    step: session.state.progress.step,
    scenario: toTowaskiLicenseV3PublicScenario(scenario),
    licenseSlug: session.licenseSlug,
    difficulty: session.difficulty,
    progress: session.state.progress,
    stepDeadlineAt: new Date(
      session.stepStartedAtMs + getTowaskiLicenseV3StepWindowMs(scenario),
    ).toISOString(),
  };
}

export function startTowaskiDebugLicenseTestV3(
  licenseSlug: TowaskiLicenseSlug = TOWASKI_BASIC_FIREARM_LICENSE_SLUG,
  nowMs = Date.now(),
): {
  session: TowaskiDebugLicenseV3Session;
  response: TowaskiLicenseTestResponse;
} {
  const program = getTowaskiLicenseTestProgram(licenseSlug);
  const session: TowaskiDebugLicenseV3Session = {
    challengeId: `towaski-debug-v3-${nowMs}`,
    licenseSlug,
    difficulty: program.difficulty,
    state: createTowaskiLicenseV3State(program.mode, () => 0),
    stepStartedAtMs: nowMs,
  };
  return { session, response: debugV3ActiveResponse(session) };
}

export function resolveTowaskiDebugLicenseTestV3(
  session: TowaskiDebugLicenseV3Session,
  input: TowaskiLicenseV3ResolveRequest,
): {
  session: TowaskiDebugLicenseV3Session;
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
    !validateTowaskiLicenseV3StepTiming({
      scenario,
      input: input.input,
      elapsedMs: input.input.elapsedMs,
    })
  ) {
    throw new Error("DEBUG_LICENSE_TIMING_INVALID");
  }
  const result = resolveTowaskiLicenseV3Step({
    scenario,
    input: input.input,
    progress: session.state.progress,
  });
  const state = { ...session.state, progress: result.progress };
  const nextSession = {
    ...session,
    state,
    stepStartedAtMs: session.stepStartedAtMs + input.input.elapsedMs,
  };
  const program = getTowaskiLicenseTestProgram(session.licenseSlug);
  const completed = isTowaskiLicenseV3Complete(state);
  if (!completed && !result.safetyViolation) {
    return {
      session: nextSession,
      response: debugV3ActiveResponse(nextSession),
    };
  }

  const evaluation = evaluateTowaskiLicenseV3Progress(state.progress);
  if (!completed || !evaluation.passed) {
    return {
      session: nextSession,
      response: {
        status: "failed",
        programVersion: TOWASKI_LICENSE_PROGRAM_VERSION_V3,
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
      programVersion: TOWASKI_LICENSE_PROGRAM_VERSION_V3,
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
