import { test } from "node:test";
import assert from "node:assert/strict";

import {
  evaluateTowaskiBasicLicenseTest,
  parseTowaskiLicenseTestRequest,
  TOWASKI_LICENSE_TEST_DIFFICULTIES,
} from "../license-test.ts";

test("passes a clean basic firearm qualification result", () => {
  const result = evaluateTowaskiBasicLicenseTest({
    hostileHits: 8,
    civilianHits: 0,
    shots: 10,
    durationMs: 9_800,
  });

  assert.equal(result.valid, true);
  assert.equal(result.passed, true);
  assert.equal(result.accuracy, 0.8);
});

test("basic difficulty accepts an introductory four-hit result", () => {
  const basic = evaluateTowaskiBasicLicenseTest(
    {
      hostileHits: 4,
      civilianHits: 0,
      shots: 10,
      durationMs: 12_000,
    },
    "basic",
  );
  const standard = evaluateTowaskiBasicLicenseTest(
    {
      hostileHits: 4,
      civilianHits: 0,
      shots: 10,
      durationMs: 12_000,
    },
    "standard",
  );

  assert.equal(basic.passed, true);
  assert.equal(standard.passed, false);
});

test("expert difficulty requires all hostile targets and eighty percent accuracy", () => {
  const result = evaluateTowaskiBasicLicenseTest(
    {
      hostileHits: 9,
      civilianHits: 0,
      shots: 10,
      durationMs: 8_000,
    },
    "expert",
  );

  assert.equal(result.passed, false);
  assert.deepEqual(result.reasons, ["hostile_hits"]);
});

test("every difficulty reserves five seconds of network grace per round", () => {
  for (const rules of Object.values(TOWASKI_LICENSE_TEST_DIFFICULTIES)) {
    assert.ok(rules.maxRoundDurationMs >= rules.targetWindowMs + 5_000);
  }
});

test("fails when a civilian target is hit", () => {
  const result = evaluateTowaskiBasicLicenseTest({
    hostileHits: 10,
    civilianHits: 1,
    shots: 11,
    durationMs: 10_200,
  });

  assert.equal(result.valid, true);
  assert.equal(result.passed, false);
  assert.deepEqual(result.reasons, ["civilian_hit"]);
});

test("fails when accuracy is below sixty percent", () => {
  const result = evaluateTowaskiBasicLicenseTest({
    hostileHits: 8,
    civilianHits: 0,
    shots: 14,
    durationMs: 12_000,
  });

  assert.equal(result.valid, true);
  assert.equal(result.passed, false);
  assert.deepEqual(result.reasons, ["accuracy"]);
});

test("rejects impossible or abbreviated submissions", () => {
  assert.equal(
    evaluateTowaskiBasicLicenseTest({
      hostileHits: 10,
      civilianHits: 0,
      shots: 5,
      durationMs: 100,
    }).valid,
    false,
  );
});

test("requires a server-issued challenge protocol instead of final client scores", () => {
  assert.equal(
    parseTowaskiLicenseTestRequest({
      hostileHits: 10,
      civilianHits: 0,
      shots: 10,
      durationMs: 10_000,
    }),
    null,
  );
  assert.deepEqual(parseTowaskiLicenseTestRequest({ action: "start" }), {
    action: "start",
    difficulty: "basic",
  });
  assert.deepEqual(
    parseTowaskiLicenseTestRequest({
      action: "start",
      difficulty: "expert",
    }),
    {
      action: "start",
      difficulty: "expert",
    },
  );
  assert.equal(
    parseTowaskiLicenseTestRequest({
      action: "start",
      difficulty: "impossible",
    }),
    null,
  );
});

test("accepts only bounded round resolution events", () => {
  assert.deepEqual(
    parseTowaskiLicenseTestRequest({
      action: "resolve",
      challengeId: "challenge-id",
      round: 4,
      hit: true,
      shots: 1,
    }),
    {
      action: "resolve",
      challengeId: "challenge-id",
      round: 4,
      hit: true,
      shots: 1,
    },
  );
  assert.equal(
    parseTowaskiLicenseTestRequest({
      action: "resolve",
      challengeId: "challenge-id",
      round: 12,
      hit: false,
      shots: 0,
    }),
    null,
  );
  assert.deepEqual(
    parseTowaskiLicenseTestRequest({
      action: "resolve",
      challengeId: "challenge-id",
      round: 4,
      hit: true,
      shots: 1,
      difficulty: "basic",
    }),
    {
      action: "resolve",
      challengeId: "challenge-id",
      round: 4,
      hit: true,
      shots: 1,
    },
  );
});
