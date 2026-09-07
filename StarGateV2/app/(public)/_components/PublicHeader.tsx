"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import {
  IconArrowLeft,
  IconArrowRight,
  IconClose,
  IconMenu,
  IconNotes,
  IconPlayer,
  IconRules,
  IconSearch,
  IconWorld,
} from "@/components/icons";
import { resolvePublicAssetPath } from "@/lib/asset-path";

import styles from "./PublicHeader.module.css";

const PRIMARY_PAGES = [
  {
    href: "/world",
    label: "세계관 기록",
    description: "노부스 오르도의 역사와 세계관",
    category: "WORLD",
    icon: IconWorld,
  },
  {
    href: "/world/player",
    label: "플레이어",
    description: "이 세계를 함께 만드는 인물들",
    category: "PERSONNEL",
    icon: IconPlayer,
  },
  {
    href: "/gameplay",
    label: "작전 내규",
    description: "세션 참여와 플레이 안내",
    category: "OPERATIONS",
    icon: IconNotes,
  },
  {
    href: "/rules",
    label: "노부스 오르도 룰",
    description: "캐릭터와 전투 규칙",
    category: "RULES",
    icon: IconRules,
  },
];

const PAGES = [
  {
    href: "/",
    label: "기밀 아카이브",
    description: "노부스 오르도 소개",
    category: "ARCHIVE",
  },
  ...PRIMARY_PAGES,
  {
    href: "/erp",
    label: "운영 시스템",
    description: "ERP · 요원 업무 공간",
    category: "SYSTEM",
  },
  {
    href: "/apply",
    label: "입회 심사 신청",
    description: "신규 신청 마감 · 기존 안내 열람",
    category: "CLOSED",
  },
  {
    href: "/contact",
    label: "기밀 문의 접수",
    description: "신규 문의 마감 · 기존 안내 열람",
    category: "CLOSED",
  },
];

