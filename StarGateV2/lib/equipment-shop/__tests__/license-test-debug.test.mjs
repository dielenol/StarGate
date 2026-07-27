import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveTowaskiDebugLicenseTest,
  resolveTowaskiDebugLicenseTestV2,
  startTowaskiDebugLicenseTest,
  startTowaskiDebugLicenseTestV2,
  TOWASKI_BASIC_FIREARM_LICENSE_SLUG,
} from "../license-test.ts";

test("debug qualification reproduces ten hostile and two civilian targets", () => {
  const { session, response } = startTowaskiDebugLicenseTest(
    TOWASKI_BASIC_FIREARM_LICENSE_SLUG,
    1_000,
  );

  assert.equal(response.status, "active");
  assert.equal(response.difficulty, "basic");
  assert.equal(response.roundDeadlineAt, new Date(4_000).toISOString());
  assert.equal(session.targets.filter((target) => target.kind === "hostile").length, 10);
  assert.equal(session.targets.filter((target) => target.kind === "civilian").length, 2);
});

test("debug qualification grants locally after a clean run", () => {
  let { session } = startTowaskiDebugLicenseTest(
    TOWASKI_BASIC_FIREARM_LICENSE_SLUG,
    1_000,
  );
  let response;

  for (const target of [...session.targets]) {
    ({ session, response } = resolveTowaskiDebugLicenseTest(
      session,
      {
        action: "resolve",
        challengeId: session.challengeId,
        round: session.round,
        hit: target.kind === "hostile",
        shots: target.kind === "hostile" ? 1 : 0,
      },
      6_000,
    ));
  }

  assert.equal(response.status, "granted");
  assert.equal(response.evaluation.passed, true);
});

test("debug qualification grants the selected specialist license", () => {
  let { session } = startTowaskiDebugLicenseTest(
    "towaski-license-precision-firearm",
    1_000,
  );
  let response;

  for (const target of [...session.targets]) {
    ({ session, response } = resolveTowaskiDebugLicenseTest(
      session,
      {
        action: "resolve",
        challengeId: session.challengeId,
        round: session.round,
        hit: target.kind === "hostile",
        shots: target.kind === "hostile" ? 1 : 0,
      },
      6_000,
    ));
  }

  assert.equal(response.status, "granted");
  assert.equal(response.license.slug, "towaski-license-precision-firearm");
  assert.equal(response.difficulty, "standard");
});

test("debug qualification fails on a civilian hit", () => {
  let { session } = startTowaskiDebugLicenseTest(
    TOWASKI_BASIC_FIREARM_LICENSE_SLUG,
    1_000,
  );
  let response;

  for (let index = 0; index < session.targets.length; index += 1) {
    ({ session, response } = resolveTowaskiDebugLicenseTest(
      session,
      {
        action: "resolve",
        challengeId: session.challengeId,
        round: session.round,
        hit: true,
        shots: 1,
      },
      6_000,
    ));
  }

  assert.equal(response.status, "failed");
  assert.deepEqual(response.evaluation.reasons, ["civilian_hit"]);
});

test("debug qualification rejects a stale round", () => {
  const { session } = startTowaskiDebugLicenseTest(
    TOWASKI_BASIC_FIREARM_LICENSE_SLUG,
    1_000,
  );

  assert.throws(
    () =>
      resolveTowaskiDebugLicenseTest(session, {
        action: "resolve",
        challengeId: session.challengeId,
        round: 1,
        hit: true,
        shots: 1,
      }),
    /DEBUG_LICENSE_STALE_ROUND/,
  );
});

function successfulV2Input(scenario) {
  switch (scenario.mode) {
    case "firearm":
      return {
        mode: "firearm",
        ...(scenario.kind === "hostile" ? { targetId: scenario.id } : {}),
        fired: scenario.kind === "hostile",
        shots: scenario.kind === "hostile" ? 1 : 0,
      };
    case "precision":
      return {
        mode: "precision",
        aimX: scenario.target.x - scenario.wind.x,
        aimY: scenario.target.y - scenario.wind.y,
        holdMs: 600,
      };
    case "heavy": {
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
    }
    case "flame":
      return {
        mode: "flame",
        samples: scenario.hostileZones.map((zone, index) => ({
          t: index * 180,
          x: zone.x,
          y: zone.y,
          active: true,
        })),
      };
    case "sonic":
      return {
        mode: "sonic",
        frequencyHz: scenario.targetFrequencyHz,
        output: (scenario.outputBand.min + scenario.outputBand.max) / 2,
        width: (scenario.widthBand.min + scenario.widthBand.max) / 2,
        pulseMs: 900,
      };
    case "explosive":
      return {
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
      };
  }
}

function successfulV2ResolveAt(session, scenario, input) {
  const minimumElapsedMs =
    input.mode === "firearm"
      ? input.fired
        ? 120
        : 1_200
      : input.mode === "precision"
        ? input.holdMs
        : input.mode === "heavy"
          ? scenario.durationMs
          : input.mode === "flame"
            ? Math.max(1_000, input.samples.at(-1)?.t ?? 0)
            : input.mode === "sonic"
              ? input.pulseMs
              : 500;
  return session.stepStartedAtMs + minimumElapsedMs;
}

test("v2 debug sandbox uses the production judge for all six modes", () => {
  const slugs = [
    "towaski-license-basic-firearm",
    "towaski-license-precision-firearm",
    "towaski-license-heavy-weapon",
    "towaski-license-flame-weapon",
    "towaski-license-sonic-equipment",
    "towaski-license-explosive-ordnance",
  ];

  for (const licenseSlug of slugs) {
    let { session, response } = startTowaskiDebugLicenseTestV2(
      licenseSlug,
      1_000,
    );
    while (response.status === "active") {
      const input = successfulV2Input(response.scenario);
      ({ session, response } = resolveTowaskiDebugLicenseTestV2(
        session,
        {
          action: "resolve",
          challengeId: session.challengeId,
          step: session.state.progress.step,
          input,
        },
        successfulV2ResolveAt(session, response.scenario, input),
      ));
    }
    assert.equal(response.status, "granted", licenseSlug);
    assert.equal(response.programVersion, 2);
    assert.equal(response.evaluation.passed, true);
  }
});

test("advanced v2 debug safety failure ends the attempt and allows a fresh retry", () => {
  let { session, response } = startTowaskiDebugLicenseTestV2(
    "towaski-license-sonic-equipment",
    1_000,
  );
  assert.equal(response.status, "active");
  ({ session, response } = resolveTowaskiDebugLicenseTestV2(
    session,
    {
      action: "resolve",
      challengeId: session.challengeId,
      step: 0,
      input: {
        mode: "sonic",
        frequencyHz: response.scenario.targetFrequencyHz,
        output: 1,
        width: 1,
        pulseMs: 1_700,
      },
    },
    3_000,
  ));
  assert.equal(response.status, "failed");
  assert.ok(response.evaluation.reasons.includes("overload"));

  const retry = startTowaskiDebugLicenseTestV2(
    "towaski-license-sonic-equipment",
    3_000,
  );
  assert.equal(retry.response.status, "active");
  assert.notEqual(retry.session.challengeId, session.challengeId);
});
