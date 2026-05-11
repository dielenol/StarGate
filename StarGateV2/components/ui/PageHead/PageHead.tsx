"use client";

import type { ReactNode } from "react";

import type { BreadcrumbItem } from "./Breadcrumb";
import { useSetPageHead } from "./PageHeadContext";
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
}

/**
 * 페이지 헤딩을 ERP topbar 가운데 슬롯에 위임한다.
 *
 * - `title` / `breadcrumb` 는 DOM 에 렌더되지 않고 PageHeadContext 에 등록 →
 *   ERPHeader 가 그 값을 받아 한 줄로 표시.
 * - `right` 가 있을 때만 페이지 컨텐츠 위에 컴팩트한 우측 액션 바를 렌더.
 * - `right` 가 없으면 DOM 산출 자체를 생략 (null).
 * - 기존 호출처(13개)는 props 변경 없이 자동 적응.
 */
export default function PageHead({
  title,
  breadcrumb,
  right,
  className,
}: PageHeadProps) {
  useSetPageHead({ breadcrumb, title });

  if (!right) return null;

  return (
    <div className={[styles.pageHead, className].filter(Boolean).join(" ")}>
      <div className={styles.pageHead__right}>{right}</div>
    </div>
  );
}
