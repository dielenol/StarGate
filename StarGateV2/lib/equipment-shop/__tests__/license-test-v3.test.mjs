import assert from "node:assert/strict";
import test from "node:test";

import {
  computeTowaskiHeavyImpact,
  createTowaskiLicenseV3State,
  evaluateTowaskiLicenseV3Progress,
  evaluateTowaskiFlamePlacement,
  getTowaskiExplosiveRequiredDisposition,
  getTowaskiFlameRouteCells,
  getTowaskiLicenseV3StepWindowMs,
  parseTowaskiLicenseV3StepInput,
  resolveTowaskiLicenseV3Step,
  toTowaskiLicenseV3PublicScenario,
  TOWASKI_LICENSE_PROGRAM_VERSION_V3,
  TOWASKI_LICENSE_V3_HEAVY_JITTER_MAX_X,
  TOWASKI_LICENSE_V3_HEAVY_JITTER_MAX_Y,
  TOWASKI_LICENSE_V3_PRECISION_WINDOW_MS,
  TOWASKI_LICENSE_V3_SONIC_GOOD_MS,
  TOWASKI_LICENSE_V3_SONIC_PERFECT_MS,
  validateTowaskiLicenseV3StepTiming,
} from "../license-test-v3.ts";
import {
  resolveTowaskiDebugLicenseTestV3,
  startTowaskiDebugLicenseTestV3,
} from "../license-test-v3-debug.ts";

const MODES = [
  "firearm",
  "precision",
  "heavy",
  "flame",
  "sonic",
  "explosive",
];

test("V3 pins every mode to bounded server-issued scenarios", () => {
  const expectedCounts = {
    firearm: 12,
    precision: 12,
    heavy: 12,
    flame: 3,
    sonic: 4,
    explosive: 2,
  };
  for (const mode of MODES) {
    const state = createTowaskiLicenseV3State(mode, () => 0);
    assert.equal(state.programVersion, TOWASKI_LICENSE_PROGRAM_VERSION_V3);
    assert.equal(state.scenarios.length, expectedCounts[mode]);
    assert.ok(state.scenarios.every((scenario) => scenario.mode === mode));
  }

  const precision = createTowaskiLicenseV3State("precision", () => 0);
  assert.ok(
    precision.scenarios.every(
      (scenario) =>
        scenario.visibleScale === 0.25 &&
        scenario.hitRadius === 0.0225 &&
        scenario.windowMs === TOWASKI_LICENSE_V3_PRECISION_WINDOW_MS,
    ),
  );
});

test("precision uses raw aim coordinates and passes 8/10 at 60% with zero civilians", () => {
  const state = createTowaskiLicenseV3State("precision", () => 0);
  let progress = state.progress;
  let hostileShots = 0;
  for (const scenario of state.scenarios) {
    const shouldHit = scenario.kind === "hostile" && hostileShots < 8;
    if (scenario.kind === "hostile") hostileShots += 1;
    const result = resolveTowaskiLicenseV3Step({
      scenario,
      input: {
        mode: "precision",
        fired: shouldHit,
        shots: shouldHit ? 1 : 0,
        ...(shouldHit ? { aimX: scenario.x, aimY: scenario.y } : {}),
        elapsedMs: shouldHit ? 400 : scenario.windowMs,
      },
      progress,
    });
    progress = result.progress;
  }
  const evaluation = evaluateTowaskiLicenseV3Progress(progress);
  assert.equal(evaluation.passed, true);
  assert.equal(evaluation.metrics.hostileHits, 8);
  assert.equal(evaluation.metrics.accuracy, 1);
});

