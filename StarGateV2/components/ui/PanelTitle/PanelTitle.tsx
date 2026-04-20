import type { HTMLAttributes, ReactNode } from "react";

import styles from "./PanelTitle.module.css";

interface PanelTitleProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  right?: ReactNode;
}

export default function PanelTitle({
  children,
  right,
  className,
  ...rest
}: PanelTitleProps) {
  return (
    <div
      className={[styles.panelTitle, className].filter(Boolean).join(" ")}
      {...rest}
    >
      <span>{children}</span>
      {right ? <span className={styles.panelTitle__right}>{right}</span> : null}
    </div>
  );
}
