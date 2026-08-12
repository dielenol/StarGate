import assert from "node:assert/strict";
import test from "node:test";

import { WorkerHealthState } from "../dist/health/state.js";

test("readyz는 source revision과 Mongo, consumer, Change Stream 준비 상태를 노출한다", () => {
  const health = new WorkerHealthState("shadow", "source-revision-test");
  health.setProcessState("RUNNING");
  health.setComponent("mongo", true);
  health.setComponent("consumers", true);
  assert.equal(health.readiness().ready, false);

  health.setComponent("changeStream", true);
  assert.equal(health.readiness().ready, true);
  assert.equal(health.readiness().sourceRevision, "source-revision-test");
  assert.deepEqual(health.readiness().components, {
    mongo: true,
    consumers: true,
    changeStream: true,
  });
});
