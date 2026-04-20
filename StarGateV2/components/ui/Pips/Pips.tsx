import type { HTMLAttributes } from "react";

import styles from "./Pips.module.css";

interface PipsProps extends HTMLAttributes<HTMLDivElement> {
  total: number;
  filled: number;
}

export default function Pips({
  total,
  filled,
  className,
  ...rest
}: PipsProps) {
  const safeTotal = Math.max(0, Math.floor(total));
  const safeFilled = Math.max(0, Math.min(safeTotal, Math.floor(filled)));

  return (
    <div
      className={[styles.pips, className].filter(Boolean).join(" ")}
      {...rest}
    >
      {Array.from({ length: safeTotal }, (_, i) => (
        <span
          key={i}
          className={[
            styles.pips__pip,
            i < safeFilled ? styles["pips__pip--on"] : "",
          ]
            .filter(Boolean)
            .join(" ")}
        />
      ))}
    </div>
  );
}
