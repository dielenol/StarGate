import type { HTMLAttributes, ReactNode } from "react";

import styles from "./Seal.module.css";

type SealSize = "sm" | "md" | "lg";

interface SealProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  size?: SealSize;
}

export default function Seal({
  children,
  size = "md",
  className,
  ...rest
}: SealProps) {
  const sizeClass =
    size === "sm"
      ? styles["seal--sm"]
      : size === "lg"
        ? styles["seal--lg"]
        : "";

  return (
    <div
      className={[styles.seal, sizeClass, className].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}
