/**
 * 등록 일정 마감/조회 결과를 PNG 카드로 렌더링 (Puppeteer · REGISTRAR)
 *
 * 좌측 월간 캘린더, 우측 제목·일시·「이번 달 등록」·가용 집계를 반반 배치해 PNG로 출력합니다.
 *
 * @module utils/result-card-image
 */

import puppeteer from "puppeteer";
import type { Browser } from "puppeteer";
import { Png, L } from "../constants/registrar-voice.js";
import { isResultCardImageEnabled } from "../config.js";

/**
 * Puppeteer 캡처를 전역으로 직렬화한 뒤, 완료 후 최소 간격(ms)을 둡니다.
 * PNG 동시 생성으로 인한 CPU·메모리 스파이크를 줄입니다.
 */
function getPngRenderMinIntervalMs(): number {
  const v = process.env.PNG_RENDER_MIN_INTERVAL_MS?.trim();
  if (v === undefined || v === "") return 500;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 120_000) : 500;
}

let pngRenderTail: Promise<void> = Promise.resolve();

function queuePngRenderTask<T>(fn: () => Promise<T>): Promise<T> {
  const run: Promise<T> = pngRenderTail.then(() => fn());
  pngRenderTail = run
    .then(async () => {
      const ms = getPngRenderMinIntervalMs();
      if (ms > 0)
        await new Promise<void>((resolve) => setTimeout(resolve, ms));
    })
    .catch(() => {});
  return run;
}

/** 카드 전체 너비(px) — 본문 그리드가 오른쪽 명단 영역을 넓게 씀 */
const CARD_WIDTH = 900;
/** 월간 캘린더만 출력할 때 카드 너비 */
const CALENDAR_ONLY_WIDTH = 480;
const MAX_NAMES_PER_SECTION = 42;
const MAX_NAME_LEN = 52;

/** 캘린더 칸당 최대 표시(나머지는 +N, 상세는 우측 목록) */
const MAX_CALENDAR_CELL_ENTRIES = 2;
/** 칸 제목 상한 글자(초과 시 …). 화면은 `.ce-title` 2줄 클램프 */
const MAX_CAL_TITLE_IN_CELL = 96;

/** 우측 「이번 달 등록」 최대 행 수 */
const MAX_AGENDA_ITEMS = 24;
const MAX_AGENDA_TITLE_LEN = 46;

let browserPromise: Promise<Browser> | null = null;