test("precision hit boundary is exactly 25% of the base range radius", () => {
  const state = createTowaskiLicenseV3State("precision", () => 0);
  const scenario = state.scenarios.find((entry) => entry.kind === "hostile");
  assert.ok(scenario);
  const edgeHit = resolveTowaskiLicenseV3Step({
    scenario,
    input: {
      mode: "precision",
      fired: true,
      shots: 1,
      aimX: scenario.x + 0.0225,
      aimY: scenario.y,
      elapsedMs: 400,
    },
    progress: state.progress,
  });
  const outsideMiss = resolveTowaskiLicenseV3Step({
    scenario,
    input: {
      mode: "precision",
      fired: true,
      shots: 1,
      aimX: scenario.x + 0.02251,
      aimY: scenario.y,
      elapsedMs: 400,
    },
    progress: state.progress,
  });
  assert.equal(edgeHit.progress.hostileHits, 1);
  assert.equal(outsideMiss.progress.hostileHits, 0);
  assert.equal(scenario.hitRadius / 0.09, 0.25);
  assert.equal(scenario.windowMs, 1_125);
});

test("heavy jitter is deterministic, 80ms-keyed, interpolated, bounded, and server-recomputed", () => {
  const state = createTowaskiLicenseV3State("heavy", (max) => max - 1);
  const scenario = state.scenarios.find((entry) => entry.kind === "hostile");
  assert.ok(scenario);
  const base = { x: 0.5, y: 0.5 };
  const first = computeTowaskiHeavyImpact(scenario, base, 800);
  const replay = computeTowaskiHeavyImpact(scenario, base, 800);
  const interpolated = computeTowaskiHeavyImpact(scenario, base, 840);
  const nextKey = computeTowaskiHeavyImpact(scenario, base, 880);
  assert.deepEqual(first, replay);
  assert.notDeepEqual(first, interpolated);
  assert.notDeepEqual(interpolated, nextKey);
  assert.ok(Math.abs(first.x - base.x) <= TOWASKI_LICENSE_V3_HEAVY_JITTER_MAX_X);
  assert.ok(Math.abs(first.y - base.y) <= TOWASKI_LICENSE_V3_HEAVY_JITTER_MAX_Y);
  assert.ok(
    Math.abs(interpolated.x - base.x) <=
      TOWASKI_LICENSE_V3_HEAVY_JITTER_MAX_X,
  );
  assert.ok(
    Math.abs(interpolated.y - base.y) <=
      TOWASKI_LICENSE_V3_HEAVY_JITTER_MAX_Y,
  );

  const offset = computeTowaskiHeavyImpact(scenario, { x: 0, y: 0 }, 800);
  const result = resolveTowaskiLicenseV3Step({
    scenario,
    input: {
      mode: "heavy",
      fired: true,
      shots: 1,
      aimX: scenario.x - offset.x,
      aimY: scenario.y - offset.y,
      elapsedMs: 800,
    },
    progress: state.progress,
  });
  assert.equal(result.stepSucceeded, true);
  assert.equal(result.progress.hostileHits, 1);
});

test("heavy records blank-space shots and accepts explicit NO FIRE for civilians", () => {
  const state = createTowaskiLicenseV3State("heavy", () => 0);
  const hostile = state.scenarios.find((entry) => entry.kind === "hostile");
  const civilian = state.scenarios.find((entry) => entry.kind === "civilian");
  assert.ok(hostile);
  assert.ok(civilian);
  const misfire = resolveTowaskiLicenseV3Step({
    scenario: hostile,
    input: {
      mode: "heavy",
      fired: true,
      shots: 1,
      aimX: 1,
      aimY: 1,
      elapsedMs: 500,
    },
    progress: state.progress,
  });
  assert.equal(misfire.progress.shots, 1);
  assert.equal(misfire.progress.hostileHits, 0);
  const noFire = resolveTowaskiLicenseV3Step({
    scenario: civilian,
    input: {
      mode: "heavy",
      fired: false,
      shots: 0,
      elapsedMs: 500,
    },
    progress: state.progress,
  });
  assert.equal(noFire.stepSucceeded, true);
  assert.equal(noFire.progress.civilianHits, 0);
  assert.equal(noFire.progress.shots, 0);
});

