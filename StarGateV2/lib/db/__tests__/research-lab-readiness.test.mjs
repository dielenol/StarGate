import assert from "node:assert/strict";
import test from "node:test";

import { isResearchLabWorkerRuntimeStatusReady } from "../../research/research-lab-readiness.ts";

const now = new Date("2026-08-10T12:00:00.000Z");

function status(overrides = {}) {
  return {
    _id: "active",
    ready: true,
    activeMutationConsumers: ["research-lab"],
    enabledOutboxKinds: ["RESEARCH_LAB_DM"],
    lastSeenAt: new Date(now.getTime() - 30_000),
    ...overrides,
  };
}

test("active worker heartbeat가 연구 consumer와 DM outbox를 준비한 경우만 mutation ready다", () => {
  assert.equal(isResearchLabWorkerRuntimeStatusReady(status(), now), true);
  assert.equal(
    isResearchLabWorkerRuntimeStatusReady(
      status({ activeMutationConsumers: [] }),
      now,
    ),
    false,
  );
  assert.equal(
    isResearchLabWorkerRuntimeStatusReady(status({ enabledOutboxKinds: [] }), now),
    false,
  );
});

test("90초보다 오래되거나 5초를 넘겨 미래인 heartbeat는 mutation을 열지 않는다", () => {
  assert.equal(
    isResearchLabWorkerRuntimeStatusReady(
      status({ lastSeenAt: new Date(now.getTime() - 90_001) }),
      now,
    ),
    false,
  );
  assert.equal(
    isResearchLabWorkerRuntimeStatusReady(
      status({ lastSeenAt: new Date(now.getTime() + 1) }),
      now,
    ),
    true,
  );
  assert.equal(
    isResearchLabWorkerRuntimeStatusReady(
      status({ lastSeenAt: new Date(now.getTime() + 5_001) }),
      now,
    ),
    false,
  );
});
