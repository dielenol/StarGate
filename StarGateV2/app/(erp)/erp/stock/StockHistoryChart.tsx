"use client";

/**
 * recharts 차트 분리 모듈.
 *
 * StockClient 의 정적 import 가 recharts 약 95KB(gzipped) 를 초기 stock 번들에
 *포함시키는 것을 회피하기 위한 분리. dynamic({ ssr: false }) 로 진입.
 *
 * Skeleton 은 동일 컨테이너(.chartPanel__chart) 높이를 그대로 차지해 CLS 방지.
 */

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import styles from "./page.module.css";

/* ── 차트 데이터 타입 ── */

export interface ChartPoint {
  ts: string;
  price: number;
  eventText: string;
  source: "scheduled" | "trade" | "gm-event";
}

/* ── KST 라벨 포맷팅 ── */

const KST_LABEL_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
});
const KST_FULL_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function formatChartDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return KST_LABEL_FORMATTER.format(d);
}

function formatTooltipDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return KST_FULL_FORMATTER.format(d);
}

/* ── Props ── */

interface Props {
  data: ChartPoint[];
}

/* ── Skeleton (loading placeholder) ── */

/**
 * dynamic() loading 동안 표시할 placeholder. 차트 컨테이너의 height(280px) 를
 * 동일 className 으로 점유 → 청크 로드 후에도 layout shift 없음.
 */
export function ChartSkeleton() {
  return (
    <div className={styles.chartPanel__chart} aria-hidden="true" />
  );
}

/* ── 컴포넌트 ── */

export default function StockHistoryChart({ data }: Props) {
  return (
    <div className={styles.chartPanel__chart}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 12, right: 16, bottom: 8, left: 4 }}
        >
          <CartesianGrid stroke="var(--line)" strokeDasharray="2 4" />
          <XAxis
            dataKey="ts"
            tickFormatter={formatChartDate}
            stroke="var(--ink-3)"
            tick={{ fill: "var(--ink-2)", fontSize: 14 }}
            minTickGap={28}
          />
          <YAxis
            stroke="var(--ink-3)"
            tick={{ fill: "var(--ink-2)", fontSize: 14 }}
            tickFormatter={(v) =>
              typeof v === "number" ? v.toLocaleString() : String(v)
            }
            width={60}
          />
          <Tooltip
            contentStyle={{
              background: "var(--bg-2)",
              border: "1px solid var(--line-strong)",
              color: "var(--ink-0)",
              fontSize: 14,
            }}
            labelFormatter={(label) =>
              typeof label === "string"
                ? formatTooltipDate(label)
                : String(label)
            }
            formatter={(value, _name, payload) => {
              const point = payload?.payload as ChartPoint | undefined;
              const v =
                typeof value === "number"
                  ? `¤ ${value.toLocaleString()}`
                  : String(value);
              return point?.eventText
                ? [`${v} · ${point.eventText}`, "가격"]
                : [v, "가격"];
            }}
          />
          <Line
            type="monotone"
            dataKey="price"
            stroke="var(--gold)"
            strokeWidth={2}
            dot={{ r: 2, fill: "var(--gold)", stroke: "var(--gold)" }}
            activeDot={{ r: 4, fill: "var(--gold)" }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
