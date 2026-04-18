"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

import { resolvePublicAssetPath } from "@/lib/asset-path";
import { hasRole } from "@/lib/auth/rbac";

import PermissionGate from "@/components/erp/PermissionGate/PermissionGate";

import styles from "./ERPSidebar.module.css";

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const MAIN_NAV_ITEMS: NavItem[] = [
  { href: "/erp", label: "대시보드", icon: "◈" },
  { href: "/erp/sessions", label: "세션", icon: "◉" },
  { href: "/erp/characters", label: "캐릭터", icon: "⚔" },
  { href: "/erp/personnel", label: "신원 조회", icon: "⊕" },
  { href: "/erp/wiki", label: "위키", icon: "☰" },
  { href: "/erp/credits", label: "크레딧", icon: "◇" },
  { href: "/erp/inventory", label: "장비", icon: "▣" },
  { href: "/erp/notifications", label: "알림", icon: "⚡" },
  { href: "/erp/profile", label: "프로필", icon: "◎" },
];

const ADMIN_NAV_ITEMS: NavItem[] = [
  { href: "/erp/admin/users", label: "사용자 관리", icon: "⚙" },
  { href: "/erp/admin/members", label: "멤버 관리", icon: "✦" },
];

export default function ERPSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const logoSrc = resolvePublicAssetPath("/assets/StarGate_logo.png");

  function isActive(href: string): boolean {
    if (href === "/erp") return pathname === "/erp";
    return pathname.startsWith(href);
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebar__header}>
        <Link href="/erp" className={styles.sidebar__logo}>
          <Image
            className={styles["sidebar__logo-image"]}
            src={logoSrc}
            alt="NOVUS ORDO"
            width={32}
            height={32}
          />
          <span className={styles["sidebar__logo-text"]}>
            <span className={styles["sidebar__logo-title"]}>NOVUS ORDO</span>
            <span className={styles["sidebar__logo-badge"]}>ERP SYSTEM</span>
          </span>
        </Link>
      </div>

      <nav className={styles.sidebar__nav}>
        <div className={styles.sidebar__section}>
          <div className={styles["sidebar__section-title"]}>MENU</div>
          {MAIN_NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.sidebar__item} ${isActive(item.href) ? styles["sidebar__item--active"] : ""}`}
            >
              <span className={styles["sidebar__item-icon"]}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </div>

        <PermissionGate minRole="ADMIN">
          <div className={styles.sidebar__section}>
            <div className={styles["sidebar__section-title"]}>ADMIN</div>
            {ADMIN_NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.sidebar__item} ${isActive(item.href) ? styles["sidebar__item--active"] : ""}`}
              >
                <span className={styles["sidebar__item-icon"]}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            ))}
          </div>
        </PermissionGate>
      </nav>

      <div className={styles.sidebar__footer}>
        <Link href="/" className={styles.sidebar__return}>
          <span>←</span>
          홍보 사이트로 돌아가기
        </Link>
      </div>
    </aside>
  );
}