/** 캘린더에 찍을 등록 일정 마커 (같은 달·같은 길드) */
export type CalendarSessionMark = {
  at: Date;
  title: string;
  status: "OPEN" | "CLOSED" | "CANCELED";
  /** 현재 조회/마감 대상 등록 일정 */
  isPrimary: boolean;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncateName(s: string): string {
  const t = s.trim();
  if (t.length <= MAX_NAME_LEN) return t;
  return `${t.slice(0, MAX_NAME_LEN - 1)}…`;
}

function truncateCalendarTitle(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function truncateAgendaTitle(s: string): string {
  return truncateCalendarTitle(s, MAX_AGENDA_TITLE_LEN);
}

const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];

function formatAgendaWhenLine(d: Date): string {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const wd = WEEKDAYS_KO[d.getDay()] || "";
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${m}/${day}(${wd}) ${hh}:${mm}`;
}

function buildAgendaHtml(marks: CalendarSessionMark[], anchorAt: Date): string {
  const y = anchorAt.getFullYear();
  const mo = anchorAt.getMonth();
  const inMonth = marks.filter((mk) => mk.at.getFullYear() === y && mk.at.getMonth() === mo);
  inMonth.sort((a, b) => a.at.getTime() - b.at.getTime());
  const total = inMonth.length;

  if (total === 0) {
    return `<div class="agenda"><div class="agenda-head">${escapeHtml(Png.agendaHead)}</div><p class="agenda-empty">${escapeHtml(Png.agendaEmpty)}</p></div>`;
  }

  const shown = inMonth.slice(0, MAX_AGENDA_ITEMS);
  const overflow = total - shown.length;

  const rows = shown
    .map((mk) => {
      const stLabel =
        mk.isPrimary
          ? Png.stPrimary
          : mk.status === "OPEN"
            ? Png.stOpen
            : mk.status === "CLOSED"
              ? Png.stClosed
              : Png.stCanceled;
      const badgeCls = mk.isPrimary
        ? "ag-primary"
        : mk.status === "OPEN"
          ? "ag-open"
          : mk.status === "CLOSED"
            ? "ag-closed"
            : "ag-canceled";
      const rowCls = mk.isPrimary ? "agenda-row agenda-row-primary" : "agenda-row";
      return `<div class="${rowCls}"><div class="ag-top"><span class="ag-when">${escapeHtml(formatAgendaWhenLine(mk.at))}</span><span class="ag-badge ${badgeCls}">${escapeHtml(stLabel)}</span></div><div class="ag-title">${escapeHtml(truncateAgendaTitle(mk.title))}</div></div>`;
    })
    .join("");

  const more =
    overflow > 0
      ? `<div class="agenda-more">${escapeHtml(Png.agendaMore(overflow))}</div>`
      : "";

  return `<div class="agenda"><div class="agenda-head">${escapeHtml(Png.agendaHead)}</div><div class="agenda-rows">${rows}</div>${more}</div>`;
}

function sliceNames(names: string[]): { lines: string[]; overflow: number } {
  const sorted = [...names].map(truncateName).sort((a, b) => a.localeCompare(b, "ko"));
  if (sorted.length <= MAX_NAMES_PER_SECTION) {
    return { lines: sorted, overflow: 0 };
  }
  return {
    lines: sorted.slice(0, MAX_NAMES_PER_SECTION),
    overflow: sorted.length - MAX_NAMES_PER_SECTION,
  };
}

function sectionHtml(title: string, names: string[], variant: "yes" | "no" | "pending"): string {
  const { lines, overflow } = sliceNames(names);
  const items =
    lines.length === 0
      ? `<p class="empty">${escapeHtml(Png.emptyNames)}</p>`
      : `<ul>${lines.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>`;
  const more =
    overflow > 0
      ? `<p class="more">${escapeHtml(Png.namesMore(overflow))}</p>`
      : "";
  return `<div class="section section-${variant}"><h2>${escapeHtml(title)}</h2>${items}${more}</div>`;
}

function sameLocalDay(d: Date, y: number, m: number, day: number): boolean {
  return d.getFullYear() === y && d.getMonth() === m && d.getDate() === day;
}

/**
 * anchorAt 기준 월 그리드. marks에 같은 달 등록 일정(다른 건 포함)을 모두 표시.
 */
function buildCalendarHtml(
  anchorAt: Date,
  marks: CalendarSessionMark[],
  legendMode: "full" | "simple" | "simple3" = "full",
  subLine: string = Png.subGuild
): string {
  const y = anchorAt.getFullYear();
  const m = anchorAt.getMonth();

  const first = new Date(y, m, 1);
  const lastDate = new Date(y, m + 1, 0).getDate();
  const startPad = first.getDay();

  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const cells: string[] = [];

  for (let i = 0; i < startPad; i++) {
    cells.push('<div class="cal-cell cal-empty"></div>');
  }

  const maxEntriesPerCell = MAX_CALENDAR_CELL_ENTRIES;

  for (let day = 1; day <= lastDate; day++) {
    const dayMarks = marks.filter((mk) => sameLocalDay(mk.at, y, m, day));
    dayMarks.sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.at.getTime() - b.at.getTime();
    });

    const hasPrimary = dayMarks.some((mk) => mk.isPrimary);
    const hasAny = dayMarks.length > 0;
    const shown = dayMarks.slice(0, maxEntriesPerCell);
    const moreCount = dayMarks.length - shown.length;

    const entriesInner = shown
      .map((mk) => {
        const hh = mk.at.getHours().toString().padStart(2, "0");
        const mm = mk.at.getMinutes().toString().padStart(2, "0");
        const cls = mk.isPrimary
          ? "cal-entry cal-primary"
          : mk.status === "OPEN"
            ? "cal-entry cal-open"
            : mk.status === "CLOSED"
              ? "cal-entry cal-closed"
              : "cal-entry cal-canceled";
        return `<div class="${cls}"><span class="ce-t">${escapeHtml(`${hh}:${mm}`)}</span><span class="ce-title">${escapeHtml(truncateCalendarTitle(mk.title, MAX_CAL_TITLE_IN_CELL))}</span></div>`;
      })
      .join("");

    const moreHtml =
      moreCount > 0 ? `<div class="cal-more">+${moreCount}</div>` : "";

    const cellClass = ["cal-cell", hasAny ? "cal-has-events" : "", hasPrimary ? "cal-session" : ""]
      .filter(Boolean)
      .join(" ");

    cells.push(
      `<div class="${cellClass}"><span class="cal-daynum">${day}</span><div class="cal-entries">${entriesInner}${moreHtml}</div></div>`
    );
  }

  while (cells.length % 7 !== 0) {
    cells.push('<div class="cal-cell cal-empty"></div>');
  }

  const weekRows: string[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const chunk = cells.slice(i, i + 7);
    const weekHasEvent = chunk.some((html) => html.includes("cal-has-events"));
    const weekClass = weekHasEvent ? "cal-week cal-week-busy" : "cal-week cal-week-quiet";
    weekRows.push(`<div class="${weekClass}">${chunk.join("")}</div>`);
  }

  const wdRow = weekdays
    .map((w) => `<div class="cal-wd">${escapeHtml(w)}</div>`)
    .join("");

  const legend =
    legendMode === "simple3"
      ? `
    <div class="cal-legend">
      <span><i class="lg lg-open"></i>${escapeHtml(Png.stOpen)}</span>
      <span><i class="lg lg-closed"></i>${escapeHtml(Png.stClosed)}</span>
      <span><i class="lg lg-canceled"></i>${escapeHtml(Png.stCanceled)}</span>
    </div>`
      : legendMode === "simple"
        ? `
    <div class="cal-legend">
      <span><i class="lg lg-open"></i>${escapeHtml(Png.stOpen)}</span>
      <span><i class="lg lg-closed"></i>${escapeHtml(Png.stClosed)}</span>
    </div>`
        : `
    <div class="cal-legend">
      <span><i class="lg lg-primary"></i>${escapeHtml(Png.stPrimary)}</span>
      <span><i class="lg lg-open"></i>${escapeHtml(Png.stOpen)}</span>
      <span><i class="lg lg-closed"></i>${escapeHtml(Png.stClosed)}</span>
    </div>`;

  return `
    <div class="calendar-block">
      <div class="cal-month">${escapeHtml(Png.calMonthLine(y, m + 1))} <span class="cal-sub">${escapeHtml(subLine)}</span></div>
      <div class="cal-weekdays">${wdRow}</div>
      <div class="cal-grid-wrap">
        ${weekRows.join("")}
      </div>
      ${legend}
    </div>`;
}

/** 월간 격자·범례 (전체 결과 카드·캘린더 전용 페이지 공통) */
const CSS_CALENDAR_BLOCK_STYLES = `
  .calendar-block {
    width: 100%;
    max-width: 100%;
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 8px 0 6px 0;
    background: rgba(0,0,0,0.22);
    border-radius: 8px;
    border: 1px solid #2f2f38;
  }
  .cal-grid-wrap {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .cal-week {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 3px;
    align-items: stretch;
  }
  .cal-week-quiet .cal-cell {
    min-height: 18px;
    padding: 1px 1px 2px;
  }
  .cal-week-quiet .cal-cell.cal-empty {
    min-height: 12px;
    padding: 0;
  }
  .cal-week-quiet .cal-daynum {
    font-size: 9px;
    margin-bottom: 0;
  }
  .cal-week-busy .cal-cell {
    min-height: 24px;
    padding: 2px 1px 3px;
  }
  .cal-month {
    flex-shrink: 0;
    text-align: center;
    font-size: 13px;
    font-weight: 700;
    color: #c5a059;
    margin-bottom: 6px;
    letter-spacing: 0.02em;
    line-height: 1.3;
  }
  .cal-sub {
    display: block;
    font-size: 9px;
    font-weight: 600;
    color: #8a8478;
    margin-top: 2px;
    letter-spacing: 0.04em;
  }
  .cal-weekdays {
    flex-shrink: 0;
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
    margin-bottom: 3px;
  }
  .cal-wd {
    text-align: center;
    font-size: 9px;
    font-weight: 600;
    color: #7a7788;
    padding: 2px 0;
  }
  .cal-wd:first-child { color: #b85a5a; }
  .cal-cell {
    min-height: 0;
    border-radius: 5px;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    background: #25252e;
    border: 1px solid #353542;
    font-size: 11px;
    color: #c4c0b8;
    padding: 2px 1px 3px;
  }
  .cal-empty {
    background: transparent;
    border-color: transparent;
    min-height: 14px;
  }
  .cal-has-events:not(.cal-session) {
    border-color: #4d4d5c;
    background: #232328;
  }
  .cal-session {
    background: linear-gradient(155deg, rgba(197, 160, 89, 0.42), rgba(197, 160, 89, 0.12));
    border: 2px solid #c5a059;
    box-shadow: 0 0 14px rgba(197, 160, 89, 0.22);
  }
  .cal-daynum {
    line-height: 1;
    text-align: center;
    font-size: 10px;
    font-weight: 700;
    color: #b8b4aa;
    margin-bottom: 1px;
  }
  .cal-session .cal-daynum { color: #fff8e8; }
  .cal-entries {
    display: flex;
    flex-direction: column;
    gap: 1px;
    width: 100%;
    flex: 0 0 auto;
    justify-content: flex-start;
    min-height: 0;
  }
  .cal-entry {
    font-size: 7px;
    line-height: 1.2;
    text-align: center;
    padding: 0 1px;
    word-break: break-word;
  }
  .ce-t { font-weight: 700; display: block; }
  .ce-title {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
    text-overflow: ellipsis;
    word-break: break-word;
    font-size: 6.5px;
    opacity: 0.95;
    margin-top: 1px;
    line-height: 1.2;
    text-align: center;
  }
  .cal-primary { color: #ffe9a8; font-weight: 700; }
  .cal-open { color: #8fd4a2; }
  .cal-closed { color: #a8a8b8; }
  .cal-canceled { color: #e8b888; }
  .cal-more {
    font-size: 6px;
    color: #7a7788;
    text-align: center;
    margin-top: 1px;
  }
  .cal-legend {
    flex-shrink: 0;
    display: flex;
    gap: 8px;
    justify-content: center;
    flex-wrap: wrap;
    font-size: 8px;
    color: #8a8680;
    margin-top: 5px;
    padding-top: 5px;
    border-top: 1px solid #2f2f38;
  }
  .cal-legend span { display: flex; align-items: center; gap: 4px; }
  .lg {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    display: inline-block;
    flex-shrink: 0;
  }
  .lg-primary { background: #c5a059; }
  .lg-open { background: #5a9e6e; }
  .lg-closed { background: #6a6a78; }
  .lg-canceled { background: #8a6040; }
`;

function buildCalendarOnlyHtml(
  anchorAt: Date,
  marks: CalendarSessionMark[],
  variant: "guild" | "participation" = "guild"
): string {
  const subLine =
    variant === "participation" ? Png.subPart : Png.subGuild;
  const legendMode = variant === "participation" ? "simple3" : "simple";
  const cal = buildCalendarHtml(anchorAt, marks, legendMode, subLine);
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0e0e10;
    color: #e8e6e3;
    font-family: system-ui, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif;
    padding: 8px 10px;
    width: ${CALENDAR_ONLY_WIDTH + 28}px;
  }
  .card {
    border: 2px solid #c5a059;
    border-radius: 10px;
    padding: 12px 12px 10px;
    background: linear-gradient(160deg, #1e1e24 0%, #131316 55%, #101012 100%);
    box-shadow: 0 8px 28px rgba(0,0,0,0.4);
  }
  ${CSS_CALENDAR_BLOCK_STYLES}
  body .calendar-block,
  body .cal-grid-wrap,
  body .cal-week {
    flex: none !important;
    min-height: 0 !important;
  }
</style>
</head>
<body>
  <div class="card">${cal}</div>
</body>
</html>`;
}

function buildCalendarOnlyHtmlTwoMonths(
  anchorFirst: Date,
  anchorSecond: Date,
  marks: CalendarSessionMark[],
  variant: "guild" | "participation" = "guild"
): string {
  const subLine =
    variant === "participation" ? Png.subPart : Png.subGuild;
  const legendMode = variant === "participation" ? "simple3" : "simple";
  const cal0 = buildCalendarHtml(anchorFirst, marks, legendMode, subLine);
  const cal1 = buildCalendarHtml(anchorSecond, marks, legendMode, subLine);
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0e0e10;
    color: #e8e6e3;
    font-family: system-ui, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif;
    padding: 8px 10px;
    width: ${CALENDAR_ONLY_WIDTH + 28}px;
  }
  .card {
    border: 2px solid #c5a059;
    border-radius: 10px;
    padding: 12px 12px 10px;
    background: linear-gradient(160deg, #1e1e24 0%, #131316 55%, #101012 100%);
    box-shadow: 0 8px 28px rgba(0,0,0,0.4);
  }
  .dual-cal-wrap {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  ${CSS_CALENDAR_BLOCK_STYLES}
  body .calendar-block,
  body .cal-grid-wrap,
  body .cal-week {
    flex: none !important;
    min-height: 0 !important;
  }
</style>
</head>
<body>
  <div class="card"><div class="dual-cal-wrap">${cal0}${cal1}</div></div>
</body>
</html>`;
}

function buildHtml(params: {
  title: string;
  sessionWhen: string;
  sessionAt: Date;
  calendarMarks: CalendarSessionMark[];
  cardMode: "open" | "closed";
  attending: string[];
  absent: string[];
  noResponse: string[];
}): string {
  const cal = buildCalendarHtml(params.sessionAt, params.calendarMarks);
  const agenda = buildAgendaHtml(params.calendarMarks, params.sessionAt);
  const ribbon =
    params.cardMode === "open" ? Png.ribbonOpen : Png.ribbonClosed;
  const footer =
    params.cardMode === "open" ? Png.footerOpen : Png.footerClosed;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0e0e10;
    color: #e8e6e3;
    font-family: system-ui, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif;
    padding: 8px 10px;
    width: ${CARD_WIDTH}px;
  }
  .card {
    border: 2px solid #c5a059;
    border-radius: 10px;
    padding: 12px 14px 8px;
    background: linear-gradient(160deg, #1e1e24 0%, #131316 55%, #101012 100%);
    box-shadow: 0 8px 28px rgba(0,0,0,0.4);
  }
  h1 {
    font-size: 19px;
    font-weight: 700;
    color: #f2e6c9;
    margin-bottom: 4px;
    line-height: 1.28;
    letter-spacing: -0.02em;
    text-align: center;
  }
  .ribbon {
    display: block;
    text-align: center;
    background: rgba(197, 160, 89, 0.18);
    color: #e8c97a;
    font-size: 10px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 5px;
    margin: 0 auto 6px;
    max-width: 200px;
    letter-spacing: 0.05em;
  }
  .layout-split {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 0 14px;
    align-items: stretch;
    min-width: 0;
  }
  .layout-cal {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border-right: 1px solid #3a3842;
    padding-right: 12px;
  }
  .layout-right {
    min-width: 0;
    min-height: 0;
    padding-left: 2px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .layout-right h1 {
    text-align: left;
    margin-bottom: 2px;
  }
  .layout-right .ribbon {
    margin: 0 0 4px 0;
    max-width: none;
    align-self: flex-start;
  }
  .layout-right .meta-line {
    text-align: left;
    margin-bottom: 4px;
  }
  .layout-right .agenda {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .layout-right .agenda-rows {
    flex: 1 1 auto;
    min-height: 0;
    max-height: none;
    overflow: hidden;
  }
  .layout-right .rsvp-block {
    flex-shrink: 0;
  }
  .layout-right .footer {
    flex-shrink: 0;
    margin-top: auto;
    padding-top: 8px;
    text-align: left;
  }
  .agenda {
    background: rgba(0,0,0,0.18);
    border: 1px solid #32323a;
    border-radius: 6px;
    padding: 6px 8px 6px;
    min-width: 0;
  }
  .agenda-head {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #9a8f7a;
    margin-bottom: 5px;
  }
  .agenda-empty {
    font-size: 10px;
    color: #6c6a66;
    font-style: italic;
    margin: 2px 0 0 0;
  }
  .agenda-rows {
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;
  }
  .agenda-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 10px;
    line-height: 1.25;
    padding-bottom: 5px;
    margin-bottom: 2px;
    border-bottom: 1px solid #2a2a32;
  }
  .agenda-row:last-child { border-bottom: none; padding-bottom: 0; margin-bottom: 0; }
  .agenda-row-primary {
    background: rgba(197, 160, 89, 0.08);
    margin: 0 -6px 2px;
    padding: 4px 6px 6px;
    border-radius: 4px;
    border-bottom: 1px solid rgba(197, 160, 89, 0.25);
  }
  .ag-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .ag-when {
    color: #b8a88c;
    font-weight: 600;
    white-space: nowrap;
    font-size: 9px;
    flex-shrink: 0;
  }
  .ag-title {
    color: #dcd8d0;
    word-break: break-word;
    font-size: 10px;
    min-width: 0;
  }
  .ag-badge {
    font-size: 8px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 3px;
    letter-spacing: 0.04em;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .ag-badge.ag-primary {
    background: rgba(197, 160, 89, 0.35);
    color: #fff0d0;
  }
  .ag-badge.ag-open {
    background: rgba(90, 158, 110, 0.28);
    color: #b8e8c8;
  }
  .ag-badge.ag-closed {
    background: rgba(106, 106, 120, 0.35);
    color: #c8c8d4;
  }
  .ag-badge.ag-canceled {
    background: rgba(138, 96, 64, 0.38);
    color: #e8c4a0;
  }
  .agenda-more {
    font-size: 9px;
    color: #8a8680;
    margin-top: 6px;
  }
  .rsvp-block {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .rsvp-head {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #a89870;
    margin: 0 0 2px 0;
  }
  ${CSS_CALENDAR_BLOCK_STYLES}
  .meta-line {
    text-align: center;
    font-size: 11px;
    color: #8f8b82;
    margin-bottom: 8px;
  }
  .meta-line strong { color: #a89870; }
  .lists {
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px 10px;
    align-content: start;
  }
  .section {
    min-width: 0;
  }
  .section h2 {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: #c5a059;
    margin-bottom: 4px;
    text-transform: uppercase;
  }
  .section-yes h2 { color: #7dcda0; }
  .section-no h2 { color: #d08080; }
  .section-pending h2 { color: #a8a0c0; }
  ul { list-style: none; max-height: 200px; overflow: hidden; }
  li {
    font-size: 11px;
    padding: 2px 0 2px 8px;
    margin-bottom: 1px;
    border-left: 2px solid #3d3848;
    color: #dcd8d0;
    line-height: 1.3;
  }
  .section-yes li { border-left-color: rgba(125, 205, 160, 0.45); }
  .section-no li { border-left-color: rgba(208, 128, 128, 0.45); }
  .section-pending li { border-left-color: rgba(168, 160, 192, 0.45); }
  .empty { color: #6c6a66; font-size: 10px; font-style: italic; }
  .more { color: #8a8680; font-size: 9px; margin-top: 2px; }
  .footer {
    text-align: center;
    font-size: 9px;
    color: #55535a;
    line-height: 1.35;
    padding-top: 5px;
    margin-top: 2px;
    border-top: 1px solid #2a2a32;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="layout-split">
      <div class="layout-cal">${cal}</div>
      <div class="layout-right">
        <h1>${escapeHtml(params.title)}</h1>
        <div class="ribbon">${escapeHtml(ribbon)}</div>
        <div class="meta-line"><strong>${escapeHtml(Png.metaAssign)}</strong> · ${escapeHtml(params.sessionWhen)}</div>
        ${agenda}
        <div class="rsvp-block">
          <div class="rsvp-head">${escapeHtml(Png.sectionHead)}</div>
          <div class="lists">
            ${sectionHtml(Png.colAvail, params.attending, "yes")}
            ${sectionHtml(Png.colDeny, params.absent, "no")}
            ${sectionHtml(Png.colPending, params.noResponse, "pending")}
          </div>
        </div>
        <div class="footer">${escapeHtml(footer)}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function launchBrowserWithCleanup(): Promise<Browser> {
  return puppeteer
    .launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    })
    .then((browser) => {
      browser.once("disconnected", () => {
        browserPromise = null;
      });
      return browser;
    });
}

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    try {
      const existing = await browserPromise;
      if (existing.connected) return existing;
    } catch {
      /* 이전 launch 실패 등 */
    }
    browserPromise = null;
  }
  browserPromise = launchBrowserWithCleanup();
  return browserPromise;
}

/**
 * Puppeteer 브라우저 인스턴스를 종료합니다. 프로세스 종료 시 호출 권장.
 */
export async function closeResultCardBrowser(): Promise<void> {
  if (!browserPromise) return;
  const p = browserPromise;
  browserPromise = null;
  try {
    const browser = await p;
    await browser.close();
  } catch {
    /* ignore */
  }
}

export type ResultCardDisplayInput = {
  title: string;
  sessionWhen: string;
  sessionAt: Date;
  calendarMarks: CalendarSessionMark[];
  cardMode: "open" | "closed";
  attending: string[];
  absent: string[];
  noResponse: string[];
};

/**
 * 등록 일정 결과 카드 PNG 버퍼를 생성합니다.
 */
export async function renderSessionResultCardPng(
  params: ResultCardDisplayInput
): Promise<Buffer | null> {
  if (!isResultCardImageEnabled()) return null;

  const at =
    params.sessionAt instanceof Date && !isNaN(params.sessionAt.getTime())
      ? params.sessionAt
      : new Date();
  const marks = Array.isArray(params.calendarMarks) ? params.calendarMarks : [];
  const html = buildHtml({
    ...params,
    sessionAt: at,
    calendarMarks: marks,
    cardMode: params.cardMode ?? "closed",
  });

  return queuePngRenderTask(async () => {
    let page = null;
    try {
      const browser = await getBrowser();
      page = await browser.newPage();
      await page.setViewport({
        width: CARD_WIDTH + 40,
        height: 2200,
        deviceScaleFactor: 1.25,
      });
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      await page.evaluate(
        () => new Promise<void>((resolve) => setTimeout(resolve, 0))
      );
      const cardEl = await page.$(".card");
      if (!cardEl) {
        console.error(L.pngNoCard);
        return null;
      }
      const buf = await cardEl.screenshot({ type: "png" });
      return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    } catch (err) {
      if (isPuppeteerConnectionLost(err)) browserPromise = null;
      console.error(L.pngFail, err);
      return null;
    } finally {
      if (page) await page.close().catch(() => {});
    }
  });
}

function isPuppeteerConnectionLost(err: unknown): boolean {
  const name = err instanceof Error ? err.name : "";
  const msg = String(err instanceof Error ? err.message : err);
  return (
    name === "ConnectionClosedError" ||
    name === "TargetCloseError" ||
    /connection closed|Target closed|WebSocket is not open/i.test(msg)
  );
}

export type GuildMonthCalendarInput = {
  anchorAt: Date;
  calendarMarks: CalendarSessionMark[];
  /** `participation`: `/일정 참여확인` 에페메랄(가용·이번·다음 달). 기본 `guild`는 `/일정 달력` */
  calendarVariant?: "guild" | "participation";
};

/**
 * 길드 월간 등록 일정만 담은 캘린더 격자 PNG (우측 패널 없음).
 */
export async function renderGuildMonthCalendarPng(
  params: GuildMonthCalendarInput
): Promise<Buffer | null> {
  if (!isResultCardImageEnabled()) return null;

  const at =
    params.anchorAt instanceof Date && !isNaN(params.anchorAt.getTime())
      ? params.anchorAt
      : new Date();
  const marks = Array.isArray(params.calendarMarks)
    ? params.calendarMarks
    : [];
  const variant = params.calendarVariant ?? "guild";
  const html = buildCalendarOnlyHtml(at, marks, variant);

  return queuePngRenderTask(async () => {
    let page = null;
    try {
      const browser = await getBrowser();
      page = await browser.newPage();
      await page.setViewport({
        width: CALENDAR_ONLY_WIDTH + 80,
        height: 1200,
        deviceScaleFactor: 1.25,
      });
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      await page.evaluate(
        () => new Promise<void>((resolve) => setTimeout(resolve, 0))
      );
      const cardEl = await page.$(".card");
      if (!cardEl) {
        console.error(L.pngCalNoCard);
        return null;
      }
      const buf = await cardEl.screenshot({ type: "png" });
      return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    } catch (err) {
      if (isPuppeteerConnectionLost(err)) browserPromise = null;
      console.error(L.pngCalFail, err);
      return null;
    } finally {
      if (page) await page.close().catch(() => {});
    }
  });
}

export type ParticipationTwoMonthCalendarInput = {
  anchorFirst: Date;
  anchorSecond: Date;
  calendarMarks: CalendarSessionMark[];
};

/**
 * `/일정 참여확인`용: 봇 로컬 **연속 두 달** 격자를 세로로 한 PNG에 렌더.
 */
export async function renderParticipationTwoMonthCalendarPng(
  params: ParticipationTwoMonthCalendarInput
): Promise<Buffer | null> {
  if (!isResultCardImageEnabled()) return null;

  const a0 =
    params.anchorFirst instanceof Date && !isNaN(params.anchorFirst.getTime())
      ? params.anchorFirst
      : new Date();
  const a1 =
    params.anchorSecond instanceof Date &&
    !isNaN(params.anchorSecond.getTime())
      ? params.anchorSecond
      : new Date();
  const marks = Array.isArray(params.calendarMarks)
    ? params.calendarMarks
    : [];
  const html = buildCalendarOnlyHtmlTwoMonths(a0, a1, marks, "participation");

  return queuePngRenderTask(async () => {
    let page = null;
    try {
      const browser = await getBrowser();
      page = await browser.newPage();
      await page.setViewport({
        width: CALENDAR_ONLY_WIDTH + 80,
        height: 2280,
        deviceScaleFactor: 1.25,
      });
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      await page.evaluate(
        () => new Promise<void>((resolve) => setTimeout(resolve, 0))
      );
      const cardEl = await page.$(".card");
      if (!cardEl) {
        console.error(L.pngCalNoCard);
        return null;
      }
      const buf = await cardEl.screenshot({ type: "png" });
      return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    } catch (err) {
      if (isPuppeteerConnectionLost(err)) browserPromise = null;
      console.error(L.pngCalFail, err);
      return null;
    } finally {
      if (page) await page.close().catch(() => {});
    }
  });
}
