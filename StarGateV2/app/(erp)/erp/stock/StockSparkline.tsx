"use client";

/**
 * 종목 카드 미니 차트 (sparkline).
 *
 * - 단일 sparkline 은 dot 없는 AreaChart + gradient fill 로 토스 톤 차용.
 * - 데이터가 < 2 포인트면 가운데 점선 baseline 을 표시 (placeholder 에 가깝게).
 * - 색은 등락 방향(direction) 으로 분기 — up:gold / down:danger / flat:ink-3.
 *
 * Note — list view 의 행 sparkline 으로 정적 import 사용. recharts vendor chunk 는
 * list view 진입 시점에 로드되며 이후 종목 상세의 dynamic chart 와 vendor chunk 공유.
 */

import { Area, AreaChart, ResponsiveContainer } from "recharts";

import { useGradientId } from "@/lib/charts/useGradientId";

import styles from "./page.module.css";

interface Props {
  /** 시계열 (오름차순). 빈 배열이면 빈 컨테이너 placeholder. */
  points: Array<{ ts: string; price: number }>;
  /** 등락 방향 — gradient/stroke 색 분기. */
  direction: "up" | "down" | "flat";
  /** 높이 px. 카드 미니 차트는 36~44 권장. */
  height?: number;
}

const STROKE: Record<Props["direction"], string> = {
  up: "var(--gold)",
  down: "var(--danger)",
  flat: "var(--ink-3)",
};

export default function StockSparkline({
  points,
  direction,
  height = 40,
}: Props) {
  const safeId = useGradientId("sl");
  const stroke = STROKE[direction];

  if (points.length < 2) {
    // 데이터 부족: 가운데 점선 baseline. ARIA "데이터 없음".
    return (
      <div
        className={styles.stockCard__sparklineEmpty}
        style={{ height }}
        aria-label="시세 시계열 없음"
      >
        <span className={styles.stockCard__sparklineEmptyLine} />
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
        <defs>
          <linearGradient id={safeId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.36} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="price"
          stroke={stroke}
          strokeWidth={1.5}
          fill={`url(#${safeId})`}
          fillOpacity={1}
          isAnimationActive={false}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
