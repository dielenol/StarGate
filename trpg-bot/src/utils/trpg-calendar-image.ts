/**
 * `/세션확인` 응답용 월간 TRPG 세션 캘린더 PNG 유틸 (Puppeteer)
 *
 * trpg_sessions 의 `TrpgSession` 모델(date + startTime + title)을 입력으로 받아
 * 7x6 그리드 PNG 를 출력한다. 단순 그리드 — 전용 Puppeteer 큐로 직렬화한다.
 *
 * @module utils/trpg-calendar-image
 */

import puppeteer from "puppeteer";

import type { Browser, Page } from "puppeteer";
import type { TrpgSession } from "@stargate/shared-db";

import { isResultCardImageEnabled } from "../config.js";

/** 한 셀에 표시할 최대 세션 — 초과 시 "+N more" */
const MAX_PER_CELL = 3;
/** Discord 원본 확대에서 날짜 칸 자체가 넓게 보이도록 가로형 레이아웃으로 렌더링한다. */
const CARD_WIDTH = 1920;
const VIEWPORT_PADDING = 24;
const DEVICE_SCALE_FACTOR = 1;
const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];

/* ── Puppeteer 직렬 큐 ──
 * 렌더는 프로세스 안에서 하나씩 실행한다. 호출부에는 큐 대기 포함 30초 뒤
 * 타임아웃을 먼저 돌려주되, 다음 렌더는 실제 작업이 끝난 뒤에만 시작해 같은
 * 브라우저에서 두 렌더가 겹치지 않게 한다. 타임아웃이 나면 멈춘 페이지를 닫고
 * 브라우저도 교체한다 — CDP 가 멈춘 브라우저는 close 조차 멈출 수 있으므로
 * 참조를 즉시 끊고, 짧은 상한 안에 닫히지 않으면 프로세스를 강제 종료해 진행 중
 * CDP 호출이 reject 되게(= 큐가 풀리게) 한다.
 */
const RENDER_TIMEOUT_MS = 30_000;
/** 버린 브라우저의 close 를 기다리는 상한 — 넘기면 SIGKILL */
const BROWSER_CLOSE_TIMEOUT_MS = 2_000;

type RenderJob = { timedOut: boolean; page: Page | null };

const noop = (): void => {};
let renderTail: Promise<void> = Promise.resolve();

function enqueue<T>(fn: (job: RenderJob) => Promise<T>): Promise<T> {
  const job: RenderJob = { timedOut: false, page: null };
  const task = renderTail.then(() => fn(job));
  renderTail = task.then(noop, noop);

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      job.timedOut = true;
      void job.page?.close().catch(noop);
      // 멈춘 브라우저를 다음 렌더가 다시 쓰지 않게 교체한다.
      discardBrowser();
      reject(new Error("trpg-calendar render timeout"));
    }, RENDER_TIMEOUT_MS);
  });
  return Promise.race([task, timeout]).finally(() => clearTimeout(timer));
}

let browserPromise: Promise<Browser> | null = null;

function launchBrowser(): Promise<Browser> {
  const launching: Promise<Browser> = puppeteer
    .launch({
      headless: true,
      // 종료 신호는 index.ts shutdown 이 처리한다. Puppeteer 기본 핸들러는 SIGINT 에서
      // process.exit(130) 을 호출해 음성 연결·DB 정리를 건너뛰게 만든다.
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    })
    .then((browser) => {
      browser.once("disconnected", () => {
        // 이미 교체된 브라우저의 늦은 disconnected 가 새 브라우저 참조를 지우지 않게 한다.
        if (browserPromise === launching) browserPromise = null;
      });
      return browser;
    });
  return launching;
}

/**
 * 현재 브라우저 참조를 즉시 버리고, 아직 살아 있으면 닫아 좀비 Chromium 이 남지 않게 한다.
 * close 가 `BROWSER_CLOSE_TIMEOUT_MS` 안에 끝나지 않으면(CDP 멈춤) 프로세스를 SIGKILL 한다.
 */
