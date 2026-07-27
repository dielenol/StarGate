import assert from "node:assert/strict";
import test from "node:test";

import {
  createTowaskiLicenseV2State,
  evaluateTowaskiLicenseProgramProgress,
  evaluateTowaskiLicenseV2Progress,
  parseTowaskiLicenseV2StepInput,
  resolveTowaskiLicenseProgramStep,
  resolveTowaskiLicenseV2Step,
  TOWASKI_LICENSE_MAX_STEP_SAMPLES,
  validateTowaskiLicenseV2StepTiming,
} from "../license-test-v2.ts";

const MODES = [
  "firearm",
  "precision",
  "heavy",
  "flame",
  "sonic",
  "explosive",
];

function resolveAll(mode, createInput) {
  const state = createTowaskiLicenseV2State(mode, () => 0);
  let progress = state.progress;
  for (const scenario of state.scenarios) {
    progress = resolveTowaskiLicenseV2Step({
      scenario,
      input: createInput(scenario),
      progress,
    }).progress;
  }
  return evaluateTowaskiLicenseV2Progress(progress);
}

test("v2 creates a bounded, mode-specific scenario set", () => {
  const expectedCounts = {
    firearm: 12,
    precision: 6,
    heavy: 4,
    flame: 3,
    sonic: 4,
    explosive: 5,
  };

  for (const mode of MODES) {
    const state = createTowaskiLicenseV2State(mode, () => 0);
    assert.equal(state.mode, mode);
    assert.equal(state.programVersion, 2);
    assert.equal(state.scenarios.length, expectedCounts[mode]);
    assert.equal(state.progress.mode, mode);
    assert.equal(state.progress.step, 0);
    assert.ok(state.scenarios.every((scenario) => scenario.mode === mode));
  }
});

test("firearm qualification rewards threat identification and trigger discipline", () => {
  const evaluation = resolveAll("firearm", (scenario) => ({
    mode: "firearm",
    ...(scenario.kind === "hostile" ? { targetId: scenario.id } : {}),
    fired: scenario.kind === "hostile",
    shots: scenario.kind === "hostile" ? 1 : 0,
  }));

  assert.equal(evaluation.passed, true);
  assert.equal(evaluation.metrics.hostileHits, 10);
  assert.equal(evaluation.metrics.civilianHits, 0);
});

test("precision qualification computes impact from aim and server wind", () => {
  const evaluation = resolveAll("precision", (scenario) => ({
    mode: "precision",
    aimX: scenario.target.x - scenario.wind.x,
    aimY: scenario.target.y - scenario.wind.y,
    holdMs: 500,
  }));

  assert.equal(evaluation.passed, true);
  assert.equal(evaluation.metrics.score, 12);
  assert.equal(evaluation.metrics.protectedHits, 0);
});

test("heavy qualification rewards short compensated bursts without overheating", () => {
  const evaluation = resolveAll("heavy", (scenario) => {
    const samples = [];
    for (const offset of [0, 2_000]) {
      for (let index = 0; index < 8; index += 1) {
        const t = offset + index * 180;
        const ratio = t / scenario.durationMs;
        samples.push({
          t,
          x: scenario.target.x - scenario.recoil.x * ratio,
          y: scenario.target.y - scenario.recoil.y * ratio,
          active: true,
        });
      }
      samples.push({
        t: offset + 1_500,
        x: scenario.target.x,
        y: scenario.target.y,
        active: false,
      });
    }
    samples.push({
      t: scenario.durationMs,
      x: scenario.target.x,
      y: scenario.target.y,
      active: false,
    });
    return { mode: "heavy", samples };
  });

  assert.equal(evaluation.passed, true);
  assert.equal(evaluation.metrics.neutralized, 4);
  assert.equal(evaluation.metrics.overheats, 0);
});

