import assert from "node:assert/strict";
import test from "node:test";

import { parseSelectedGoogleCalendarIds } from "../../lib/google-calendar/selection.ts";

test("calendar selection allows empty input, removes duplicates, and caps at ten", () => {
  assert.deepEqual(parseSelectedGoogleCalendarIds([]), []);
  assert.deepEqual(
    parseSelectedGoogleCalendarIds(["primary", "primary", "team"]),
    ["primary", "team"],
  );
  assert.equal(
    parseSelectedGoogleCalendarIds(
      Array.from({ length: 10 }, (_, index) => `calendar-${index}`),
    ).length,
    10,
  );
  assert.throws(() =>
    parseSelectedGoogleCalendarIds(
      Array.from({ length: 11 }, (_, index) => `calendar-${index}`),
    ),
  );
});
