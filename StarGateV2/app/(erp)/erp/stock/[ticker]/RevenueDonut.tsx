"use client";

/**
 * 매출 구성 도넛 차트 — recharts PieChart 분리 모듈.
 *
 * `StockInfoPanel` 에서 dynamic({ ssr: false }) 로 진입 — recharts 가 stock list/buy
 * 페이지 차트와 같은 청크에서 로드되도록 모듈 식별자만 분리. (현재 stock/[ticker]
 * 페이지에서 이미 recharts 를 area chart 로 로드하므로 캐시 hit 기대.)
 */

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { useGradientId } from "@/lib/charts/useGradientId";

import styles from "./StockInfoPanel.module.css";

/* ── 차트 데이터 타입 ── */

export interface DonutSlice {
  label: string;
  /** 0~100. 음수도 허용은 하지만 현재 데이터에는 없음. recharts Pie 가 음수 처리 어색. */
  ratio: number;
  color: string;
}

interface Props {
  data: DonutSlice[];
  /** 중앙 라벨 — 단순 "매출 구성" 같은 정적 문자열. 데이터 합도 같이 표시. */
  centerLabel: string;
}

/**
 * Tooltip formatter — recharts default 가 hex 도 출력해 번잡함.
 * `(label, ratio%)` 만 노출.
 */
function tooltipFormatter(value: unknown, name: unknown): [string, string] {
  const v =
    typeof value === "number" ? `${value.toFixed(1)}%` : String(value);
  return [v, String(name)];
}

export default function RevenueDonut({ data, centerLabel }: Props) {
  // 같은 페이지에 다수 차트 존재 가능 → useId 로 안정 id (현재는 활용처 없지만
  // recharts 내부 그라데이션 충돌 대비). 단일 차트라 deps 없음.
  const safeId = useGradientId("donut");
  const total = data.reduce((acc, s) => acc + Math.max(0, s.ratio), 0);

  return (
    <div className={styles.infoPanel__donutChart} data-donut-id={safeId}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <Tooltip
            cursor={false}
            contentStyle={{
              background: "var(--bg-2)",
              border: "1px solid var(--line-strong)",
              color: "var(--ink-0)",
              fontSize: 14,
            }}
            formatter={tooltipFormatter}
          />
          <Pie
            data={data}
            dataKey="ratio"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius="60%"
            outerRadius="92%"
            paddingAngle={1}
            stroke="var(--bg-1)"
            strokeWidth={1}
            isAnimationActive={false}
          >
            {data.map((slice, idx) => (
              <Cell key={`${slice.label}-${idx}`} fill={slice.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className={styles.infoPanel__donutCenter} aria-hidden="true">
        <span className={styles.infoPanel__donutCenterLabel}>
          {centerLabel}
        </span>
        <span className={styles.infoPanel__donutCenterValue}>
          {total.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}
