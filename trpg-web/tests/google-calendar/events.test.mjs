import assert from "node:assert/strict";
import test from "node:test";

import {
  getGoogleCalendarVisibleRange,
  normalizeGoogleCalendarEvents,
  sanitizeGoogleCalendarColor,
} from "../../lib/google-calendar/events.ts";

const AUGUST_RANGE = getGoogleCalendarVisibleRange(2026, 8);

test("visible range covers the complete six-week KST calendar grid", () => {
  assert.deepEqual(AUGUST_RANGE, {
    firstDate: "2026-07-26",
    lastDateExclusive: "2026-09-06",
    timeMin: "2026-07-25T15:00:00.000Z",
    timeMax: "2026-09-05T15:00:00.000Z",
  });
});

test("timed events are normalized to KST title and time only", () => {
  const [event] = normalizeGoogleCalendarEvents(
    [
      {
        id: "event-1",
        summary: "개인 약속",
        htmlLink: "https://www.google.com/calendar/event?eid=safe",
        start: { dateTime: "2026-08-10T11:00:00Z" },
        end: { dateTime: "2026-08-10T14:00:00Z" },
      },
    ],
    "private@example.com",
    "#123abc",
    AUGUST_RANGE,
  );

  assert.equal(event.date, "2026-08-10");
  assert.equal(event.title, "개인 약속");
  assert.equal(event.timeLabel, "20:00–23:00");
  assert.equal(event.color, "#123abc");
  assert.equal(event.htmlLink?.startsWith("https://www.google.com/"), true);
  assert.equal(JSON.stringify(event).includes("private@example.com"), false);
});

test("all-day and multi-day events expand into per-date display slices", () => {
  const events = normalizeGoogleCalendarEvents(
    [
      {
        id: "all-day",
        summary: "휴가",
        start: { date: "2026-08-03" },
        end: { date: "2026-08-05" },
      },
      {
        id: "overnight",
        summary: "야간 일정",
        start: { dateTime: "2026-08-10T14:00:00Z" },
        end: { dateTime: "2026-08-11T16:00:00Z" },
      },
    ],
    "primary",
    "#4285f4",
    AUGUST_RANGE,
  );

  assert.deepEqual(
    events.filter((event) => event.title === "휴가").map((event) => [
      event.date,
      event.timeLabel,
    ]),
    [
      ["2026-08-03", "종일"],
      ["2026-08-04", "종일"],
    ],
  );
  assert.deepEqual(
    events.filter((event) => event.title === "야간 일정").map((event) => [
      event.date,
      event.timeLabel,
    ]),
    [
      ["2026-08-10", "23:00–계속"],
      ["2026-08-11", "계속"],
      ["2026-08-12", "계속–01:00"],
    ],
  );
});

test("midnight boundaries stay on the occupied day and unsafe data is dropped", () => {
  const events = normalizeGoogleCalendarEvents(
    [
      {
        id: "midnight",
        start: { dateTime: "2026-08-10T11:00:00Z" },
        end: { dateTime: "2026-08-10T15:00:00Z" },
        htmlLink: "javascript:alert(1)",
      },
      {
        id: "cancelled",
        status: "cancelled",
        summary: "취소됨",
        start: { date: "2026-08-10" },
        end: { date: "2026-08-11" },
      },
    ],
    "primary",
    "invalid-color",
    AUGUST_RANGE,
  );

  assert.equal(events.length, 1);
  assert.equal(events[0].date, "2026-08-10");
  assert.equal(events[0].title, "제목 없는 일정");
  assert.equal(events[0].timeLabel, "20:00–24:00");
  assert.equal(events[0].htmlLink, null);
  assert.equal(events[0].color, "#4285f4");
  assert.equal(sanitizeGoogleCalendarColor("#ABCDEF"), "#ABCDEF");
});