test("sonic requires five of six target beats per stage, three stages overall, and zero protected hits", () => {
  const state = createTowaskiLicenseV3State("sonic", () => 0);
  let progress = state.progress;
  for (const scenario of state.scenarios) {
    const intervalMs = 60_000 / scenario.bpm;
    const tapsMs = scenario.beatKinds
      .map((kind, index) =>
        kind === "target" && index !== 0
          ? Math.round(scenario.beatStartMs + index * intervalMs)
          : null,
      )
      .filter((value) => value !== null);
    const result = resolveTowaskiLicenseV3Step({
      scenario,
      input: {
        mode: "sonic",
        tapsMs,
        elapsedMs: Math.ceil(
          scenario.beatStartMs +
            intervalMs * 7 +
            TOWASKI_LICENSE_V3_SONIC_GOOD_MS,
        ),
      },
      progress,
    });
    assert.equal(result.stepSucceeded, true);
    progress = result.progress;
  }
  const evaluation = evaluateTowaskiLicenseV3Progress(progress);
  assert.equal(evaluation.passed, true);
  assert.equal(evaluation.metrics.successfulStages, 4);
  assert.equal(evaluation.metrics.protectedHits, 0);

  const scenario = state.scenarios[0];
  const protectedIndex = scenario.beatKinds.indexOf("protected");
  const protectedResult = resolveTowaskiLicenseV3Step({
    scenario,
    input: {
      mode: "sonic",
      tapsMs: [
        Math.round(
          scenario.beatStartMs + protectedIndex * (60_000 / scenario.bpm),
        ),
      ],
      elapsedMs: getTowaskiLicenseV3StepWindowMs(scenario) - 1,
    },
    progress: state.progress,
  });
  assert.equal(protectedResult.safetyViolation, true);
  assert.equal(protectedResult.progress.protectedHits, 1);
  assert.equal(TOWASKI_LICENSE_V3_SONIC_PERFECT_MS, 90);
  assert.equal(TOWASKI_LICENSE_V3_SONIC_GOOD_MS, 170);
});

test("sonic judges PERFECT ±90ms and GOOD ±170ms at each inclusive boundary", () => {
  const state = createTowaskiLicenseV3State("sonic", () => 0);
  const scenario = state.scenarios[0];
  const targetIndex = scenario.beatKinds.indexOf("target");
  const beatMs =
    scenario.beatStartMs + targetIndex * (60_000 / scenario.bpm);
  for (const [offset, expectedHits] of [
    [-171, 0],
    [-170, 1],
    [-90, 1],
    [90, 1],
    [170, 1],
    [171, 0],
  ]) {
    const result = resolveTowaskiLicenseV3Step({
      scenario,
      input: {
        mode: "sonic",
        tapsMs: [Math.round(beatMs + offset)],
        elapsedMs: getTowaskiLicenseV3StepWindowMs(scenario) - 1,
      },
      progress: state.progress,
    });
    assert.equal(result.progress.targetHits, expectedHits, `offset ${offset}`);
    if (Math.abs(offset) <= 90) {
      assert.equal(result.progress.perfectHits, 1, `offset ${offset}`);
    } else if (Math.abs(offset) <= 170) {
      assert.equal(result.progress.goodHits, 1, `offset ${offset}`);
    }
  }
});

