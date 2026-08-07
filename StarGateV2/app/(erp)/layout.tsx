import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { isNavPathLocked } from "@/components/erp/nav-config";
import { getActiveSession } from "@/lib/auth/active-session";
import {
  hasPlayerServiceTestAccess,
  hasPlayerServiceTestPathAccess,
} from "@/lib/auth/player-service-test-access";
import {
  findDisplayCharacterLiteByOwnerCached as findDisplayCharacterByOwner,
  findMainCharacterDisplayLiteByOwnerCached as findMainCharacterByOwner,
} from "@/lib/db/characters";
import { getErpPageLockOverrides } from "@/lib/db/erp-page-locks";
import { getRealtimeClientMode } from "@/lib/realtime/config";

import SessionWrapper from "@/components/erp/SessionWrapper";
import QueryProvider from "@/components/erp/QueryProvider";
import RealtimeProvider from "@/components/erp/RealtimeProvider";
import ERPSidebar from "@/components/erp/ERPSidebar/ERPSidebar";
import CommandKDeferred from "@/components/erp/CommandK/CommandKDeferred";
import NavPendingProvider from "@/components/erp/NavPending/NavPendingProvider";
import PageLockControl from "@/components/erp/PageLockControl/PageLockControl";
import PageLockGate from "@/components/erp/PageLockControl/PageLockGate";
import { PageHeadProvider } from "@/components/ui/PageHead/PageHeadContext";

import styles from "./layout.module.css";
import ERPHeader from "./ERPHeader";

/**
 * ERP 트리는 항상 dynamic 렌더 — auth() 결과가 cache 되어 로그아웃 사용자에게
 * stale 인증 페이지가 노출되는 사고 방지. middleware + page 가드와 함께
 * defense-in-depth 의 가장 바깥 가드.
 */
export const dynamic = "force-dynamic";

export default async function ERPLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getActiveSession();

  if (!session?.user) {
    redirect("/login");
  }

  const requestHeaders = await headers();
  const pathname = requestHeaders.get("x-stargate-erp-pathname") ?? "/erp";
  const bypassPageLocks =
    requestHeaders.get("x-stargate-erp-local-access") === "1";
  const playerServiceTestAccess = hasPlayerServiceTestAccess(session.user);
  const bypassCurrentPageLock =
    bypassPageLocks ||
    hasPlayerServiceTestPathAccess(session.user, pathname);
  const headerCharacterPromise =
    session.user.role === "GM"
      ? findDisplayCharacterByOwner(session.user.id)
      : findMainCharacterByOwner(session.user.id);
  const [displayCharacter, pageLockOverrides] = await Promise.all([
    headerCharacterPromise,
    getErpPageLockOverrides(),
  ]);
  const headerIdentity = displayCharacter
    ? {
        name: displayCharacter.lore.name || displayCharacter.codename,
        agentLevel: displayCharacter.agentLevel ?? null,
      }
    : null;
  const pageLocked =
    !bypassCurrentPageLock &&
    session.user.role !== "GM" &&
    isNavPathLocked(pathname, pageLockOverrides);
  const initialPageLocks = { overrides: pageLockOverrides };
  const realtimeClientMode = getRealtimeClientMode();

  return (
    <SessionWrapper session={session}>
      <QueryProvider>
        <RealtimeProvider mode={realtimeClientMode}>
          <PageHeadProvider>
            <NavPendingProvider>
              <div className={styles.erp} data-scope="erp">
                <ERPHeader user={session.user} identity={headerIdentity} />
                <div className={styles.erp__body}>
                  <ERPSidebar
                    initialPageLocks={initialPageLocks}
                    bypassPageLocks={bypassPageLocks}
                  />
                  <main className={styles.erp__main}>
                    <PageLockGate
                      initialPageLocks={initialPageLocks}
                      role={session.user.role}
                      bypassPageLocks={bypassPageLocks}
                      playerServiceTestAccess={playerServiceTestAccess}
                      serverBlocked={pageLocked}
                      serverPathname={pathname}
                    >
                      {children}
                    </PageLockGate>
                  </main>
                </div>
                {session.user.role === "GM" ? (
                  <PageLockControl initialPageLocks={initialPageLocks} />
                ) : null}
                <CommandKDeferred bypassPageLocks={bypassPageLocks} />
              </div>
            </NavPendingProvider>
          </PageHeadProvider>
        </RealtimeProvider>
      </QueryProvider>
    </SessionWrapper>
  );
}
