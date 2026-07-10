import type { ReactNode } from "react";

import type { BreadcrumbItem } from "./Breadcrumb";
import PageHeadRegistrar from "./PageHeadRegistrar";
import styles from "./PageHead.module.css";

interface PageHeadProps {
  title: ReactNode;
  /**
   * 배열(`BreadcrumbItem[]`) — 각 세그먼트의 href 를 명시. 마지막은 현재 페이지로 강조.
   * 문자열 — 하위 호환. 자동 URL 매핑은 404 위험이 있어 제거됨, 전체 텍스트 렌더.
   * 기타 ReactNode — 그대로 렌더.
   */
  breadcrumb?: ReactNode | BreadcrumbItem[];
  right?: ReactNode;
  className?: string;
  /** 페이지 본문이 별도의 visible H1을 렌더할 때 중복 heading 생성을 막는다. */
  hasVisibleHeading?: boolean;
}

/**
 * 페이지의 실제 H1 을 SSR하고, topbar 표시는 client registrar 에 위임한다.
 *
 * - `title` 은 시각적으로 숨긴 H1 으로 SSR되어 문서 outline 을 유지한다.
 * - `title` / `breadcrumb` 은 PageHeadRegistrar 가 PageHeadContext 에 등록한다.
 * - `right` 가 있을 때만 페이지 컨텐츠 위에 컴팩트한 우측 액션 바를 렌더.
 * - 기존 호출처는 props 변경 없이 자동 적응한다.
 */
export default function PageHead({
  title,
  breadcrumb,
  right,
  className,
  hasVisibleHeading = false,
}: PageHeadProps) {
  return (
    <>
      <PageHeadRegistrar breadcrumb={breadcrumb} title={title} />
      {hasVisibleHeading ? null : (
        <h1 className={styles.pageHead__title}>{title}</h1>
      )}
      {right ? (
        <div className={[styles.pageHead, className].filter(Boolean).join(" ")}>
          <div className={styles.pageHead__right}>{right}</div>
        </div>
      ) : null}
    </>
  );
}
