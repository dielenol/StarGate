"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
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
      { label: "플레이어", href: "/world/player", icon: "♟" },
      // { label: "세계관 B", href: "/world/b", icon: "B" },
      // { label: "세계관 C", href: "/world/c", icon: "C" },
    ],
  },
  { label: "작전 내규", href: "/gameplay", icon: "▶" },
  { label: "노부스 오르도 룰", href: "/rules", icon: "☷" },
  { label: "운영 시스템", href: "/erp", icon: "⚙" },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function isExactPath(pathname: string, href: string) {
  return pathname === href;
}

export default function Sidebar() {
  const pathname = usePathname();
  const brandLogoSrc = resolvePublicAssetPath("/assets/StarGate_logo.png");
  const sidebarFlipSrc = resolvePublicAssetPath("/sound/sidebar_flip.wav");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [worldExpanded, setWorldExpanded] = useState(() => pathname.startsWith("/world"));
  const sidebarAudioRef = useRef<HTMLAudioElement | null>(null);

  const worldSectionOpen = pathname.startsWith("/world");
  const worldActive = pathname === "/world";

  function closeMobileMenu() {
    setMobileOpen(false);
  }

  function playSidebarFlip() {
    try {
      if (!sidebarAudioRef.current) {
        const audio = new Audio(sidebarFlipSrc);
        audio.preload = "auto";
        sidebarAudioRef.current = audio;
      }

      const audio = sidebarAudioRef.current;
      audio.currentTime = 0;
      void audio.play().catch(() => {});
    } catch {
      // Ignore audio playback errors (autoplay policy, unsupported env, etc.)
    }
  }

  return (
    <>
      <button
        aria-expanded={mobileOpen}
        aria-label="메뉴 열기"
        className={`${styles["sidebar__hamburger"]} ${mobileOpen ? styles["sidebar__hamburger--hidden"] : ""}`}
        onClick={() => {
          playSidebarFlip();
          setMobileOpen((prev) => !prev);
        }}
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
            onClick={() => {
              playSidebarFlip();
              setMobileOpen(false);
            }}
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
                  onClick={() => {
                    playSidebarFlip();
                    closeMobileMenu();
                  }}
                  key={item.label}
                >
                  <span className={styles["sidebar__icon"]}>{item.icon}</span>
                  <span className={styles["sidebar__label"]}>{item.label}</span>
                </Link>
              );
            }

            const expanded = worldExpanded || worldSectionOpen;

            return (
              <div className={styles["sidebar__group"]} key={item.label}>
                <button
                  aria-expanded={expanded}
                  className={`${styles["sidebar__item"]} ${worldActive ? styles["sidebar__item--active"] : ""}`}
                  onClick={() => {
                    playSidebarFlip();
                    setWorldExpanded((prev) => !prev);
                  }}
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
                    const childActive = isExactPath(pathname, child.href);

                    return (
                      <Link
                        className={`${styles["sidebar__child-item"]} ${childActive ? styles["sidebar__child-item--active"] : ""}`}
                        href={child.href}
                        onClick={() => {
                          playSidebarFlip();
                          closeMobileMenu();
                        }}
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
          onClick={() => {
            playSidebarFlip();
            setMobileOpen(false);
          }}
          type="button"
        />
      ) : null}
    </>
  );
}
