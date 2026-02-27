"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import styles from "./Sidebar.module.css";
import { resolvePublicAssetPath } from "@/lib/asset-path";

type NavChildItem = {
  label: string;
  href: string;
  icon: string;
};

type NavItem = {
  label: string;
  href?: string;
  icon: string;
  children?: NavChildItem[];
};

const NAV_ITEMS: NavItem[] = [
  { label: "기밀 아카이브", href: "/", icon: "⌂" },
  { label: "입회 심사 신청", href: "/apply", icon: "⚜" },
  { label: "기밀 문의 접수", href: "/contact", icon: "✉" },
  {
    label: "세계관 기록",
    icon: "◈",
    children: [
      { label: "세계관", href: "/world", icon: "•" },
      { label: "세계관 A", href: "/world/a", icon: "A" },
      { label: "세계관 B", href: "/world/b", icon: "B" },
      { label: "세계관 C", href: "/world/c", icon: "C" },
    ],
  },
  { label: "룰 설명", href: "/rules", icon: "☷" },
  { label: "게임 진행", href: "/gameplay", icon: "▶" },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Sidebar() {
  const pathname = usePathname();
  const brandLogoSrc = resolvePublicAssetPath("/assets/StarGate_logo.png");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [worldExpanded, setWorldExpanded] = useState(() => pathname.startsWith("/world"));

  const worldActive = useMemo(() => pathname.startsWith("/world"), [pathname]);

  function closeMobileMenu() {
    setMobileOpen(false);
  }

  return (
    <>
      <button
        aria-expanded={mobileOpen}
        aria-label="메뉴 열기"
        className={`${styles["sidebar__hamburger"]} ${mobileOpen ? styles["sidebar__hamburger--hidden"] : ""}`}
        onClick={() => setMobileOpen((prev) => !prev)}
        type="button"
      >
        ☰
      </button>

      <aside className={`${styles.sidebar} ${mobileOpen ? styles["sidebar--mobile-open"] : ""}`}>
        <div className={styles["sidebar__header"]}>
          <span className={styles["sidebar__brand-icon"]}>
            <Image
              alt="NOVUS ORDO 로고"
              className={styles["sidebar__brand-image"]}
              height={36}
              src={brandLogoSrc}
              width={36}
            />
          </span>
          <span className={styles["sidebar__brand-text"]}>NOVUS ORDO</span>
          <button
            aria-label="메뉴 닫기"
            className={styles["sidebar__close"]}
            onClick={() => setMobileOpen(false)}
            type="button"
          >
            ✕
          </button>
        </div>

        <nav aria-label="주요 메뉴" className={styles["sidebar__nav"]}>
          {NAV_ITEMS.map((item) => {
            if (!item.children || item.children.length === 0) {
              const active = item.href ? isActivePath(pathname, item.href) : false;

              return (
                <Link
                  className={`${styles["sidebar__item"]} ${active ? styles["sidebar__item--active"] : ""}`}
                  href={item.href ?? "/"}
                  onClick={closeMobileMenu}
                  key={item.label}
                >
                  <span className={styles["sidebar__icon"]}>{item.icon}</span>
                  <span className={styles["sidebar__label"]}>{item.label}</span>
                </Link>
              );
            }

            const expanded = worldExpanded || worldActive;

            return (
              <div className={styles["sidebar__group"]} key={item.label}>
                <button
                  aria-expanded={expanded}
                  className={`${styles["sidebar__item"]} ${worldActive ? styles["sidebar__item--active"] : ""}`}
                  onClick={() => setWorldExpanded((prev) => !prev)}
                  type="button"
                >
                  <span className={styles["sidebar__icon"]}>{item.icon}</span>
                  <span className={styles["sidebar__label"]}>{item.label}</span>
                  <span className={styles["sidebar__caret"]}>{expanded ? "▾" : "▸"}</span>
                </button>

                <div
                  className={`${styles["sidebar__children"]} ${expanded ? styles["sidebar__children--open"] : ""}`}
                >
                  {item.children.map((child) => {
                    const childActive = isActivePath(pathname, child.href);

                    return (
                      <Link
                        className={`${styles["sidebar__child-item"]} ${childActive ? styles["sidebar__child-item--active"] : ""}`}
                        href={child.href}
                        onClick={closeMobileMenu}
                        key={child.href}
                      >
                        <span className={styles["sidebar__child-icon"]}>{child.icon}</span>
                        <span className={styles["sidebar__child-label"]}>{child.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
      </aside>

      {mobileOpen ? (
        <button
          aria-label="메뉴 닫기"
          className={styles["sidebar__backdrop"]}
          onClick={() => setMobileOpen(false)}
          type="button"
        />
      ) : null}
    </>
  );
}
