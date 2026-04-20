import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

import styles from "./Stack.module.css";

interface StackProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  gap?: number | string;
  align?: CSSProperties["alignItems"];
}

export default function Stack({
  children,
  gap,
  align,
  style,
  className,
  ...rest
}: StackProps) {
  const mergedStyle: CSSProperties = {
    ...(gap !== undefined ? { gap } : null),
    ...(align !== undefined ? { alignItems: align } : null),
    ...style,
  };

  return (
    <div
      className={[styles.stack, className].filter(Boolean).join(" ")}
      style={mergedStyle}
      {...rest}
    >
      {children}
    </div>
  );
}
