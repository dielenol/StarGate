import assert from "node:assert/strict";
import test from "node:test";

import { planDueAmeriDmEvents } from "../dist/consumers/ameri-dm.js";

test("밀린 AMERI DM은 같은 요청의 최신 도달 단계만 전달한다", () => {
  const now = new Date("2026-08-10T12:00:00.000Z");
  const plan = planDueAmeriDmEvents(
    [
      { id: "quoted", event: "QUOTED", availableAt: new Date("2026-08-09T10:00:00Z") },
      { id: "progress", event: "IN_PROGRESS", availableAt: new Date("2026-08-09T11:00:00Z") },
      { id: "ready", event: "READY", availableAt: new Date("2026-08-12T10:00:00Z") },
    ],
    now,
  );

  assert.deepEqual(plan.superseded.map((event) => event.id), ["quoted"]);
  assert.equal(plan.deliver?.id, "progress");
});

test("이미 처리된 AMERI DM은 밀린 단계 병합 대상에서 제외한다", () => {
  const now = new Date("2026-08-10T12:00:00.000Z");
  const plan = planDueAmeriDmEvents(
    [
      { id: "sent", event: "QUOTED", availableAt: now, sentAt: now },
      { id: "skipped", event: "IN_REVIEW", availableAt: now, skippedAt: now },
      { id: "current", event: "IN_PROGRESS", availableAt: now },
    ],
    now,
  );
  assert.deepEqual(plan.superseded, []);
  assert.equal(plan.deliver?.id, "current");
});
