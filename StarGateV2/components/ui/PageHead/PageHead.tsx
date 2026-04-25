import type { HTMLAttributes, ReactNode } from "react";

import Breadcrumb, { type BreadcrumbItem } from "./Breadcrumb";
import styles from "./PageHead.module.css";

interface PageHeadProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title: ReactNode;
  /**
   * 배열(`BreadcrumbItem[]`) — 각 세그먼트의 href 를 명시. 마지막은 현재 페이지로 강조.
   * 문자열 — 하위 호환. 자동 URL 매핑은 404 위험이 있어 제거됨, 전체 텍스트 렌더.
   * 기타 ReactNode — 그대로 렌더.
   */
  breadcrumb?: ReactNode | BreadcrumbItem[];
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
          <div className={styles.pageHead__breadcrumb}>
            {Array.isArray(breadcrumb) ? (
              <Breadcrumb items={breadcrumb as BreadcrumbItem[]} />
            ) : typeof breadcrumb === "string" ? (
              <Breadcrumb source={breadcrumb} />
            ) : (
              breadcrumb
            )}
          </div>
        ) : null}
        <h1 className={styles.pageHead__title}>{title}</h1>
      </div>
      {right ? <div className={styles.pageHead__right}>{right}</div> : null}
    </div>
  );
}
