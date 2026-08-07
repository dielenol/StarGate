import assert from "node:assert/strict";
import test from "node:test";

import {
  isSessionReportVisibleToRole,
  normalizeSessionReportMinRole,
  sessionReportVisibilityFilter,
} from "../../../dist/crud/session-reports.js";

test("legacy 보고서는 U로 정규화하고 잘못된 등급은 fail-closed", () => {
  assert.equal(normalizeSessionReportMinRole(undefined), "U");
  assert.equal(normalizeSessionReportMinRole(null), "U");
  assert.equal(normalizeSessionReportMinRole("V"), "V");
  assert.equal(normalizeSessionReportMinRole("R"), null);
  assert.equal(isSessionReportVisibleToRole({}, "U"), true);
  assert.equal(isSessionReportVisibleToRole({ minRole: "R" }, "GM"), false);
});

test("V 제한 보고서는 GM과 V에게만 보인다", () => {
  const report = { minRole: "V" };
  const visible = ["GM", "V"];
  const hidden = ["A", "M", "H", "G", "J", "U"];
  for (const role of visible) {
    assert.equal(isSessionReportVisibleToRole(report, role), true, role);
  }
  for (const role of hidden) {
    assert.equal(isSessionReportVisibleToRole(report, role), false, role);
  }
});

test("Mongo visibility filter는 뷰어가 충족하는 최소 등급만 허용", () => {
  assert.deepEqual(sessionReportVisibilityFilter("A"), {
    $or: [
      { minRole: { $exists: false } },
      { minRole: null },
      { minRole: { $in: ["A", "M", "H", "G", "J", "U"] } },
    ],
  });
});
