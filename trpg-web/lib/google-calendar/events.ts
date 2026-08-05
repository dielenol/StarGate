import { createHash } from "node:crypto";

import type { GoogleCalendarEventView } from "./types";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const CALENDAR_GRID_DAYS = 42;
const GOOGLE_COLOR_RE = /^#[0-9a-f]{6}$/i;
const SAFE_GOOGLE_LINK_HOSTS = new Set([
  "calendar.google.com",
  "www.google.com",
]);

export interface GoogleCalendarVisibleRange {
  firstDate: string;
  lastDateExclusive: string;
  timeMin: string;
  timeMax: string;
}

export interface GoogleCalendarRawEventDateTime {
  date?: string;
  dateTime?: string;
}

export interface GoogleCalendarRawEvent {
  id?: string;
  status?: string;
  summary?: string;
  htmlLink?: string;
  start?: GoogleCalendarRawEventDateTime;
  end?: GoogleCalendarRawEventDateTime;
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dateKeyToUtcMs(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function dateKeyToKstInstant(dateKey: string): string {
  return new Date(dateKeyToUtcMs(dateKey) - KST_OFFSET_MS).toISOString();
}

function addDateKeyDays(dateKey: string, days: number): string {
  return formatUtcDate(new Date(dateKeyToUtcMs(dateKey) + days * DAY_MS));
}

function maxDateKey(a: string, b: string): string {
  return a > b ? a : b;
}

function minDateKey(a: string, b: string): string {
  return a < b ? a : b;
}

function toKstDateKey(timestampMs: number): string {
  return new Date(timestampMs + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function toKstTime(timestampMs: number): string {
  return new Date(timestampMs + KST_OFFSET_MS).toISOString().slice(11, 16);
}

function safeGoogleHtmlLink(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !SAFE_GOOGLE_LINK_HOSTS.has(url.hostname)) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function sanitizeGoogleCalendarColor(value: string | undefined): string {
  return value && GOOGLE_COLOR_RE.test(value) ? value : "#4285f4";
}

export function getGoogleCalendarVisibleRange(
  year: number,
  month: number,
): GoogleCalendarVisibleRange {
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const firstGridDate = new Date(
    firstOfMonth.getTime() - firstOfMonth.getUTCDay() * DAY_MS,
  );
  const lastGridDateExclusive = new Date(
    firstGridDate.getTime() + CALENDAR_GRID_DAYS * DAY_MS,
  );
  const firstDate = formatUtcDate(firstGridDate);
  const lastDateExclusive = formatUtcDate(lastGridDateExclusive);
  return {
    firstDate,
    lastDateExclusive,
    timeMin: dateKeyToKstInstant(firstDate),
    timeMax: dateKeyToKstInstant(lastDateExclusive),
  };
}

function eventSliceId(
  calendarId: string,
  eventId: string,
  dateKey: string,
): string {
  return createHash("sha256")
    .update(`${calendarId}\0${eventId}\0${dateKey}`)
    .digest("base64url")
    .slice(0, 24);
}

function normalizeAllDayEvent(
  raw: GoogleCalendarRawEvent,
  calendarId: string,
  color: string,
  range: GoogleCalendarVisibleRange,
): GoogleCalendarEventView[] {
  const startDate = raw.start?.date;
  const endDateExclusive = raw.end?.date;
  if (!startDate || !endDateExclusive || startDate >= endDateExclusive) {
    return [];
  }

  const firstDate = maxDateKey(startDate, range.firstDate);
  const lastDateExclusive = minDateKey(
    endDateExclusive,
    range.lastDateExclusive,
  );
  if (firstDate >= lastDateExclusive) return [];

  const title = raw.summary?.trim() || "제목 없는 일정";
  const htmlLink = safeGoogleHtmlLink(raw.htmlLink);
  const eventId = raw.id ?? `${startDate}:${title}`;
  const slices: GoogleCalendarEventView[] = [];
  for (
    let date = firstDate;
    date < lastDateExclusive;
    date = addDateKeyDays(date, 1)
  ) {
    slices.push({
      id: eventSliceId(calendarId, eventId, date),
      date,
      title,
      timeLabel: "종일",
      sortKey: "0:0000",
      allDay: true,
      color,
      htmlLink,
    });
  }
  return slices;
}

function normalizeTimedEvent(
  raw: GoogleCalendarRawEvent,
  calendarId: string,
  color: string,
  range: GoogleCalendarVisibleRange,
): GoogleCalendarEventView[] {
  const startMs = Date.parse(raw.start?.dateTime ?? "");
  const endMs = Date.parse(raw.end?.dateTime ?? "");
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return [];
  }

  const eventStartDate = toKstDateKey(startMs);
  const eventLastDate = toKstDateKey(endMs - 1);
  const rangeLastDate = addDateKeyDays(range.lastDateExclusive, -1);
  const firstDate = maxDateKey(eventStartDate, range.firstDate);
  const lastDate = minDateKey(eventLastDate, rangeLastDate);
  if (firstDate > lastDate) return [];

  const title = raw.summary?.trim() || "제목 없는 일정";
  const htmlLink = safeGoogleHtmlLink(raw.htmlLink);
  const eventId = raw.id ?? `${raw.start?.dateTime}:${title}`;
  const startTime = toKstTime(startMs);
  const rawEndTime = toKstTime(endMs);
  const endDateAtBoundary = toKstDateKey(endMs);
  const endTime =
    rawEndTime === "00:00" && endDateAtBoundary > eventLastDate
      ? "24:00"
      : rawEndTime;
  const slices: GoogleCalendarEventView[] = [];

  for (
    let date = firstDate;
    date <= lastDate;
    date = addDateKeyDays(date, 1)
  ) {
    let timeLabel: string;
    if (eventStartDate === eventLastDate) {
      timeLabel = `${startTime}–${endTime}`;
    } else if (date === eventStartDate) {
      timeLabel = `${startTime}–계속`;
    } else if (date === eventLastDate) {
      timeLabel = `계속–${endTime}`;
    } else {
      timeLabel = "계속";
    }

    slices.push({
      id: eventSliceId(calendarId, eventId, date),
      date,
      title,
      timeLabel,
      sortKey: date === eventStartDate ? `1:${startTime}` : "1:0000",
      allDay: false,
      color,
      htmlLink,
    });
  }
  return slices;
}

export function normalizeGoogleCalendarEvents(
  rawEvents: GoogleCalendarRawEvent[],
  calendarId: string,
  calendarColor: string | undefined,
  range: GoogleCalendarVisibleRange,
): GoogleCalendarEventView[] {
  const color = sanitizeGoogleCalendarColor(calendarColor);
  const slices: GoogleCalendarEventView[] = [];
  for (const raw of rawEvents) {
    if (raw.status === "cancelled") continue;
    if (raw.start?.date && raw.end?.date) {
      slices.push(
        ...normalizeAllDayEvent(raw, calendarId, color, range),
      );
      continue;
    }
    slices.push(...normalizeTimedEvent(raw, calendarId, color, range));
  }
  return slices.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.sortKey.localeCompare(b.sortKey) ||
      a.title.localeCompare(b.title, "ko"),
  );
}
