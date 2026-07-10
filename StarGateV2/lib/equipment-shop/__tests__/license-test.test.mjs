import { test } from "node:test";
import assert from "node:assert/strict";

import {
  evaluateTowaskiBasicLicenseTest,
  parseTowaskiLicenseTestRequest,
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
  });
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
});
