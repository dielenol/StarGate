import type { HTMLAttributes } from "react";

import styles from "./Bar.module.css";

type BarTone = "gold" | "info" | "danger";

interface BarProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  tone?: BarTone;
}

export default function Bar({
  value,
  tone = "gold",
  className,
  ...rest
}: BarProps) {
  const safeValue = Math.max(0, Math.min(100, value));
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
      aria-valuemax={100}
      {...rest}
    >
      <span
        className={styles.bar__fill}
        style={{ width: `${safeValue}%` }}
      />
    </div>
  );
}
