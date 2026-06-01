"use client";

import Link from "next/link";

import { preferOptimizedPublicImagePath } from "@/lib/asset-path";

import OrgIcon, { type OrgIconCode } from "./OrgIcon";

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
  /** chip 좌측 아이콘 — NOVUS Org Add-on 세트(ROOT/HQ/RESEARCH/...). 미지정 시 아이콘 없음. */
  iconCode?: OrgIconCode;
  /** 실제 조직 로고 이미지. 지정 시 iconCode 보다 우선한다. */
  logoUrl?: string;
  logoVariant?: "badge" | "wide";
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
        // 마지막 2 chip (현재 + 직속 부모) 는 항상 풀 라벨 노출.
        // 그 외 상위 뎁스는 compact — 기본은 아이콘만, hover/focus 시 label 가로 expand.
        // iconCode 없으면 compact 적용 안 함 (라벨이 사라지면 식별 불가).
        const hasVisual = Boolean(c.iconCode || c.logoUrl);
        const isCompact = idx < items.length - 2 && hasVisual;
        const chipClass = [
          styles.crumb,
          c.href || c.onClick ? styles["crumb--clickable"] : "",
          c.on ? styles["crumb--on"] : "",
          isCompact ? styles["crumb--compact"] : "",
        ]
          .filter(Boolean)
          .join(" ");
        const optimizedLogoUrl = c.logoUrl
          ? preferOptimizedPublicImagePath(c.logoUrl)
          : undefined;

        const inner = (
          <>
            {optimizedLogoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={optimizedLogoUrl}
                alt=""
                className={styles.logo}
                aria-hidden
              />
            ) : c.iconCode ? (
              <OrgIcon code={c.iconCode} size={16} className={styles.icon} />
            ) : null}
            <span className={styles.label}>{c.label}</span>
          </>
        );

        return (
          <span key={c.key} className={styles.item}>
            {c.href ? (
              <Link
                href={c.href}
                className={chipClass}
                data-logo-variant={c.logoVariant}
                aria-current={c.on ? "location" : undefined}
              >
                {inner}
              </Link>
            ) : c.onClick ? (
              <button
                type="button"
                className={chipClass}
                data-logo-variant={c.logoVariant}
                onClick={c.onClick}
                aria-current={c.on ? "location" : undefined}
              >
                {inner}
              </button>
            ) : (
              <span
                className={chipClass}
                data-logo-variant={c.logoVariant}
                aria-current={c.on ? "location" : undefined}
              >
                {inner}
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
