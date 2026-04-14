"use client";

import { signOut } from "next-auth/react";

import type { UserRole } from "@/types/user";

import styles from "./layout.module.css";

interface ERPHeaderProps {
  user: {
    displayName: string;
    role: UserRole;
  };
}

export default function ERPHeader({ user }: ERPHeaderProps) {
  function handleLogout() {
    signOut({ callbackUrl: "/login" });
  }

  return (
    <header className={styles.erp__header}>
      <div className={styles["erp__user-info"]}>
        <span className={styles["erp__user-name"]}>{user.displayName}</span>
        <span className={styles["erp__user-role"]}>{user.role}</span>
      </div>
      <button
        className={styles.erp__logout}
        type="button"
        onClick={handleLogout}
      >
        로그아웃
      </button>
    </header>
  );
}
