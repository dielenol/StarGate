import assert from "node:assert/strict";
import test from "node:test";

import {
  isDateKeyBefore,
  isValidDateKey,
  parseDateKey,
  yearMonthFromDateKey,
} from "../../lib/calendar/date-key.ts";

test("parseDateKey accepts real YYYY-MM-DD dates", () => {
  assert.deepEqual(parseDateKey("2026-02-28"), {
    year: 2026,
    month: 2,
    day: 28,
  });
  assert.deepEqual(parseDateKey("2028-02-29"), {
    year: 2028,
    month: 2,
    day: 29,
  });
});

test("parseDateKey rejects malformed or impossible dates", () => {
  assert.equal(parseDateKey("2026-2-03"), null);
  assert.equal(parseDateKey("2026-00-10"), null);
  assert.equal(parseDateKey("2026-13-10"), null);
  assert.equal(parseDateKey("2026-02-29"), null);
  assert.equal(parseDateKey("2026-04-31"), null);
});

test("yearMonthFromDateKey returns null for invalid deep-link dates", () => {
  assert.deepEqual(yearMonthFromDateKey("2026-07-08"), {
    year: 2026,
    month: 7,
  });
  assert.equal(yearMonthFromDateKey("2026-99-99"), null);
});

test("isDateKeyBefore compares only valid date keys", () => {
  assert.equal(isDateKeyBefore("2026-07-07", "2026-07-08"), true);
  assert.equal(isDateKeyBefore("2026-07-08", "2026-07-08"), false);
  assert.equal(isDateKeyBefore("2026-07-09", "2026-07-08"), false);
  assert.equal(isDateKeyBefore("2026-99-99", "2026-07-08"), false);
});

test("isValidDateKey mirrors strict parser validity", () => {
  assert.equal(isValidDateKey("2026-12-25"), true);
  assert.equal(isValidDateKey("2026-12-32"), false);
});
