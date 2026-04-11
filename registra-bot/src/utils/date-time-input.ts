/**
 * 슬래시 입력용 로컬 날짜/시각 파서
 *
 * 허용 형식:
 * - YYYY-MM-DD HH:mm
 * - YYYY-MM-DDTHH:mm
 *
 * `new Date(string)`의 자동 보정(예: 2월 31일 -> 3월 3일)을 막기 위해
 * 구성 요소를 직접 검증합니다.
 * @module utils/date-time-input
 */

const DATE_TIME_INPUT_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[ T])(\d{2}):(\d{2})$/;

export function parseStrictDateTimeInput(input: string): Date | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const match = trimmed.match(DATE_TIME_INPUT_RE);
  if (!match) return null;

  const [, yStr, moStr, dStr, hStr, miStr] = match;
  const year = Number(yStr);
  const month = Number(moStr);
  const day = Number(dStr);
  const hour = Number(hStr);
  const minute = Number(miStr);

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;

  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (isNaN(date.getTime())) return null;

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null;
  }

  return date;
}
