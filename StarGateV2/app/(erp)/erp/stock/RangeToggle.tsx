"use client";

/**
 * 차트 시간 범위 토글 (1D / 1W / 1M / 3M / 1Y / ALL).
 *
 * - NOVEX 2.0 이력은 영구 보관한다. 서버 API 는 range 값에 맞춰 필요한
 *   기간을 조회하며 ALL 은 전체 이력을 요청하는 0일 sentinel 이다.
 * - role="tablist" + aria-selected 로 a11y. 키보드는 native button 으로 충분.
 */

import styles from "./page.module.css";

export type RangeKey = "1D" | "1W" | "1M" | "3M" | "1Y" | "ALL";

export const RANGE_TO_DAYS: Record<RangeKey, number> = {
  "1D": 1,
  "1W": 7,
  "1M": 30,
  "3M": 90,
  "1Y": 365,
  ALL: 0,
};

/** 종목 상세 진입 시 기본 range — 서버 initialHistory 시드 days 와 동기화. */
export const INITIAL_RANGE: RangeKey = "1M";

const RANGES: RangeKey[] = ["1D", "1W", "1M", "3M", "1Y", "ALL"];

interface Props {
  value: RangeKey;
  onChange: (next: RangeKey) => void;
}

export default function RangeToggle({ value, onChange }: Props) {
  return (
    <div
      className={styles.rangeToggle}
      role="tablist"
      aria-label="시간 범위"
    >
      {RANGES.map((r) => {
        const active = r === value;
        return (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={active}
            className={[
              styles.rangeToggle__chip,
              active ? styles["rangeToggle__chip--active"] : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onChange(r)}
          >
            {r}
          </button>
        );
      })}
    </div>
  );
}
