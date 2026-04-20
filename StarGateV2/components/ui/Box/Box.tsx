import type { HTMLAttributes, ReactNode } from "react";

import styles from "./Box.module.css";

type BoxVariant = "default" | "gold" | "solid";

interface BoxProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: BoxVariant;
}

export default function Box({
  children,
  variant = "default",
  className,
  ...rest
}: BoxProps) {
  const variantClass =
    variant === "gold"
      ? styles["box--gold"]
      : variant === "solid"
        ? styles["box--solid"]
        : "";

  return (
    <div
      className={[styles.box, variantClass, className]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}
