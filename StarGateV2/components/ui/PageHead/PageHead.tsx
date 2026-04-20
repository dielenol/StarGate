import type { HTMLAttributes, ReactNode } from "react";

import styles from "./PageHead.module.css";

interface PageHeadProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title: ReactNode;
  breadcrumb?: ReactNode;
  right?: ReactNode;
}

export default function PageHead({
  title,
  breadcrumb,
  right,
  className,
  ...rest
}: PageHeadProps) {
  return (
    <div
      className={[styles.pageHead, className].filter(Boolean).join(" ")}
      {...rest}
    >
      <div>
        {breadcrumb ? (
          <div className={styles.pageHead__breadcrumb}>{breadcrumb}</div>
        ) : null}
        <h1 className={styles.pageHead__title}>{title}</h1>
      </div>
      {right ? <div className={styles.pageHead__right}>{right}</div> : null}
    </div>
  );
}
