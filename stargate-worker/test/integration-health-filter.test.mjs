import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDesiredStateIssueFilter,
  buildIntegrationHealthOperationalAlert,
  countEffectiveDesiredStateIssues,
} from "../dist/consumers/integration-health.js";

test("desired-state health는 DELIVERY_UNKNOWN을 stale 대기 없이 즉시 장애로 센다", () => {
  const staleBefore = new Date("2026-08-22T12:00:00.000Z");
  const filter = buildDesiredStateIssueFilter(
    "team-research-all-time",
    staleBefore,
  );

  assert.equal(filter._id, "team-research-all-time");
  assert.deepEqual(filter.$or[1], {
    deliveryUnknownRevision: { $exists: true },
  });
  assert.deepEqual(filter.$or[2], {
    $expr: { $gt: ["$requestedRevision", "$syncedRevision"] },
    updatedAt: { $lte: staleBefore },
  });
});

test("DELIVERY_UNKNOWN operational alert는 즉시 CRITICAL로 분류한다", () => {
  const desired = countEffectiveDesiredStateIssues(0, 1);
  const operationalAlert = buildIntegrationHealthOperationalAlert({
    dead: 0,
    retrying: 0,
    overdue: 0,
    expiredLeases: 0,
    desired,
    deliveryUnknown: 1,
    workshopDmErrors: 0,
    workshopDmOverdue: 0,
    missingConsumers: [],
    votePublicationStalls: 0,
    latestScheduledFailures: [],
  });

  assert.equal(desired, 1);
  assert.equal(operationalAlert.severity, "CRITICAL");
  assert.equal(operationalAlert.fingerprint, "CRITICAL:DELIVERY_UNKNOWN");
  assert.equal(operationalAlert.summary, "DELIVERY_UNKNOWN 격리 1건");
});
