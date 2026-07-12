import assert from "node:assert/strict";
import test from "node:test";

import {
  getStrategicScene,
  STRATEGIC_SCENE_INFO,
} from "../strategic-scene.ts";

test("weekday day shift uses the staffed strategic supply scene", () => {
  assert.equal(
    getStrategicScene(new Date("2026-07-13T08:00:00+09:00")),
    "staffed",
  );
  assert.equal(
    getStrategicScene(new Date("2026-07-13T19:59:59+09:00")),
    "staffed",
  );
});

test("weekday shift boundaries use the quiet scene", () => {
  assert.equal(
    getStrategicScene(new Date("2026-07-13T07:59:59+09:00")),
    "quiet",
  );
  assert.equal(
    getStrategicScene(new Date("2026-07-13T20:00:00+09:00")),
    "quiet",
  );
});

test("weekends remain quiet even during daytime", () => {
  assert.equal(
    getStrategicScene(new Date("2026-07-12T16:35:00+09:00")),
    "quiet",
  );
});

test("every scene exposes an operator-facing status label", () => {
  assert.match(STRATEGIC_SCENE_INFO.staffed.label, /주간 정비조/);
  assert.match(STRATEGIC_SCENE_INFO.quiet.label, /비가동/);
});
