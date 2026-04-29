"use client";

import Link from "next/link";

import styles from "./OrgDrillCrumbs.module.css";

/**
 * personnel 인덱스 / dossier 양쪽에서 사용하는 조직도 drill chip 한 개.
 * - href 가 있으면 `<Link>` 로 렌더 (dossier 의 페이지 이동용)
 * - onClick 만 있으면 `<button>` (인덱스의 state 토글용)
 * - 둘 다 없으면 `<span>` (현재 위치 — 보통 on:true 와 함께 사용)
 */
export interface DrillCrumbItem {
  key: string;
  label: string;
  /** 강조(현재 위치). 마지막 chip 에 부여. */
  on?: boolean;
  href?: string;
  onClick?: () => void;
}

interface Props {
  items: DrillCrumbItem[];
  ariaLabel?: string;
  className?: string;
}

export default function OrgDrillCrumbs({
  items,
  ariaLabel = "조직도 경로",
  className,
}: Props) {
  if (items.length === 0) return null;

  return (
    <nav
      className={[styles.crumbs, className].filter(Boolean).join(" ")}
      aria-label={ariaLabel}
    >
      {items.map((c, idx) => {
        const chipClass = [
          styles.crumb,
          c.href || c.onClick ? styles["crumb--clickable"] : "",
          c.on ? styles["crumb--on"] : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <span key={c.key} className={styles.item}>
            {c.href ? (
              <Link
                href={c.href}
                className={chipClass}
                aria-current={c.on ? "location" : undefined}
              >
                {c.label}
              </Link>
            ) : c.onClick ? (
              <button
                type="button"
                className={chipClass}
                onClick={c.onClick}
                aria-current={c.on ? "location" : undefined}
              >
                {c.label}
              </button>
            ) : (
              <span
                className={chipClass}
                aria-current={c.on ? "location" : undefined}
              >
                {c.label}
              </span>
            )}
            {idx < items.length - 1 ? (
              <span className={styles.sep} aria-hidden>
                ›
              </span>
            ) : null}
          </span>
        );
      })}
    </nav>
  );
}