test("flame qualification measures coverage and collateral zones", () => {
  const evaluation = resolveAll("flame", (scenario) => ({
    mode: "flame",
    samples: scenario.hostileZones.map((zone, index) => ({
      t: index * 180,
      x: zone.x,
      y: zone.y,
      active: true,
    })),
  }));

  assert.equal(evaluation.passed, true);
  assert.equal(evaluation.metrics.averageCoverage, 1);
  assert.equal(evaluation.metrics.civilianExposures, 0);
});

test("sonic qualification validates resonance, output, width, and pulse safety", () => {
  const evaluation = resolveAll("sonic", (scenario) => ({
    mode: "sonic",
    frequencyHz: scenario.targetFrequencyHz,
    output: (scenario.outputBand.min + scenario.outputBand.max) / 2,
    width: (scenario.widthBand.min + scenario.widthBand.max) / 2,
    pulseMs: 1_000,
  }));

  assert.equal(evaluation.passed, true);
  assert.equal(evaluation.metrics.successes, 4);
  assert.equal(evaluation.metrics.protectedExposures, 0);
});

test("explosive qualification recomputes blast and backblast safety", () => {
  const evaluation = resolveAll("explosive", (scenario) => ({
    mode: "explosive",
    munition: scenario.requiredMunition,
    impactX:
      scenario.hostileZones.reduce((sum, zone) => sum + zone.x, 0) /
      scenario.hostileZones.length,
    impactY:
      scenario.hostileZones.reduce((sum, zone) => sum + zone.y, 0) /
      scenario.hostileZones.length,
    fuseMs: scenario.targetFuseMs,
    launchLane: scenario.safeLaunchLane,
  }));

  assert.equal(evaluation.passed, true);
  assert.equal(evaluation.metrics.successes, 5);
  assert.equal(evaluation.metrics.civilianHits, 0);
});

test("v2 input parser rejects oversized and cross-mode payloads", () => {
  assert.equal(
    parseTowaskiLicenseV2StepInput({
      mode: "heavy",
      samples: [
        { t: 100, x: 0.5, y: 0.5, active: true },
        { t: 100, x: 0.5, y: 0.5, active: true },
      ],
    }),
    null,
  );

  assert.equal(
    parseTowaskiLicenseV2StepInput({
      mode: "heavy",
      samples: Array.from(
        { length: TOWASKI_LICENSE_MAX_STEP_SAMPLES + 1 },
        (_, index) => ({
          t: index,
          x: 0.5,
          y: 0.5,
          active: true,
        }),
      ),
    }),
    null,
  );

  const firearm = createTowaskiLicenseV2State("firearm", () => 0);
  assert.throws(
    () =>
      resolveTowaskiLicenseV2Step({
        scenario: firearm.scenarios[0],
        input: {
          mode: "precision",
          aimX: 0.5,
          aimY: 0.5,
          holdMs: 500,
        },
        progress: firearm.progress,
      }),
    /TOWASKI_LICENSE_MODE_MISMATCH/,
  );
});

test("v2 timing binds reported holds and sample horizons to server elapsed time", () => {
  const precision = createTowaskiLicenseV2State("precision", () => 0);
  assert.equal(
    validateTowaskiLicenseV2StepTiming({
      scenario: precision.scenarios[0],
      input: {
        mode: "precision",
        aimX: 0.5,
        aimY: 0.5,
        holdMs: 2_000,
      },
      elapsedMs: 600,
    }),
    false,
  );

  const heavy = createTowaskiLicenseV2State("heavy", () => 0);
  const heavyScenario = heavy.scenarios[0];
  assert.equal(
    validateTowaskiLicenseV2StepTiming({
      scenario: heavyScenario,
      input: {
        mode: "heavy",
        samples: Array.from({ length: 15 }, (_, index) => ({
          t: index * 50,
          x: heavyScenario.target.x,
          y: heavyScenario.target.y,
          active: true,
        })),
      },
      elapsedMs: 2_000,
    }),
    false,
  );

  const flame = createTowaskiLicenseV2State("flame", () => 0);
  const flameScenario = flame.scenarios[0];
  assert.equal(
    validateTowaskiLicenseV2StepTiming({
      scenario: flameScenario,
      input: {
        mode: "flame",
        samples: flameScenario.hostileZones.slice(0, 4).map((zone, index) => ({
          t: index * 50,
          x: zone.x,
          y: zone.y,
          active: true,
        })),
      },
      elapsedMs: 1_000,
    }),
    false,
  );
});