test("explosive manifests contain 3 release, 1 service, 1 quarantine and fail unsafe release immediately", () => {
  const state = createTowaskiLicenseV3State("explosive", () => 0);
  let progress = state.progress;
  for (const scenario of state.scenarios) {
    assert.deepEqual(
      Object.fromEntries(
        ["release", "service", "quarantine"].map((disposition) => [
          disposition,
          scenario.items.filter(
            (item) =>
              getTowaskiExplosiveRequiredDisposition(item) === disposition,
          ).length,
        ]),
      ),
      { release: 3, service: 1, quarantine: 1 },
    );
    const result = resolveTowaskiLicenseV3Step({
      scenario,
      input: {
        mode: "explosive",
        decisions: scenario.items.map((item) => ({
          itemId: item.id,
          disposition: getTowaskiExplosiveRequiredDisposition(item),
        })),
        elapsedMs: 1_000,
      },
      progress,
    });
    progress = result.progress;
  }
  assert.equal(evaluateTowaskiLicenseV3Progress(progress).passed, true);

  const scenario = state.scenarios[0];
  const unsafe = resolveTowaskiLicenseV3Step({
    scenario,
    input: {
      mode: "explosive",
      decisions: scenario.items.map((item) => ({
        itemId: item.id,
        disposition:
          getTowaskiExplosiveRequiredDisposition(item) === "quarantine"
            ? "release"
            : getTowaskiExplosiveRequiredDisposition(item),
      })),
      elapsedMs: 1_000,
    },
    progress: state.progress,
  });
  assert.equal(unsafe.safetyViolation, true);
  assert.equal(unsafe.progress.unsafeReleases, 1);
  assert.equal(unsafe.progress.quarantineBreaches, 1);
});

test("explosive passes one safe misclassification at 9/10", () => {
  const state = createTowaskiLicenseV3State("explosive", () => 0);
  let progress = state.progress;
  let safeMistakeUsed = false;
  for (const scenario of state.scenarios) {
    const result = resolveTowaskiLicenseV3Step({
      scenario,
      input: {
        mode: "explosive",
        decisions: scenario.items.map((item) => {
          const required = getTowaskiExplosiveRequiredDisposition(item);
          if (!safeMistakeUsed && required === "release") {
            safeMistakeUsed = true;
            return { itemId: item.id, disposition: "service" };
          }
          return { itemId: item.id, disposition: required };
        }),
        elapsedMs: 1_000,
      },
      progress,
    });
    assert.equal(result.safetyViolation, false);
    progress = result.progress;
  }
  const evaluation = evaluateTowaskiLicenseV3Progress(progress);
  assert.equal(evaluation.metrics.correctDecisions, 9);
  assert.equal(evaluation.passed, true);
});

test("explosive public scenario hides answer keys and server shuffles each manifest", () => {
  const first = createTowaskiLicenseV3State("explosive", () => 0);
  const second = createTowaskiLicenseV3State(
    "explosive",
    (maxExclusive) => maxExclusive - 1,
  );
  assert.notDeepEqual(
    first.scenarios[0].items.map((item) => item.id),
    second.scenarios[0].items.map((item) => item.id),
  );
  for (const scenario of first.scenarios) {
    const publicScenario = toTowaskiLicenseV3PublicScenario(scenario);
    assert.equal(publicScenario.mode, "explosive");
    assert.equal(
      JSON.stringify(publicScenario).includes("requiredDisposition"),
      false,
    );
    assert.ok(
      publicScenario.items.every(
        (item) =>
          item.inspection.safetyDevice &&
          item.inspection.casing &&
          item.inspection.seal &&
          item.inspection.inspectionValue,
      ),
    );
  }
});

test("flame accepts only exact three-cell cardinal routes and requires two of three safe clears", () => {
  assert.deepEqual(
    getTowaskiFlameRouteCells({ x: 0, y: 2 }, "right"),
    [{ x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }],
  );
  assert.equal(
    getTowaskiFlameRouteCells({ x: 0, y: 0 }, "left"),
    null,
  );

  const state = createTowaskiLicenseV3State("flame", () => 0);
  const routes = [
    [{ x: 0, y: 2 }, "right"],
    [{ x: 4, y: 0 }, "down"],
    [{ x: 2, y: 3 }, "right"],
  ];
  let progress = state.progress;
  for (let index = 0; index < state.scenarios.length; index += 1) {
    const [start, direction] = routes[index];
    assert.ok(
      state.scenarios[index].hostilePaths.every(
        (path) => path.cells.length === 3,
      ),
    );
    const result = resolveTowaskiLicenseV3Step({
      scenario: state.scenarios[index],
      input: { mode: "flame", start, direction, elapsedMs: 1_000 },
      progress,
    });
    assert.equal(result.stepSucceeded, true);
    progress = result.progress;
  }
  const evaluation = evaluateTowaskiLicenseV3Progress(progress);
  assert.equal(evaluation.passed, true);
  assert.equal(evaluation.metrics.successfulRoutes, 3);

  const unsafePlacement = evaluateTowaskiFlamePlacement(
    state.scenarios[0],
    { x: 0, y: 4 },
    "right",
  );
  assert.equal(unsafePlacement.retreatHit, true);
});

