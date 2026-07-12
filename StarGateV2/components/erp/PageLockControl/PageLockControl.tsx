"use client";

import { useMemo } from "react";

import { usePathname } from "next/navigation";

import type { PageLocksResponse } from "@/hooks/queries/usePageLocksQuery";

import { useSetPageLock } from "@/hooks/mutations/usePageLockMutation";
import { usePageLocks } from "@/hooks/queries/usePageLocksQuery";

import {
  getNavItemLockKey,
  isNavItemLocked,
  resolveNavItemForPath,
} from "@/components/erp/nav-config";

import styles from "./PageLockControl.module.css";

interface PageLockControlProps {
  initialPageLocks: PageLocksResponse;
}

export default function PageLockControl({
  initialPageLocks,
}: PageLockControlProps) {
  const pathname = usePathname();
  const isAcheronForge = pathname.startsWith("/erp/equipment-shop/acheron");
  const { data: pageLocks } = usePageLocks({ initialData: initialPageLocks });
  const setPageLock = useSetPageLock();

  const item = useMemo(() => resolveNavItemForPath(pathname), [pathname]);
  const lockKey = item ? getNavItemLockKey(item) : null;
  const locked = item
    ? isNavItemLocked(item, pageLocks?.overrides)
    : false;

  if (!item || !lockKey) return null;

  return (
    <aside
      className={[
        styles.control,
        isAcheronForge ? styles["control--acheron"] : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label="운영 페이지 잠금 설정"
    >
      <span className={styles.control__copy}>
        <small>운영 잠금</small>
        <strong>{item.label}</strong>
      </span>
      <button
        type="button"
        className={[
          styles.control__switch,
          locked ? styles["control__switch--locked"] : "",
        ]
          .filter(Boolean)
          .join(" ")}
        role="switch"
        aria-checked={locked}
        aria-label={`${item.label} 페이지 잠금 ${locked ? "해제" : "설정"}`}
        disabled={setPageLock.isPending}
        onClick={() => setPageLock.mutate({ lockKey, locked: !locked })}
      >
        <span aria-hidden />
        {setPageLock.isPending ? "처리중" : locked ? "ON" : "OFF"}
      </button>
      {setPageLock.error ? (
        <span className={styles.control__error} role="alert">
          {setPageLock.error.message}
        </span>
      ) : null}
    </aside>
  );
}
