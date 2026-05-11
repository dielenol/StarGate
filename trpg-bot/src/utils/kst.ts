/**
 * KST(UTC+9) 환산 유틸
 *
 * - `toKstDate`: UTC Date → KST 로 9시간 더한 가상의 Date.
 *   `getUTC*` 메서드로 KST 연/월/일/시 추출 시 사용한다.
 * - `nowKstYmd`: 현재 시각 기준 KST 연/월/일을 추출.
 *
 * NOTE: shared-db 측에는 자체 KST 헬퍼가 있으므로 영역 분리. 본 모듈은
 * trpg-bot 내부 호출처(`/세션확인`, 캘린더 PNG 렌더 등)에서만 사용한다.
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
export function nowKstYmd(): { year: number; month: number; day: number } {
  const kst = toKstDate(new Date());
  return {
    year: kst.getUTCFullYear(),
    month: kst.getUTCMonth() + 1,
    day: kst.getUTCDate(),
  };
}
