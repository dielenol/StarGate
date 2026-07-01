import type { HTMLAttributes } from "react";

import styles from "./Bar.module.css";

type BarTone = "gold" | "info" | "danger";

interface BarProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  tone?: BarTone;
}

export default function Bar({
  value,
  max = 100,
  tone = "gold",
  className,
  ...rest
}: BarProps) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 100;
  const safeValue = Math.max(0, Math.min(safeMax, value));
  const percentage = (safeValue / safeMax) * 100;
  const toneClass =
    tone === "info"
      ? styles["bar--info"]
      : tone === "danger"
        ? styles["bar--danger"]
        : "";

  return (
    <div
      className={[styles.bar, toneClass, className].filter(Boolean).join(" ")}
      role="progressbar"
      aria-valuenow={safeValue}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      {...rest}
    >
      <span
        className={styles.bar__fill}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}
