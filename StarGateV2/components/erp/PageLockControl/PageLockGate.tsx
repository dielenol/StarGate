"use client";

import { useEffect, useMemo } from "react";

import { usePathname, useRouter } from "next/navigation";

import type { UserRole } from "@/types/user";
import type { PageLocksResponse } from "@/hooks/queries/usePageLocksQuery";

import { usePageLocks } from "@/hooks/queries/usePageLocksQuery";

import {
  isNavPathLocked,
  resolveNavItemForPath,
} from "@/components/erp/nav-config";

import PageLockedState from "./PageLockedState";

interface PageLockGateProps {
  children: React.ReactNode;
  initialPageLocks: PageLocksResponse;
  role: UserRole;
  serverBlocked: boolean;
  serverPathname: string;
}

export default function PageLockGate({
  children,
  initialPageLocks,
  role,
  serverBlocked,
  serverPathname,
}: PageLockGateProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: pageLocks } = usePageLocks({ initialData: initialPageLocks });

  const currentItem = useMemo(
    () => resolveNavItemForPath(pathname),
    [pathname],
  );
  const clientLocked =
    role !== "GM" && isNavPathLocked(pathname, pageLocks?.overrides);
  const waitingForServerRefresh =
    serverBlocked && pathname === serverPathname && !clientLocked;

  useEffect(() => {
    if (waitingForServerRefresh) router.refresh();
  }, [router, waitingForServerRefresh]);

  if (clientLocked || (serverBlocked && pathname === serverPathname)) {
    return <PageLockedState label={currentItem?.label ?? "페이지"} />;
  }

  return children;
}
