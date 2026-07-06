"use client";

/**
 * recharts 차트 분리 모듈.
 *
 * 종목 상세 페이지(`/erp/stock/[ticker]`) 에서 dynamic({ ssr: false }) 로 진입 —
 * recharts 약 95KB(gzipped) 를 초기 stock 번들에서 제외.
 *
 * Skeleton 은 동일 컨테이너(.chartPanel__chart) 높이를 그대로 차지해 CLS 방지.
 *
 * M3-A 토스 리워크: LineChart → AreaChart + gradient fill. dot 제거 (sparkline 톤).
 */

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useGradientId } from "@/lib/charts/useGradientId";
import {
  MIN_STOCK_PRICE,
  formatStockValue,
  roundStockValue,
} from "@/lib/stocks/pricing";

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
  averagePrice?: number;
  basePrice?: number;
}

/* ── Skeleton (loading placeholder) ── */

/**
 * dynamic() loading 동안 표시할 placeholder. 차트 컨테이너의 height(.chartPanel__chart) 를
 * 동일 className 으로 점유 → 청크 로드 후에도 layout shift 없음.
 */
export function ChartSkeleton() {
  return (
    <div className={styles.chartPanel__chart} aria-hidden="true" />
  );
}

function eventMarkerColor(source: ChartPoint["source"]): string {
  if (source === "gm-event") return "var(--danger)";
  if (source === "trade") return "var(--info)";
  return "var(--gold)";
}

/* ── 컴포넌트 ── */

export default function StockHistoryChart({
  data,
  averagePrice,
  basePrice,
}: Props) {
  // 같은 페이지에 sparkline AreaChart 가 다수 존재 → useId() 로 gradient id 충돌 방지.
  const safeGradientId = useGradientId("g");
  const eventPoints = data.filter((point) => point.eventText.trim());
  const showAverageLine =
    typeof averagePrice === "number" && Number.isFinite(averagePrice) && averagePrice > 0;
  const showBaseLine =
    typeof basePrice === "number" && Number.isFinite(basePrice) && basePrice > 0;

  return (
    <div className={styles.chartPanel__chart}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 12, right: 16, bottom: 8, left: 4 }}
        >
          <defs>
            <linearGradient id={safeGradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--gold)" stopOpacity={0.32} />
              <stop offset="100%" stopColor="var(--gold)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke="var(--line)"
            strokeDasharray="2 6"
            vertical={false}
          />
          <XAxis
            dataKey="ts"
            tickFormatter={formatChartDate}
            stroke="var(--ink-3)"
            tick={{ fill: "var(--ink-3)", fontSize: 14 }}
            minTickGap={40}
            interval="preserveStartEnd"
          />
          {/*
            Y축 domain 을 dataMin/dataMax 로 좁혀 area 가 컨테이너 전체를 채움 (sparkline 과 동일 톤).
            default 의 0~max 는 양수 가격에서 area 가 컨테이너 위쪽 일부만 그려져 평탄해 보임.
            ±2% padding 으로 끝점 클립 방지 + tick 라벨 가독성.
          */}
          <YAxis
            stroke="var(--ink-3)"
            tick={{ fill: "var(--ink-3)", fontSize: 14 }}
            tickFormatter={(v) =>
              typeof v === "number" ? formatStockValue(v) : String(v)
            }
            width={56}
            domain={[
              (min: number) =>
                Math.max(MIN_STOCK_PRICE, roundStockValue(min * 0.98)),
              (max: number) => roundStockValue(max * 1.02),
            ]}
          />
          <Tooltip
            cursor={{
              stroke: "var(--gold)",
              strokeWidth: 1,
              strokeDasharray: "0",
            }}
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
                  ? `¤ ${formatStockValue(value)}`
                  : String(value);
              return point?.eventText
                ? [`${v} · ${point.eventText}`, "가격"]
                : [v, "가격"];
            }}
          />
          {showBaseLine ? (
            <ReferenceLine
              y={basePrice}
              stroke="var(--ink-3)"
              strokeDasharray="3 6"
              strokeOpacity={0.72}
            />
          ) : null}
          {showAverageLine ? (
            <ReferenceLine
              y={averagePrice}
              stroke="var(--info)"
              strokeDasharray="6 4"
              strokeOpacity={0.82}
            />
          ) : null}
          <Area
            type="monotone"
            dataKey="price"
            stroke="var(--gold)"
            strokeWidth={1.5}
            fill={`url(#${safeGradientId})`}
            fillOpacity={1}
            baseValue="dataMin"
            dot={false}
            activeDot={{
              r: 3,
              stroke: "var(--gold)",
              strokeWidth: 1,
              fill: "var(--bg)",
            }}
            isAnimationActive={false}
          />
          {eventPoints.map((point) => (
            <ReferenceDot
              key={`${point.ts}-${point.source}`}
              x={point.ts}
              y={point.price}
              r={4}
              fill={eventMarkerColor(point.source)}
              stroke="var(--bg)"
              strokeWidth={1.5}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
