/**
 * `/세션확인` 응답용 월간 TRPG 세션 캘린더 PNG 유틸 (Puppeteer)
 *
 * trpg_sessions 의 `TrpgSession` 모델(date + startTime + title)을 입력으로 받아
 * 7x6 그리드 PNG 를 출력한다. result-card-image 와 무관한 단순 그리드 — 별도
 * Puppeteer 큐로 직렬화한다.
 *
 * @module utils/trpg-calendar-image
 */

import puppeteer from "puppeteer";

import type { Browser } from "puppeteer";
import type { TrpgSession } from "@stargate/shared-db";

import { isResultCardImageEnabled } from "../config.js";

/** 한 셀에 표시할 최대 세션 — 초과 시 "+N more" */
const MAX_PER_CELL = 3;
const CARD_WIDTH = 760;
/** 셀 제목 길이 한도 (초과 시 …) */
const MAX_TITLE_LEN = 14;
const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];

/* ── Puppeteer 직렬 큐 ──
 * 단일 페이지 hang/네트워크 wait 등이 큐 전체를 막지 못하도록 30s 타임아웃 가드.
 * 타임아웃 시 reject 만 발생하며, getBrowser 측에서 disconnect 류 에러 발생 시
 * 다음 호출이 relaunch 하도록 이미 처리되어 있다.
 */
const RENDER_TIMEOUT_MS = 30_000;
let renderTail: Promise<void> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const wrapped = (): Promise<T> =>
    Promise.race([
      fn(),
      new Promise<T>((_, reject) => {
        setTimeout(
          () => reject(new Error("trpg-calendar render timeout")),
          RENDER_TIMEOUT_MS,
        );
      }),
    ]);
  const run: Promise<T> = renderTail.then(wrapped);
  renderTail = run.then(() => undefined).catch(() => undefined);
  return run;
}

let browserPromise: Promise<Browser> | null = null;
function launchBrowser(): Promise<Browser> {
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
      /* relaunch */
    }
    browserPromise = null;
  }
  browserPromise = launchBrowser();
  return browserPromise;
}

