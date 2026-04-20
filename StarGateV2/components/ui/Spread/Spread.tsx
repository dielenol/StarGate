import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

import styles from "./Spread.module.css";

interface SpreadProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  gap?: number | string;
  align?: CSSProperties["alignItems"];
  justify?: CSSProperties["justifyContent"];
}

export default function Spread({
  children,
  gap,
  align,
  justify,
  style,
  className,
  ...rest
}: SpreadProps) {
  const mergedStyle: CSSProperties = {
    ...(gap !== undefined ? { gap } : null),
    ...(align !== undefined ? { alignItems: align } : null),
    ...(justify !== undefined ? { justifyContent: justify } : null),
    ...style,
  };

  return (
    <div
      className={[styles.spread, className].filter(Boolean).join(" ")}
      style={mergedStyle}
      {...rest}
    >
      {children}
    </div>
  );
}
