import assert from "node:assert/strict";
import test from "node:test";

import {
  getNextThemePreference,
  parseThemePreference,
} from "../../lib/theme/preference.ts";

test("parseThemePreference accepts only explicit light and dark values", () => {
  assert.equal(parseThemePreference("light"), "light");
  assert.equal(parseThemePreference("dark"), "dark");
  assert.equal(parseThemePreference("system"), null);
  assert.equal(parseThemePreference("LIGHT"), null);
  assert.equal(parseThemePreference(undefined), null);
  assert.equal(parseThemePreference(null), null);
});

test("getNextThemePreference toggles between light and dark", () => {
  assert.equal(getNextThemePreference("light"), "dark");
  assert.equal(getNextThemePreference("dark"), "light");
});
