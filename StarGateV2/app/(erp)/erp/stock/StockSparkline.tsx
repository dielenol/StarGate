"use client";

/**
 * Lightweight row sparkline.
 *
 * The stock list renders this once per row, so keep it free of Recharts and
 * draw a tiny SVG path directly. The larger detail chart still owns Recharts.
 */

import { useId, useMemo } from "react";

import styles from "./page.module.css";

interface Props {
  points: Array<{ ts: string; price: number }>;
  direction: "up" | "down" | "flat";
  height?: number;
}

const STROKE: Record<Props["direction"], string> = {
  up: "var(--gold)",
  down: "var(--danger)",
  flat: "var(--ink-3)",
};

const VIEWBOX_WIDTH = 100;
const VIEWBOX_HEIGHT = 40;
const PAD_Y = 3;

function buildSparklinePaths(points: Props["points"]) {
  const prices = points.map((point) => point.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min;
  const drawableHeight = VIEWBOX_HEIGHT - PAD_Y * 2;
  const baselineY = VIEWBOX_HEIGHT - PAD_Y;

  const coords = points.map((point, index) => {
    const x =
      points.length === 1
        ? VIEWBOX_WIDTH / 2
        : (index / (points.length - 1)) * VIEWBOX_WIDTH;
    const y =
      range === 0
        ? VIEWBOX_HEIGHT / 2
        : PAD_Y + (1 - (point.price - min) / range) * drawableHeight;
    return { x, y };
  });

  const linePath = coords
    .map((coord, index) =>
      `${index === 0 ? "M" : "L"} ${coord.x.toFixed(2)} ${coord.y.toFixed(2)}`,
    )
    .join(" ");
  const areaPath = `${linePath} L ${VIEWBOX_WIDTH} ${baselineY} L 0 ${baselineY} Z`;

  return { linePath, areaPath };
}

export default function StockSparkline({
  points,
  direction,
  height = 40,
}: Props) {
  const rawGradientId = useId();
  const gradientId = `sparkline-${rawGradientId.replace(/:/g, "")}`;
  const stroke = STROKE[direction];
  const { linePath, areaPath } = useMemo(
    () => buildSparklinePaths(points),
    [points],
  );

  if (points.length < 2) {
    return (
      <div
        aria-hidden
        className={styles.stockCard__sparklineEmpty}
        style={{ height }}
      >
        <span className={styles.stockCard__sparklineEmptyLine} />
      </div>
    );
  }

  return (
    <svg
      aria-hidden
      focusable="false"
      height={height}
      preserveAspectRatio="none"
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      width="100%"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.36} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
