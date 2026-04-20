"use client";

import { signOut } from "next-auth/react";

import type { UserRole } from "@/types/user";

import styles from "./ERPHeader.module.css";

interface ERPHeaderProps {
  user: {
    displayName: string;
    role: UserRole;
  };
}

export default function ERPHeader({ user }: ERPHeaderProps) {
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

      <div className={styles.header__brand}>
        <div className={styles.header__seal} aria-hidden>
          ◎
        </div>
        <div className={styles.header__brandText}>
          <span className={styles.header__brandName}>NOVUS ORDO</span>
          <span className={styles.header__brandSub}>ERP · INTERNAL</span>
        </div>
      </div>

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
          <span>⌕ 검색</span>
          <kbd className={styles.header__cmdkKbd}>⌘K</kbd>
        </button>

        <div className={styles.header__user}>
          <span className={styles.header__userName}>{user.displayName}</span>
          <span className={styles.header__userRole}>{user.role}</span>
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