function discardBrowser(): void {
  const stale = browserPromise;
  browserPromise = null;
  if (!stale) return;
  void stale
    .then(async (browser) => {
      let closeTimer: NodeJS.Timeout | undefined;
      const closed = await Promise.race([
        browser.close().then(() => true, () => false),
        new Promise<false>((resolve) => {
          closeTimer = setTimeout(() => resolve(false), BROWSER_CLOSE_TIMEOUT_MS);
          closeTimer.unref();
        }),
      ]).finally(() => clearTimeout(closeTimer));
      if (!closed) browser.process()?.kill("SIGKILL");
    })
    .catch(noop);
}

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    try {
      const existing = await browserPromise;
      if (existing.connected) return existing;
    } catch {
      /* relaunch */
    }
    discardBrowser();
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
          `<div class="entry"><span class="t">${escapeHtml(s.startTime)}</span><span class="ti">${escapeHtml(s.title.trim())}</span></div>`,
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

export function buildTrpgCalendarHtml(params: {
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
    padding: 28px 26px 26px;
    background: #1f2029;
    border: 1px solid #2f303a;
    border-radius: 12px;
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: 16px;
    margin-bottom: 20px;
  }
  .title {
    font-size: 38px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .sub {
    font-size: 20px;
    color: #9aa0aa;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 5px;
    background: #11121a;
    padding: 5px;
    border-radius: 8px;
    border: 1px solid #2f303a;
  }
  .wd {
    min-width: 0;
    text-align: center;
    font-size: 20px;
    padding: 10px 0;
    color: #9aa0aa;
    background: #161721;
    border-radius: 4px;
  }
  .wd:nth-child(1) { color: #ff7676; }
  .wd:nth-child(7) { color: #76aaff; }
  .cell {
    min-width: 0;
    min-height: 120px;
    background: #181923;
    border-radius: 4px;
    padding: 8px;
    font-size: 20px;
    display: flex;
    flex-direction: column;
    gap: 5px;
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
    font-size: 24px;
    color: #d5d7de;
  }
  .cell.today .d {
    color: #c5d0ff;
  }
  .entries {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .entry {
    min-width: 0;
    display: flex;
    gap: 7px;
    align-items: baseline;
    background: rgba(255,255,255,0.05);
    border-radius: 3px;
    padding: 6px 9px;
    line-height: 1.35;
  }
  .entry .t {
    color: #9ec0ff;
    font-weight: 600;
    font-size: 18px;
    flex-shrink: 0;
  }
  .entry .ti {
    min-width: 0;
    color: #e5e7ee;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .more {
    color: #9aa0aa;
    font-size: 18px;
    padding-left: 8px;
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
 * 월간 TRPG 세션 캘린더 PNG 버퍼 생성.
 *
 * PNG 렌더가 비활성이거나, 실패·타임아웃이면 null 을 반환한다(reject 하지 않음).
 * 호출부는 null 이면 텍스트 임베드만으로 응답한다.
 */
export async function renderTrpgCalendarPng(
  params: RenderTrpgCalendarInput,
): Promise<Buffer | null> {
  if (!isResultCardImageEnabled()) return null;

  const html = buildTrpgCalendarHtml(params);

  return enqueue(async (job) => {
    // 큐에서 기다리는 동안 이미 타임아웃으로 돌려준 작업은 렌더하지 않는다.
    if (job.timedOut) return null;
    let page: Page | null = null;
    try {
      const browser = await getBrowser();
      page = await browser.newPage();
      job.page = page;
      if (job.timedOut) return null;
      // 캘린더 HTML 은 스크립트가 없다 — 세션 제목 등 입력값이 실행될 여지를 없앤다.
      await page.setJavaScriptEnabled(false);
      await page.setViewport({
        width: CARD_WIDTH + VIEWPORT_PADDING,
        height: 780,
        deviceScaleFactor: DEVICE_SCALE_FACTOR,
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
      // 타임아웃이 페이지를 닫아서 난 오류는 이미 호출부에 알렸다.
      if (job.timedOut) return null;
      console.error("[trpg-calendar-image] PNG 렌더 실패:", err);
      // disconnect 류 에러면 다음 호출이 relaunch 하도록 reset
      const msg = err instanceof Error ? err.message : String(err);
      if (/disconnect|closed|target closed/i.test(msg)) {
        discardBrowser();
      }
      return null;
    } finally {
      job.page = null;
      if (page) await page.close().catch(noop);
    }
  }).catch((err: unknown) => {
    console.error("[trpg-calendar-image] PNG 렌더 실패:", err);
    return null;
  });
}