test("program judge dispatch rejects an unsupported or mismatched pinned version", () => {
  const firearm = createTowaskiLicenseV2State("firearm", () => 0);
  assert.throws(
    () =>
      resolveTowaskiLicenseProgramStep({
        programVersion: 3,
        scenario: firearm.scenarios[0],
        input: {
          mode: "firearm",
          targetId: firearm.scenarios[0].id,
          fired: true,
          shots: 1,
        },
        progress: firearm.progress,
      }),
    /UNSUPPORTED_PROGRAM_VERSION/,
  );
  assert.throws(
    () => evaluateTowaskiLicenseProgramProgress(3, firearm.progress),
    /UNSUPPORTED_PROGRAM_VERSION/,
  );
});

test("every v2 pass boundary matches the published qualification criteria", () => {
  const passingProgress = [
    {
      mode: "firearm",
      step: 12,
      hostileHits: 7,
      civilianHits: 0,
      shots: 10,
    },
    {
      mode: "precision",
      step: 6,
      score: 8,
      protectedHits: 0,
      stableShots: 6,
    },
    {
      mode: "heavy",
      step: 4,
      neutralized: 3,
      civilianHits: 0,
      overheats: 0,
    },
    {
      mode: "flame",
      step: 3,
      coverageTotal: 2.4,
      civilianExposures: 0,
      fuelTankIgnitions: 0,
      minimumFuelRemaining: 10,
    },
    {
      mode: "sonic",
      step: 4,
      successes: 3,
      protectedExposures: 0,
      overloads: 0,
      frequencyDeviationTotal: 0.2,
    },
    {
      mode: "explosive",
      step: 5,
      successes: 4,
      civilianHits: 0,
      backblastViolations: 0,
    },
  ];

  for (const progress of passingProgress) {
    assert.equal(
      evaluateTowaskiLicenseV2Progress(progress).passed,
      true,
      progress.mode,
    );
  }
});

test("safety violations fail otherwise passing mode metrics", () => {
  const violations = [
    {
      mode: "firearm",
      step: 12,
      hostileHits: 10,
      civilianHits: 1,
      shots: 11,
    },
    {
      mode: "precision",
      step: 6,
      score: 12,
      protectedHits: 1,
      stableShots: 6,
    },
    {
      mode: "heavy",
      step: 4,
      neutralized: 4,
      civilianHits: 0,
      overheats: 1,
    },
    {
      mode: "flame",
      step: 3,
      coverageTotal: 3,
      civilianExposures: 0,
      fuelTankIgnitions: 1,
      minimumFuelRemaining: 80,
    },
    {
      mode: "sonic",
      step: 4,
      successes: 4,
      protectedExposures: 1,
      overloads: 0,
      frequencyDeviationTotal: 0,
    },
    {
      mode: "explosive",
      step: 5,
      successes: 5,
      civilianHits: 0,
      backblastViolations: 1,
    },
  ];

  for (const progress of violations) {
    assert.equal(
      evaluateTowaskiLicenseV2Progress(progress).passed,
      false,
      progress.mode,
    );
  }
});

test("v2 parser rejects out-of-range coordinates and unordered samples", () => {
  assert.equal(
    parseTowaskiLicenseV2StepInput({
      mode: "precision",
      aimX: 1.01,
      aimY: 0.5,
      holdMs: 500,
    }),
    null,
  );
  assert.equal(
    parseTowaskiLicenseV2StepInput({
      mode: "flame",
      samples: [
        { t: 200, x: 0.4, y: 0.4, active: true },
        { t: 100, x: 0.5, y: 0.5, active: true },
      ],
    }),
    null,
  );
});
