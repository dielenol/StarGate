"use client";

import Link from "next/link";

import styles from "./PageHead.module.css";

export interface BreadcrumbItem {
  label: string;
  /** 미지정 시 플레인 텍스트로 렌더된다. 마지막 item 은 href 와 무관하게 현재 페이지로 강조. */
  href?: string;
}

interface BreadcrumbProps {
  /** 명시적 매핑 — 각 세그먼트의 href 를 호출처에서 지정 */
  items?: BreadcrumbItem[];
  /** 하위 호환. 자동 매핑은 404 위험이 있어 제거됨 — 전체 텍스트로 렌더된다. 마지막만 current 강조. */
  source?: string;
}

export default function Breadcrumb({ items, source }: BreadcrumbProps) {
  const resolved: BreadcrumbItem[] =
    items ??
    (source
      ? source
          .split(/\s*\/\s*/)
          .filter(Boolean)
          .map((label) => ({ label }))
      : []);

  if (resolved.length === 0) return null;

  return (
    <nav aria-label="경로" className={styles.crumbNav}>
      {resolved.map((item, idx) => {
        const isLast = idx === resolved.length - 1;
        const canLink = !isLast && !!item.href;

        return (
          <span key={`${idx}-${item.label}`} className={styles.crumbItem}>
            {idx > 0 ? (
              <span className={styles.crumbSep} aria-hidden>
                /
              </span>
            ) : null}
            {canLink ? (
              <Link href={item.href!} className={styles.crumbLink}>
                {item.label}
              </Link>
            ) : (
              <span
                className={isLast ? styles.crumbCurrent : styles.crumbPlain}
                aria-current={isLast ? "page" : undefined}
              >
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
