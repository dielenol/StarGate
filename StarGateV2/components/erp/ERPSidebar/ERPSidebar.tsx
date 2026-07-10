"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import type { NavItem } from "@/components/erp/nav-config";

import { useNotificationSummary } from "@/hooks/queries/useNotificationsQuery";

import {
  getNavItemActiveHrefs,
  getNavItemHref,
  isPreparingNavItem,
  NAV_GROUPS,
} from "@/components/erp/nav-config";
import LinkPendingProbe from "@/components/erp/NavPending/LinkPendingProbe";
import { IconCheckDot, IconChevronLeft } from "@/components/icons";

import { hasRole } from "@/lib/auth/rbac";

import styles from "./ERPSidebar.module.css";

const SIDEBAR_OPEN_EVENT = "no:sidebar-open";
const SIDEBAR_STATE_EVENT = "no:sidebar-state";

const ALL_NAV_HREFS: string[] = NAV_GROUPS.flatMap((group) =>
  group.items.flatMap(getNavItemActiveHrefs),
);

export default function ERPSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const { data: notificationSummary } = useNotificationSummary();

  const [isOpen, setIsOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const sidebarRef = useRef<HTMLElement | null>(null);

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

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(SIDEBAR_STATE_EVENT, { detail: { open: isOpen } }),
    );
  }, [isOpen]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1279px)");
    const syncViewport = () => {
      setIsMobileViewport(media.matches);
      if (!media.matches) setIsOpen(false);
    };
    syncViewport();
    media.addEventListener("change", syncViewport);
    return () => media.removeEventListener("change", syncViewport);
  }, []);

  useEffect(() => {
    if (!isMobileViewport || !isOpen || !sidebarRef.current) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusable = sidebarRef.current.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !sidebarRef.current) return;
      const items = Array.from(
        sidebarRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      document.getElementById("erp-sidebar-trigger")?.focus();
    };
  }, [close, isMobileViewport, isOpen]);

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
    return activeHref !== null && getNavItemActiveHrefs(item).includes(activeHref);
  }

  const role = session?.user?.role;
  const unreadNotificationCount = notificationSummary?.unreadCount ?? 0;
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
        id="erp-navigation-drawer"
        ref={sidebarRef}
        aria-label="ERP 주요 메뉴"
        aria-hidden={isMobileViewport && !isOpen}
        aria-modal={isMobileViewport ? isOpen : undefined}
        className={[styles.sidebar, isOpen ? styles["sidebar--open"] : ""]
          .filter(Boolean)
          .join(" ")}
        inert={isMobileViewport && !isOpen}
        role={isMobileViewport ? "dialog" : undefined}
      >
        <button
          aria-label="메뉴 닫기"
          className={styles.sidebar__close}
          onClick={close}
          type="button"
        >
          <IconChevronLeft aria-hidden />
        </button>
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
                const href = getNavItemHref(item, role);
                const active = isItemActive(item);
                const preparing = isPreparingNavItem(item);
                const disabled = href === null;
                const Icon = item.icon;
                const childItems = (item.children ?? []).filter(
                  (child) =>
                    !child.minRole ||
                    (role ? hasRole(role, child.minRole) : false),
                );
                const showChildren = active && childItems.length > 0;
                const notificationBadge =
                  href === "/erp/notifications" &&
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
                  <div
                    key={`${group.key}-${item.label}`}
                    className={styles.sidebar__itemBlock}
                  >
                    <Link
                      href={href}
                      className={[
                        styles.sidebar__item,
                        active ? styles["sidebar__item--active"] : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={close}
                      onFocus={() => prefetchHref(href)}
                      onMouseEnter={() => prefetchHref(href)}
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
                      ) : preparing ? (
                        <span className={styles.sidebar__badge}>준비중</span>
                      ) : active ? (
                        <IconCheckDot
                          className={styles.sidebar__activeMark}
                          aria-hidden
                        />
                      ) : null}
                    </Link>

                    {showChildren ? (
                      <div
                        className={styles.sidebar__subList}
                        aria-label={`${item.label} 하위 메뉴`}
                      >
                        {childItems.map((child) => {
                          const childHref = getNavItemHref(child, role);
                          if (childHref === null) return null;
                          const ChildIcon = child.icon;
                          const childActive =
                            activeHref !== null &&
                            getNavItemActiveHrefs(child).includes(activeHref);

                          return (
                            <Link
                              key={`${group.key}-${item.label}-${child.label}`}
                              href={childHref}
                              className={[
                                styles.sidebar__subItem,
                                childActive
                                  ? styles["sidebar__subItem--active"]
                                  : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              onClick={close}
                              onFocus={() => prefetchHref(childHref)}
                              onMouseEnter={() => prefetchHref(childHref)}
                              prefetch
                            >
                              <LinkPendingProbe />
                              <span
                                className={styles.sidebar__subItemIcon}
                                aria-hidden
                              >
                                <ChildIcon />
                              </span>
                              <span className={styles.sidebar__subItemLabel}>
                                {child.label}
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
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
