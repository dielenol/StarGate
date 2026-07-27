import assert from "node:assert/strict";
import { test } from "node:test";

import { isLegacyCronJobEnabled } from "../legacy-cron.ts";

test("legacy cron ownership remains enabled when the flag is absent", () => {
  assert.equal(isLegacyCronJobEnabled(undefined), true);
});

test("legacy cron ownership can be disabled independently", () => {
  for (const value of ["0", "false", "FALSE", " off "]) {
    assert.equal(isLegacyCronJobEnabled(value), false);
  }
});

test("non-disabled values keep the legacy owner active", () => {
  for (const value of ["1", "true", "on", ""]) {
    assert.equal(isLegacyCronJobEnabled(value), true);
  }
});
