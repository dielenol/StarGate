/**
 * KST(UTC+9) 환산 유틸
 *
 * - `toKstDate`: UTC Date → KST 로 9시간 더한 가상의 Date.
 *   `getUTC*` 메서드로 KST 연/월/일/시 추출 시 사용한다.
 * - `nowKstYmd`: 현재 시각 기준 KST 연/월/일을 추출.
 * - `kstDateKey`: KST 연/월/일 → `YYYY-MM-DD` 문자열.
 * - `kstDateTimeToUnix`: 세션의 KST `date` + `startTime` → UTC epoch 초.
 *
 * NOTE: shared-db 측에는 자체 KST 헬퍼가 있으므로 영역 분리. 본 모듈은
 * trpg-bot 내부 호출처(`/세션확인`, DM 메시지, 캘린더 PNG 렌더 등)에서만 사용한다.
 *
 * @module utils/kst
 */

/** KST = UTC + 9h */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 입력 Date 의 시각에 9시간을 더한 가상의 Date 를 반환한다.
 * 이 결과의 `getUTC*` 메서드는 곧 KST 의 연/월/일/시/분/초가 된다.
 */
export function toKstDate(d: Date): Date {
  return new Date(d.getTime() + KST_OFFSET_MS);
}

/**
 * 현재 시각 기준 KST 연/월/일을 추출한다.
 * `/세션확인` 등 "이번 달 캘린더" 계산에 사용.
 */
export function nowKstYmd(
  now: Date = new Date(),
): { year: number; month: number; day: number } {
  const kst = toKstDate(now);
  return {
    year: kst.getUTCFullYear(),
    month: kst.getUTCMonth() + 1,
    day: kst.getUTCDate(),
  };
}

/** KST 연/월/일을 세션 `date` 필드와 같은 `YYYY-MM-DD` 문자열로 만든다. */
export function kstDateKey(ymd: {
  year: number;
  month: number;
  day: number;
}): string {
  return `${ymd.year}-${String(ymd.month).padStart(2, "0")}-${String(
    ymd.day,
  ).padStart(2, "0")}`;
}

const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * `YYYY-MM-DD` 를 `11/08(토)` 처럼 짧은 월/일(요일) 표기로 바꾼다.
 * 날짜만으로 요일이 정해지므로 시간대와 무관하다. 형식이 틀리면 입력을 그대로 돌려준다.
 */
export function formatKstMonthDayWeekday(dateKey: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return dateKey;
  const [, y, m, d] = match;
  const weekday = new Date(
    Date.UTC(Number(y), Number(m) - 1, Number(d)),
  ).getUTCDay();
  return `${m}/${d}(${WEEKDAYS_KO[weekday]})`;
}

/**
 * 세션의 KST `date`(YYYY-MM-DD) + `startTime`(HH:mm) 을 UTC epoch 초로 변환한다.
 * Discord `<t:unix>` 타임스탬프 표기에 사용하며, 형식이 맞지 않으면 null.
 */
export function kstDateTimeToUnix(
  date: string,
  startTime: string,
): number | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(startTime);
  if (!dateMatch || !timeMatch) return null;

  const [, y, m, d] = dateMatch;
  const [, hh, mm] = timeMatch;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const hour = Number(hh);
  const minute = Number(mm);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute)
  ) {
    return null;
  }

  // 입력값은 KST 기준이므로 9시간을 빼 UTC epoch 로 변환한다.
  return Math.floor(
    (Date.UTC(year, month - 1, day, hour, minute, 0, 0) - KST_OFFSET_MS) /
      1000,
  );
}
