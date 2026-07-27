import assert from "node:assert/strict";
import test from "node:test";

import { WorkerHealthState } from "../dist/health/state.js";

test("readyz는 Mongo, consumer, Change Stream이 모두 준비되어야 true다", () => {
  const health = new WorkerHealthState("shadow");
  health.setProcessState("RUNNING");
  health.setComponent("mongo", true);
  health.setComponent("consumers", true);
  assert.equal(health.readiness().ready, false);

  health.setComponent("changeStream", true);
  assert.equal(health.readiness().ready, true);
  assert.deepEqual(health.readiness().components, {
    mongo: true,
    consumers: true,
    changeStream: true,
  });
});
