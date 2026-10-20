/**
 * 날짜 키(`YYYY-MM-DD`)의 화면 표기. 날짜 패널 제목과 세션 상세 모달이 같은 형식을 쓴다.
 */

import { parseDateKey } from "./date-key";

export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/**
 * `2026-10-19` → `2026년 10월 19일 (월)`. 월·일은 0 패딩을 유지한다.
 * 형식이 맞지 않는 키는 그대로 돌려준다.
 */
export function formatKoreanDate(dateKey: string): string {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return dateKey;

  const { year, month, day } = parsed;
  // 날짜 키는 달력상의 날짜라 시간대와 무관하다 — UTC 자정으로 만들어 요일만 읽는다.
  const weekday =
    WEEKDAY_LABELS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${year}년 ${pad2(month)}월 ${pad2(day)}일 (${weekday})`;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
