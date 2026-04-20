"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

import { hasRole } from "@/lib/auth/rbac";

import type { NavItem } from "@/components/erp/nav-config";
import { NAV_GROUPS } from "@/components/erp/nav-config";
import { IconChevronLeft } from "@/components/icons";

import styles from "./ERPSidebar.module.css";

const SIDEBAR_OPEN_EVENT = "no:sidebar-open";

export default function ERPSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const [isOpen, setIsOpen] = useState(false);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  useEffect(() => {
    function handleOpen() {
      setIsOpen(true);
    }

    window.addEventListener(SIDEBAR_OPEN_EVENT, handleOpen);

    return () => {
      window.removeEventListener(SIDEBAR_OPEN_EVENT, handleOpen);
    };
  }, []);

  function isItemActive(item: NavItem): boolean {
    if (!item.href) return false;
    if (item.href === "/erp") return pathname === "/erp";
    return pathname.startsWith(item.href);
  }

  const role = session?.user?.role;

  return (
    <>
      <div
        className={[
          styles.sidebar__backdrop,
          isOpen ? styles["sidebar__backdrop--open"] : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={close}
        aria-hidden
      />
      <aside
        className={[styles.sidebar, isOpen ? styles["sidebar--open"] : ""]
          .filter(Boolean)
          .join(" ")}
      >
        {NAV_GROUPS.map((group) => {
          if (group.minRole && (!role || !hasRole(role, group.minRole))) {
            return null;
          }

          return (
            <div key={group.key} className={styles.sidebar__group}>
              <div className={styles.sidebar__groupLabel}>{group.label}</div>
              {group.items.map((item) => {
                const active = isItemActive(item);
                const disabled = item.href === null;
                const Icon = item.icon;

                if (disabled) {
                  return (
                    <span
                      key={`${group.key}-${item.label}`}
                      className={[
                        styles.sidebar__item,
                        styles["sidebar__item--disabled"],
                      ].join(" ")}
                      aria-disabled
                    >
                      <span className={styles.sidebar__itemLeft}>
                        <span className={styles.sidebar__icon} aria-hidden>
                          <Icon />
                        </span>
                        <span className={styles.sidebar__itemLabel}>
                          {item.label}
                        </span>
                      </span>
                      <span className={styles.sidebar__badge}>준비중</span>
                    </span>
                  );
                }

                return (
                  <Link
                    key={`${group.key}-${item.label}`}
                    href={item.href as string}
                    className={[
                      styles.sidebar__item,
                      active ? styles["sidebar__item--active"] : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={close}
                  >
                    <span className={styles.sidebar__itemLeft}>
                      <span className={styles.sidebar__icon} aria-hidden>
                        <Icon />
                      </span>
                      <span className={styles.sidebar__itemLabel}>
                        {item.label}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          );
        })}

        <div className={styles.sidebar__footer}>
          <Link href="/" className={styles.sidebar__return}>
            <IconChevronLeft aria-hidden />
            홍보 사이트로 돌아가기
          </Link>
        </div>
      </aside>
    </>
  );
}