/** 프로세스 종료 시 호출 */
export async function closeTrpgCalendarBrowser(): Promise<void> {
  if (!browserPromise) return;
  const p = browserPromise;
  browserPromise = null;
  try {
    const b = await p;
    await b.close();
  } catch {
    /* ignore */
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncateTitle(s: string): string {
  const t = s.trim();
  if (t.length <= MAX_TITLE_LEN) return t;
  return `${t.slice(0, MAX_TITLE_LEN - 1)}…`;
}

function sessionsByDay(
  sessions: TrpgSession[],
): Map<number, TrpgSession[]> {
  const m = new Map<number, TrpgSession[]>();
  for (const s of sessions) {
    // date 는 "YYYY-MM-DD"
    const day = Number(s.date.slice(8, 10));
    if (!Number.isFinite(day)) continue;
    const list = m.get(day) ?? [];
    list.push(s);
    m.set(day, list);
  }
  // 각 날짜는 startTime 오름차순
  for (const list of m.values()) {
    list.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }
  return m;
}

function buildCalendarCells(
  year: number,
  month: number,
  sessions: TrpgSession[],
  todayDay: number | null,
): string {
  // month 1-12. JS Date 는 0-11.
  const first = new Date(year, month - 1, 1);
  const lastDate = new Date(year, month, 0).getDate();
  const startPad = first.getDay();
  const byDay = sessionsByDay(sessions);

  const cells: string[] = [];
  for (let i = 0; i < startPad; i++) {
    cells.push('<div class="cell empty"></div>');
  }

  for (let day = 1; day <= lastDate; day++) {
    const dayList = byDay.get(day) ?? [];
    const shown = dayList.slice(0, MAX_PER_CELL);
    const overflow = dayList.length - shown.length;

    const entries = shown
      .map(
        (s) =>
          `<div class="entry"><span class="t">${escapeHtml(s.startTime)}</span><span class="ti">${escapeHtml(truncateTitle(s.title))}</span></div>`,
      )
      .join("");
    const more =
      overflow > 0 ? `<div class="more">+${overflow} more</div>` : "";

    const isToday = todayDay === day;
    const hasAny = dayList.length > 0;
    const cls = [
      "cell",
      hasAny ? "has" : "",
      isToday ? "today" : "",
    ]
      .filter(Boolean)
      .join(" ");

    cells.push(
      `<div class="${cls}"><div class="d">${day}</div><div class="entries">${entries}${more}</div></div>`,
    );
  }

  while (cells.length % 7 !== 0) {
    cells.push('<div class="cell empty"></div>');
  }
  return cells.join("");
}

function buildHtml(params: {
  year: number;
  month: number;
  sessions: TrpgSession[];
  todayDay: number | null;
}): string {
  const wd = WEEKDAYS_KO.map((d) => `<div class="wd">${d}</div>`).join("");
  const cells = buildCalendarCells(
    params.year,
    params.month,
    params.sessions,
    params.todayDay,
  );

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>TRPG 캘린더</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #1a1b22;
    color: #e8e9ee;
    font-family: -apple-system, "Apple SD Gothic Neo", "Noto Sans KR",
      "Malgun Gothic", system-ui, sans-serif;
  }
  .card {
    width: ${CARD_WIDTH}px;
    padding: 20px 18px 18px 18px;
    background: #1f2029;
    border: 1px solid #2f303a;
    border-radius: 14px;
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 12px;
  }
  .title {
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .sub {
    font-size: 12px;
    color: #9aa0aa;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
    background: #11121a;
    padding: 4px;
    border-radius: 8px;
    border: 1px solid #2f303a;
  }
  .wd {
    text-align: center;
    font-size: 12px;
    padding: 6px 0;
    color: #9aa0aa;
    background: #161721;
    border-radius: 4px;
  }
  .wd:nth-child(1) { color: #ff7676; }
  .wd:nth-child(7) { color: #76aaff; }
  .cell {
    min-height: 86px;
    background: #181923;
    border-radius: 4px;
    padding: 4px 5px;
    font-size: 11px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .cell.empty {
    background: #131420;
  }
  .cell.has {
    background: #232636;
    border: 1px solid #3a3f55;
  }
  .cell.today {
    background: #2d3553;
    border: 1px solid #5a6fb5;
  }
  .d {
    font-weight: 600;
    font-size: 12px;
    color: #d5d7de;
  }
  .cell.today .d {
    color: #c5d0ff;
  }
  .entries {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .entry {
    display: flex;
    gap: 4px;
    align-items: baseline;
    background: rgba(255,255,255,0.05);
    border-radius: 3px;
    padding: 2px 4px;
    line-height: 1.2;
  }
  .entry .t {
    color: #9ec0ff;
    font-weight: 600;
    font-size: 10px;
    flex-shrink: 0;
  }
  .entry .ti {
    color: #e5e7ee;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .more {
    color: #9aa0aa;
    font-size: 10px;
    padding-left: 4px;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="head">
      <span class="title">${params.year}년 ${params.month}월 TRPG 세션</span>
      <span class="sub">한국 시각 기준</span>
    </div>
    <div class="grid">
      ${wd}
      ${cells}
    </div>
  </div>
</body>
</html>`;
}

export type RenderTrpgCalendarInput = {
  year: number;
  /** 1-12 */
  month: number;
  sessions: TrpgSession[];
  /** 오늘 강조용 day-of-month (해당 월에 한해서). 없으면 강조 없음. */
  todayDay: number | null;
};

/**
 * 월간 TRPG 세션 캘린더 PNG 버퍼 생성. PNG 렌더 비활성 환경이면 null.
 */
export async function renderTrpgCalendarPng(
  params: RenderTrpgCalendarInput,
): Promise<Buffer | null> {
  if (!isResultCardImageEnabled()) return null;

  const html = buildHtml(params);

  return enqueue(async () => {
    let page = null;
    try {
      const browser = await getBrowser();
      page = await browser.newPage();
      await page.setViewport({
        width: CARD_WIDTH + 40,
        height: 900,
        deviceScaleFactor: 1.5,
      });
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      const cardEl = await page.$(".card");
      if (!cardEl) {
        console.error("[trpg-calendar-image] .card 요소를 찾을 수 없음");
        return null;
      }
      const buf = await cardEl.screenshot({ type: "png" });
      return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    } catch (err) {
      console.error("[trpg-calendar-image] PNG 렌더 실패:", err);
      // disconnect 류 에러면 다음 호출이 relaunch 하도록 reset
      const msg = err instanceof Error ? err.message : String(err);
      if (/disconnect|closed|target closed/i.test(msg)) {
        browserPromise = null;
      }
      return null;
    } finally {
      if (page) await page.close().catch(() => {});
    }
  });
}
