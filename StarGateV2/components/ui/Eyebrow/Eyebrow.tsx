import type { HTMLAttributes, ReactNode } from "react";

import styles from "./Eyebrow.module.css";

type EyebrowTone = "default" | "gold";

interface EyebrowProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  tone?: EyebrowTone;
}

export default function Eyebrow({
  children,
  tone = "default",
  className,
  ...rest
}: EyebrowProps) {
  const toneClass = tone === "gold" ? styles["eyebrow--gold"] : "";

  return (
    <span
      className={[styles.eyebrow, toneClass, className]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </span>
  );
}
