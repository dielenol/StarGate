"use client";

/**
 * 주식 섹션 탭 — [종목] / [내 자산].
 *
 * - `/erp/stock` (list view) 와 `/erp/stock/portfolio` 두 페이지 사이를 잇는 네비.
 * - `/erp/stock/[ticker]` (종목 상세) 에서는 사용하지 않음 (Breadcrumb 으로 대체).
 * - 활성 탭은 골드 underline + ink-0. 비활성은 ink-2.
 * - 토스 차용: 페이지 상단 칩-스타일 탭. ERP 톤(검정+골드)으로 적용.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "./StockTabs.module.css";

const TABS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/erp/stock", label: "종목" },
  { href: "/erp/stock/portfolio", label: "내 자산" },
];

export default function StockTabs() {
  const pathname = usePathname();

  return (
    <nav className={styles.tabs} role="tablist" aria-label="주식 섹션">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            role="tab"
            aria-selected={active}
            className={[styles.tab, active ? styles["tab--active"] : ""]
              .filter(Boolean)
              .join(" ")}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