test("V3 parser and timing reject asserted results, out-of-range coordinates, and forged jitter time", () => {
  assert.equal(
    parseTowaskiLicenseV3StepInput({
      mode: "heavy",
      fired: true,
      shots: 1,
      aimX: 2,
      aimY: 0.5,
      elapsedMs: 500,
    }),
    null,
  );
  assert.equal(
    parseTowaskiLicenseV3StepInput({
      mode: "sonic",
      tapsMs: [500, 400],
      elapsedMs: 1_000,
    }),
    null,
  );
  const state = createTowaskiLicenseV3State("heavy", () => 0);
  assert.equal(
    validateTowaskiLicenseV3StepTiming({
      scenario: state.scenarios[0],
      input: {
        mode: "heavy",
        fired: true,
        shots: 1,
        aimX: 0.5,
        aimY: 0.5,
        elapsedMs: 2_000,
      },
      elapsedMs: 500,
    }),
    false,
  );
});

test("V3 timing accepts only the issued window plus 500ms transport tolerance", () => {
  const cases = [
    createTowaskiLicenseV3State("flame", () => 0).scenarios[0],
    createTowaskiLicenseV3State("explosive", () => 0).scenarios[0],
    createTowaskiLicenseV3State("sonic", () => 0).scenarios[0],
  ];
  for (const scenario of cases) {
    const windowMs = getTowaskiLicenseV3StepWindowMs(scenario);
    const input =
      scenario.mode === "flame"
        ? {
            mode: "flame",
            start: { x: 0, y: 2 },
            direction: "right",
            elapsedMs: windowMs,
          }
        : scenario.mode === "explosive"
          ? {
              mode: "explosive",
              decisions: scenario.items.map((item) => ({
                itemId: item.id,
                disposition: "service",
              })),
              elapsedMs: windowMs,
            }
          : {
              mode: "sonic",
              tapsMs: [],
              elapsedMs: windowMs,
            };
    assert.equal(
      validateTowaskiLicenseV3StepTiming({
        scenario,
        input,
        elapsedMs: windowMs + 500,
      }),
      true,
    );
    assert.equal(
      validateTowaskiLicenseV3StepTiming({
        scenario,
        input,
        elapsedMs: windowMs + 501,
      }),
      false,
    );
  }
});

test("debug sandbox runs the same V3 explosive evaluator without a DB grant", () => {
  let { session, response } = startTowaskiDebugLicenseTestV3(
    "towaski-license-explosive-ordnance",
    1_000,
  );
  while (response.status === "active") {
    const scenario = response.scenario;
    assert.equal(
      JSON.stringify(scenario).includes("requiredDisposition"),
      false,
    );
    assert.equal(scenario.mode, "explosive");
    ({ session, response } = resolveTowaskiDebugLicenseTestV3(session, {
      action: "resolve",
      challengeId: session.challengeId,
      step: session.state.progress.step,
      input: {
        mode: "explosive",
        decisions: scenario.items.map((item) => ({
          itemId: item.id,
          disposition: getTowaskiExplosiveRequiredDisposition(item),
        })),
        elapsedMs: 1_000,
      },
    }));
  }
  assert.equal(response.status, "granted");
  assert.equal(response.programVersion, 3);
  assert.equal(response.evaluation.metrics.correctDecisions, 10);
});
