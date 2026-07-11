import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveTowaskiDebugLicenseTest,
  startTowaskiDebugLicenseTest,
} from "../license-test.ts";

test("debug qualification reproduces ten hostile and two civilian targets", () => {
  const { session, response } = startTowaskiDebugLicenseTest("basic", 1_000);

  assert.equal(response.status, "active");
  assert.equal(response.difficulty, "basic");
  assert.equal(session.targets.filter((target) => target.kind === "hostile").length, 10);
  assert.equal(session.targets.filter((target) => target.kind === "civilian").length, 2);
});

test("debug qualification grants locally after a clean run", () => {
  let { session } = startTowaskiDebugLicenseTest("basic", 1_000);
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

test("debug qualification fails on a civilian hit", () => {
  let { session } = startTowaskiDebugLicenseTest("basic", 1_000);
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
  const { session } = startTowaskiDebugLicenseTest("basic", 1_000);

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