export default function PublicHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const activeSection =
    PRIMARY_PAGES.find((page) => pathname === page.href) ??
    PRIMARY_PAGES.find((page) => pathname.startsWith(`${page.href}/`));
  const currentLabel =
    PAGES.find((page) => page.href === pathname)?.label ??
    (pathname === "/world/b"
      ? "세계관 B"
      : pathname === "/world/c"
        ? "세계관 C"
        : "기록 열람");
  const worldChild = pathname.startsWith("/world/");
  const previousPathRef = useRef(pathname);
  const navigationDepthRef = useRef(0);
  const [panel, setPanel] = useState<"menu" | "search" | null>(null);
  const [query, setQuery] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const term = query.trim().toLocaleLowerCase();
  const results = PAGES.filter((page) =>
    `${page.label} ${page.description} ${page.category}`
      .toLocaleLowerCase()
      .includes(term),
  );

  useEffect(() => {
    // Mark our public entries without replacing Next.js's own history fields.
    // history.length also counts the blank/external entry before a direct visit.
    const state = window.history.state;
    const entry = state?.novusPublicNavigation;
    const storedDepth =
      entry?.pathname === pathname &&
      Number.isSafeInteger(entry.depth) &&
      entry.depth >= 0
        ? (entry.depth as number)
        : undefined;
    const depth =
      storedDepth ??
      (previousPathRef.current === pathname ? 0 : navigationDepthRef.current + 1);
    window.history.replaceState(
      { ...state, novusPublicNavigation: { pathname, depth } },
      "",
    );
    previousPathRef.current = pathname;
    navigationDepthRef.current = depth;
  }, [pathname]);

  useEffect(() => {
    function handleShortcut(event: globalThis.KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || event.isComposing) return;
      const command =
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "k";
      const slash =
        event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey;
      if (!command && !slash) return;
      const active = document.activeElement;
      const editing =
        active instanceof Element &&
        !!active.closest(
          "input, textarea, select, [contenteditable]:not([contenteditable='false'])",
        );
      if (slash && editing) return;
      if (panel) {
        if (command && panel === "search") {
          event.preventDefault();
          setPanel(null);
        }
        return;
      }
      if (document.querySelector("dialog[open]")) return;
      event.preventDefault();
      triggerRef.current =
        active instanceof HTMLElement && active !== document.body
          ? active
          : searchTriggerRef.current;
      setQuery("");
      setPanel("search");
    }
    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, [panel]);

  useEffect(() => {
    if (!panel) return;
    const dialog = dialogRef.current;
    const trigger = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    if (panel === "search") searchRef.current?.focus();
    else closeRef.current?.focus();
    const closeOnHistory = () => setPanel(null);
    window.addEventListener("popstate", closeOnHistory);

    return () => {
      window.removeEventListener("popstate", closeOnHistory);
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [panel]);

  function openPanel(kind: "menu" | "search", trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    setQuery("");
    setPanel(kind);
  }

  function closePanel() {
    setPanel(null);
  }

  function goBack() {
    if (navigationDepthRef.current > 0) router.back();
    else {
      const fallback = worldChild ? "/world" : "/";
      previousPathRef.current = fallback;
      router.replace(fallback);
    }
  }

  function handleSearchKeys(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    const links =
      resultsRef.current?.querySelectorAll<HTMLAnchorElement>("a[href]");
    if (!links?.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      links[event.key === "ArrowDown" ? 0 : links.length - 1].focus();
    } else if (event.key === "Enter" && links.length === 1) {
      event.preventDefault();
      links[0].click();
    }
  }

  function handleResultKeys(event: KeyboardEvent<HTMLElement>) {
    if (
      panel !== "search" ||
      !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
    )
      return;
    const links = Array.from(
      resultsRef.current?.querySelectorAll<HTMLAnchorElement>("a[href]") ?? [],
    );
    const index = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (index < 0) return;
    event.preventDefault();
    if (event.key === "Home") links[0]?.focus();
    else if (event.key === "End") links.at(-1)?.focus();
    else if (event.key === "ArrowUp" && index === 0) searchRef.current?.focus();
    else
      links[
        (index + (event.key === "ArrowDown" ? 1 : -1) + links.length) %
          links.length
      ]?.focus();
  }

  return (
    <>
      <header
        className={styles.header}
        data-document={pathname !== "/" ? "true" : undefined}
      >
        <div className={styles.header__main}>
          <Link href="#public-content" className={styles.header__skip}>
            본문으로 건너뛰기
          </Link>
          <Link
            href="/"
            className={styles.header__brand}
            aria-label="NOVUS ORDO 홈"
          >
            <Image
              src={resolvePublicAssetPath("/assets/StarGate_logo.webp")}
              alt=""
              width={38}
              height={38}
            />
            <span>
              NOVUS ORDO
              <span className={styles.header__subline}>OFFICIAL ARCHIVE</span>
            </span>
          </Link>
          <nav className={styles.header__nav} aria-label="주요 메뉴">
            {PRIMARY_PAGES.map((page) => (
              <Link
                key={page.href}
                href={page.href}
                aria-current={
                  activeSection?.href === page.href
                    ? pathname === page.href
                      ? "page"
                      : "location"
                    : undefined
                }
              >
                <span className={styles.header__navIcon} aria-hidden="true">
                  <page.icon />
                </span>
                <span className={styles.header__navCopy}>
                  <span>{page.label}</span>
                  <span className={styles.header__navCaption} aria-hidden="true">
                    {page.category}
                  </span>
                </span>
              </Link>
            ))}
          </nav>
          <div className={styles.header__actions}>
            <button
              ref={searchTriggerRef}
              type="button"
              className={styles.header__icon}
              aria-label="페이지 찾기"
              aria-keyshortcuts="Control+k Meta+k /"
              title="페이지 찾기 (Ctrl/⌘ K 또는 /)"
              aria-haspopup="dialog"
              aria-controls="public-navigation-panel"
              onClick={(event) => openPanel("search", event.currentTarget)}
            >
              <IconSearch aria-hidden />
            </button>
            <Link href="/erp" prefetch={false} className={styles.header__erp}>
              ERP 진입 <IconArrowRight aria-hidden />
            </Link>
            <button
              type="button"
              className={styles.header__icon}
              aria-label="전체 메뉴 열기"
              aria-haspopup="dialog"
              aria-expanded={panel === "menu"}
              aria-controls="public-navigation-panel"
              onClick={(event) => openPanel("menu", event.currentTarget)}
            >
              <IconMenu aria-hidden />
            </button>
          </div>
        </div>
        {pathname !== "/" && (
          <nav className={styles.context} aria-label="현재 위치">
            <button
              type="button"
              className={styles.context__back}
              onClick={goBack}
              aria-label="이전 페이지로"
            >
              <IconArrowLeft aria-hidden /> 이전
            </button>
            <ol className={styles.context__path}>
              <li>
                <Link href="/">메인</Link>
              </li>
              {worldChild && (
                <li>
                  <Link href="/world">세계관</Link>
                </li>
              )}
              <li aria-current="page">
                <span className={styles.context__current} title={currentLabel}>
                  {currentLabel}
                </span>
              </li>
            </ol>
          </nav>
        )}
      </header>
      <dialog
        id="public-navigation-panel"
        ref={dialogRef}
        className={styles.panel}
        aria-labelledby="public-panel-title"
        onCancel={closePanel}
        onClick={(event) => {
          if (event.target === event.currentTarget) closePanel();
        }}
      >
        <div className={styles.panel__inner}>
          <div className={styles.panel__head}>
            <div>
              <span className={styles.panel__eyebrow}>
                NOVUS ORDO / DIRECTORY
              </span>
              <h2 id="public-panel-title">
                {panel === "search" ? "페이지 찾기" : "기록을 탐색하세요."}
              </h2>
            </div>
            <button
              ref={closeRef}
              type="button"
              className={styles.header__icon}
              aria-label="메뉴 닫기"
              onClick={closePanel}
            >
              <IconClose aria-hidden />
            </button>
          </div>
          {panel === "search" && (
            <div className={styles.panel__search}>
              <label htmlFor="public-page-search">
                페이지 이름이나 주제로 찾기
              </label>
              <input
                ref={searchRef}
                id="public-page-search"
                type="search"
                value={query}
                placeholder="세계관, 플레이어, 규칙, ERP…"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleSearchKeys}
                autoComplete="off"
              />
              <div className={styles.panel__searchMeta}>
                <p role="status">{results.length}개의 페이지</p>
                <span>↑ ↓ 이동 · Enter 열람 · Esc 닫기</span>
              </div>
            </div>
          )}
          <nav
            ref={resultsRef}
            onKeyDown={handleResultKeys}
            className={styles.panel__links}
            aria-label={panel === "search" ? "페이지 검색 결과" : "전체 메뉴"}
          >
            {(panel === "search" ? results : PAGES).map((page) => (
              <Link
                key={page.href}
                href={page.href}
                prefetch={false}
                onClick={closePanel}
                aria-current={pathname === page.href ? "page" : undefined}
                className={styles.panel__link}
              >
                <span>
                  <span className={styles.panel__category}>
                    {page.category}
                  </span>
                  <span className={styles.panel__label}>{page.label}</span>
                  <span className={styles.panel__description}>
                    {page.description}
                  </span>
                </span>
                <IconArrowRight aria-hidden />
              </Link>
            ))}
            {panel === "search" && results.length === 0 && (
              <p className={styles.panel__empty}>
                일치하는 페이지가 없습니다. 다른 이름이나 주제로 찾아보세요.
              </p>
            )}
          </nav>
          <p className={styles.panel__foot}>
            PROPERTY OF NOVUS ORDO CONVENTION
          </p>
        </div>
      </dialog>
    </>
  );
}
