/**
 * KST(UTC+9) 기준 연·월 / 7x6 캘린더 그리드 유틸.
 *
 * KST 기준으로 "오늘"을 일관되게 산출하기 위해 UTC -> +9h 시프트 후 ISO 슬라이스.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEK_LENGTH = 7;
const CALENDAR_WEEK_ROWS = 6;
const CALENDAR_TOTAL_CELLS = WEEK_LENGTH * CALENDAR_WEEK_ROWS;

export interface KstYearMonth {
  year: number;
  /** 1-12 */
  month: number;
}

export function currentKstYearMonth(now: Date = new Date()): KstYearMonth {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return { year: kst.getUTCFullYear(), month: kst.getUTCMonth() + 1 };
}

export function currentKstDateString(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return kst.toISOString().slice(0, 10);
}

export function shiftMonth(
  ym: KstYearMonth,
  delta: number,
): KstYearMonth {
  // delta 가 큰 음수/양수에도 안전하게 normalize.
  const total = ym.year * 12 + (ym.month - 1) + delta;
  const year = Math.floor(total / 12);
  const month = (total % 12 + 12) % 12 + 1;
  return { year, month };
}

export function formatDateKey(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

export interface CalendarCell {
  /** YYYY-MM-DD */
  dateKey: string;
  /** 1-31 */
  day: number;
  /** 해당 셀이 현재 표시 월에 속하는지 (앞/뒤 채움 셀 여부) */
  inMonth: boolean;
}

/**
 * `WEEK_LENGTH x CALENDAR_WEEK_ROWS` = `CALENDAR_TOTAL_CELLS` 칸 캘린더 그리드를 만든다.
 *
 * 일요일 시작. 첫째 주는 직전 달의 마지막 일들로 채우고,
 * 마지막 주는 다음 달의 첫 일들로 채워 항상 동일 길이를 반환.
 */
export function buildCalendarGrid(year: number, month: number): CalendarCell[] {
  // month 1-12 -> JS month index 0-11
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const firstWeekday = firstOfMonth.getUTCDay(); // 0=Sun
  const lastOfMonth = new Date(Date.UTC(year, month, 0)); // 이전 달 마지막 day → 즉 month 의 마지막 day
  const daysInMonth = lastOfMonth.getUTCDate();

  const cells: CalendarCell[] = [];

  // 직전 달 꼬리
  if (firstWeekday > 0) {
    const prevMonthLast = new Date(Date.UTC(year, month - 1, 0)).getUTCDate();
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonth = month === 1 ? 12 : month - 1;
    for (let i = firstWeekday - 1; i >= 0; i -= 1) {
      const day = prevMonthLast - i;
      cells.push({
        dateKey: formatDateKey(prevYear, prevMonth, day),
        day,
        inMonth: false,
      });
    }
  }

  // 이번 달
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push({
      dateKey: formatDateKey(year, month, d),
      day: d,
      inMonth: true,
    });
  }

  // 다음 달 머리
  const remaining = CALENDAR_TOTAL_CELLS - cells.length;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  for (let d = 1; d <= remaining; d += 1) {
    cells.push({
      dateKey: formatDateKey(nextYear, nextMonth, d),
      day: d,
      inMonth: false,
    });
  }

  return cells;
}
