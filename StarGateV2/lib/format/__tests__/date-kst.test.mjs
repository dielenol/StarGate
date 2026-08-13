import assert from "node:assert/strict";
import test from "node:test";

import { formatDate, formatDateTime, formatTime } from "../date.ts";

const KST_MIDNIGHT = "2026-08-12T15:00:00.000Z";

test("date formatting is fixed to KST across the UTC date boundary", () => {
  assert.equal(formatDate(KST_MIDNIGHT, "short"), "26. 08. 13.");
  assert.equal(formatDate(KST_MIDNIGHT, "long"), "2026년 8월 13일");
  assert.equal(formatDate(KST_MIDNIGHT, "numeric"), "2026. 08. 13.");
  assert.equal(formatDate(KST_MIDNIGHT, "padded"), "2026.08.13");
  assert.equal(formatDate(KST_MIDNIGHT, "compact"), "08/13");
  assert.equal(formatTime(KST_MIDNIGHT), "00:00");
});

test("date-time formatting composes the same KST date and time", () => {
  assert.equal(formatDateTime(KST_MIDNIGHT, "padded"), "2026.08.13 · 00:00");
});

test("invalid and missing inputs keep the shared placeholder", () => {
  assert.equal(formatDate("not-a-date"), "—");
  assert.equal(formatTime(null), "—");
});
