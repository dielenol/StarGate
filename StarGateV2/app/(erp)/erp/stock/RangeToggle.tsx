"use client";

/**
 * 차트 시간 범위 토글 (1D / 1W / 1M / ALL).
 *
 * - history API 의 days 파라미터는 1~30 만 허용 → ALL 도 30 일 매핑.
 *   (TTL 30 일 = "보유 가능한 모든" 데이터.)
 * - role="tablist" + aria-selected 로 a11y. 키보드는 native button 으로 충분.
 */

import styles from "./page.module.css";

export type RangeKey = "1D" | "1W" | "1M" | "ALL";

export const RANGE_TO_DAYS: Record<RangeKey, number> = {
  "1D": 1,
  "1W": 7,
  "1M": 30,
  ALL: 30,
};

/** 종목 상세 진입 시 기본 range — 서버 initialHistory 시드 days 와 동기화. */
export const INITIAL_RANGE: RangeKey = "1M";

const RANGES: RangeKey[] = ["1D", "1W", "1M", "ALL"];

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
