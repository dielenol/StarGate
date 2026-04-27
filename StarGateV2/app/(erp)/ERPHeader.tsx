"use client";

import Image from "next/image";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useSyncExternalStore } from "react";

import type { UserRole } from "@/types/user";

import { resolvePublicAssetPath } from "@/lib/asset-path";

import styles from "./ERPHeader.module.css";

interface ERPHeaderProps {
  user: {
    displayName: string;
    role: UserRole;
  };
}

/**
 * 플랫폼 감지 — cmdk 단축키 라벨을 맥(⌘K) / 윈도우·리눅스(Ctrl K) 로 분기.
 * CommandK 핸들러는 이미 metaKey || ctrlKey 둘 다 처리하므로 기능 차이는 없음.
 */
function detectIsMac(): boolean {
  if (typeof navigator === "undefined") return true;
  const uaData = (navigator as Navigator & {
    userAgentData?: { platform?: string };
  }).userAgentData;
  const source = uaData?.platform ?? navigator.userAgent;
  return /Mac|iPhone|iPad|iPod/i.test(source);
}

/* useSyncExternalStore 용 상수 핸들러 (렌더 중 새 참조 방지) */
const subscribePlatform = () => () => {};
const getClientKbdLabel = () => (detectIsMac() ? "⌘K" : "Ctrl K");
const getServerKbdLabel = () => "⌘K";

export default function ERPHeader({ user }: ERPHeaderProps) {
  const logoSrc = resolvePublicAssetPath("/assets/StarGate_logo.png");

  // SSR 스냅샷은 "⌘K", 클라이언트 hydrate 시점에 플랫폼 감지 결과로 교체.
  const kbdLabel = useSyncExternalStore(
    subscribePlatform,
    getClientKbdLabel,
    getServerKbdLabel,
  );

  function handleOpenSidebar() {
    window.dispatchEvent(new CustomEvent("no:sidebar-open"));
  }

  function handleOpenCmdK() {
    window.dispatchEvent(new CustomEvent("no:cmdk-open"));
  }

  async function handleLogout() {
    try {
      await signOut({ callbackUrl: "/login" });
    } catch (error) {
      console.error("logout failed", error);
    }
  }

  return (
    <header className={styles.header}>
      <button
        type="button"
        className={styles.header__burger}
        onClick={handleOpenSidebar}
        aria-label="메뉴 열기"
      >
        ☰
      </button>

      <Link href="/erp" className={styles.header__brand} aria-label="ERP 홈">
        <Image
          className={styles.header__logo}
          src={logoSrc}
          alt="NOVUS ORDO"
          width={44}
          height={44}
          priority
        />
        <div className={styles.header__brandText}>
          <span className={styles.header__brandName}>NOVUS ORDO</span>
          <span className={styles.header__brandDivider} aria-hidden>
            │
          </span>
          <span className={styles.header__brandSub}>ERP · INTERNAL</span>
        </div>
      </Link>

      <div className={styles.header__status} aria-label="운영 상태">
        <span className={styles.header__statusDot} aria-hidden />
        <span>OPERATIONAL</span>
        <span className={styles.header__statusSep}>│</span>
        <span>SEOUL-03</span>
        <span className={styles.header__statusSep}>│</span>
        <span>DISCORD · SYNC</span>
      </div>

      <div className={styles.header__right}>
        <button
          type="button"
          className={styles.header__cmdk}
          onClick={handleOpenCmdK}
          aria-label="명령 팔레트 열기"
        >
          <span className={styles.header__cmdkIcon} aria-hidden>
            ⌕
          </span>
          <span className={styles.header__cmdkPlaceholder}>
            검색 — codename · 부서 · 세션 · 위키 …
          </span>
          <kbd className={styles.header__cmdkKbd}>{kbdLabel}</kbd>
        </button>

        <div className={styles.header__user}>
          <span className={styles.header__userName}>{user.displayName}</span>
          <span className={styles.header__userRole} data-rank={user.role}>
            {user.role}
          </span>
          <button
            type="button"
            className={styles.header__logout}
            onClick={handleLogout}
          >
            로그아웃
          </button>
        </div>
      </div>
    </header>
  );
}
