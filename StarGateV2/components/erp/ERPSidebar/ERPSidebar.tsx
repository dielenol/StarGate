"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import type { NavItem } from "@/components/erp/nav-config";

import { useNotifications } from "@/hooks/queries/useNotificationsQuery";

import { NAV_GROUPS } from "@/components/erp/nav-config";
import LinkPendingProbe from "@/components/erp/NavPending/LinkPendingProbe";
import { IconCheckDot, IconChevronLeft } from "@/components/icons";

import { hasRole } from "@/lib/auth/rbac";

import styles from "./ERPSidebar.module.css";

const SIDEBAR_OPEN_EVENT = "no:sidebar-open";

const ALL_NAV_HREFS: string[] = NAV_GROUPS.flatMap((group) =>
  group.items
    .map((item) => item.href)
    .filter((href): href is string => href !== null),
);

export default function ERPSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const { data: notifications = [] } = useNotifications();

  const [isOpen, setIsOpen] = useState(false);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const prefetchHref = useCallback(
    (href: string) => {
      router.prefetch(href);
    },
    [router],
  );

  useEffect(() => {
    function handleOpen() {
      setIsOpen(true);
    }

    window.addEventListener(SIDEBAR_OPEN_EVENT, handleOpen);

    return () => {
      window.removeEventListener(SIDEBAR_OPEN_EVENT, handleOpen);
    };
  }, []);

  const activeHref = useMemo(() => {
    let best: string | null = null;
    for (const href of ALL_NAV_HREFS) {
      const matches =
        href === "/erp"
          ? pathname === "/erp"
          : pathname === href || pathname.startsWith(`${href}/`);
      if (matches && (best === null || href.length > best.length)) {
        best = href;
      }
    }
    return best;
  }, [pathname]);

  function isItemActive(item: NavItem): boolean {
    return item.href !== null && item.href === activeHref;
  }

  const role = session?.user?.role;
  const unreadNotificationCount = useMemo(
    () => notifications.filter((notification) => !notification.isRead).length,
    [notifications],
  );
  const unreadNotificationLabel =
    unreadNotificationCount > 99 ? "99+" : String(unreadNotificationCount);

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

          const visibleItems = group.items.filter(
            (item) =>
              !item.minRole || (role ? hasRole(role, item.minRole) : false),
          );

          if (visibleItems.length === 0) return null;

          return (
            <div key={group.key} className={styles.sidebar__group}>
              <div className={styles.sidebar__groupLabel}>{group.label}</div>
              {visibleItems.map((item) => {
                const active = isItemActive(item);
                const disabled = item.href === null;
                const Icon = item.icon;
                const notificationBadge =
                  item.href === "/erp/notifications" &&
                  unreadNotificationCount > 0
                    ? unreadNotificationLabel
                    : null;

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
                    onFocus={() => prefetchHref(item.href as string)}
                    onMouseEnter={() => prefetchHref(item.href as string)}
                    prefetch
                  >
                    <LinkPendingProbe />
                    <span className={styles.sidebar__itemLeft}>
                      <span className={styles.sidebar__icon} aria-hidden>
                        <Icon />
                      </span>
                      <span className={styles.sidebar__itemLabel}>
                        {item.label}
                      </span>
                    </span>
                    {notificationBadge ? (
                      <span
                        className={styles.sidebar__countBadge}
                        aria-label={`안 읽은 알림 ${unreadNotificationCount}건`}
                      >
                        {notificationBadge}
                      </span>
                    ) : active ? (
                      <IconCheckDot
                        className={styles.sidebar__activeMark}
                        aria-hidden
                      />
                    ) : null}
                  </Link>
                );
              })}
            </div>
          );
        })}

        <div className={styles.sidebar__footer}>
          <Link
            href="/"
            className={styles.sidebar__return}
            onFocus={() => prefetchHref("/")}
            onMouseEnter={() => prefetchHref("/")}
            prefetch
          >
            <LinkPendingProbe />
            <IconChevronLeft aria-hidden />
            홍보 사이트로 돌아가기
          </Link>
        </div>
      </aside>
    </>
  );
}
