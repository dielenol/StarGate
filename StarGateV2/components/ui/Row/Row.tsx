import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

import styles from "./Row.module.css";

interface RowProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  gap?: number | string;
  align?: CSSProperties["alignItems"];
}

export default function Row({
  children,
  gap,
  align,
  style,
  className,
  ...rest
}: RowProps) {
  const mergedStyle: CSSProperties = {
    ...(gap !== undefined ? { gap } : null),
    ...(align !== undefined ? { alignItems: align } : null),
    ...style,
  };

  return (
    <div
      className={[styles.row, className].filter(Boolean).join(" ")}
      style={mergedStyle}
      {...rest}
    >
      {children}
    </div>
  );
}
