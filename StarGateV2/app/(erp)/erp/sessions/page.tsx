import { redirect } from "next/navigation";

import {
  findMergedSessionsByGuildInMonth,
} from "@/lib/db/sessions";
import { getTrpgWebBaseUrl } from "@/lib/db/trpg-sessions-bridge";
import { getUpcomingSessionsResponse } from "@/lib/erp/upcoming-sessions";
import { getActiveSession } from "@/lib/auth/active-session";
import { hasRole } from "@/lib/auth/rbac";
import { projectSessionsForGuest } from "@/lib/session-guest-view";

import type { SerializedSession } from "@/hooks/queries/useSessionsQuery";
import type { UpcomingSessionLink } from "@/types/erp-realtime";
import {
  parseDashboardSessionTarget,
  type DashboardSessionSearchParams,
} from "@/types/dashboard-sessions";

import Box from "@/components/ui/Box/Box";
import PageHead from "@/components/ui/PageHead/PageHead";

import SessionsClient from "./SessionsClient";

import styles from "./page.module.css";

interface SessionsPageProps {
  searchParams: Promise<DashboardSessionSearchParams>;
}

export default async function SessionsPage({ searchParams }: SessionsPageProps) {
  const session = await getActiveSession();

  if (!session?.user) {
    redirect("/login");
  }

  const rawSearchParams = await searchParams;
  const sessionTarget = parseDashboardSessionTarget(rawSearchParams);
  const hasSessionTargetParams = ["sessionId", "source", "date"].some(
    (key) => rawSearchParams[key as keyof DashboardSessionSearchParams] !== undefined,
  );
  const sessionTargetInvalid = hasSessionTargetParams && sessionTarget === null;
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = sessionTarget?.year ?? kstNow.getUTCFullYear();
  const month = sessionTarget?.month ?? kstNow.getUTCMonth() + 1;
  const guildId = process.env.GUILD_ID ?? "";

  let serializedSessions: SerializedSession[] = [];
  let initialUpcoming: UpcomingSessionLink[] = [];

  if (guildId) {
    try {
      // findMergedSessionsByGuildInMonth: registra + trpg 합본을 SerializedSession 으로 직렬화.
      const [mergedSessions, upcomingResponse] = await Promise.all([
        findMergedSessionsByGuildInMonth(
          guildId,
          year,
          month - 1,
          session.user.discordId,
        ),
        session.user.isGuest
          ? Promise.resolve({ sessions: [] })
          : getUpcomingSessionsResponse(guildId),
      ]);
      serializedSessions = session.user.isGuest
        ? projectSessionsForGuest(mergedSessions)
        : mergedSessions;
      initialUpcoming = upcomingResponse.sessions;
    } catch (err) {
      console.error("[SessionsPage] initial fetch failed", err);
    }
  }

  if (!guildId) {
    return (
      <>
        <PageHead breadcrumb="ERP / SESSIONS" title="세션" />
        <Box>
          <div className={styles.empty}>
            GUILD_ID 환경변수가 설정되지 않았습니다.
          </div>
        </Box>
      </>
    );
  }

  return (
    <SessionsClient
      key={
        sessionTarget
          ? `${sessionTarget.source}:${sessionTarget.sessionId}:${sessionTarget.date}`
          : "sessions-default"
      }
      initialSessions={serializedSessions}
      initialNow={now.toISOString()}
      initialYear={year}
      initialMonth={month}
      initialSessionTarget={sessionTarget}
      initialSessionTargetInvalid={sessionTargetInvalid}
      guildId={session.user.isGuest ? "guest" : guildId}
      initialUpcoming={initialUpcoming}
      canCreateReport={hasRole(session.user.role, "V")}
      trpgWebBaseUrl={session.user.isGuest ? null : getTrpgWebBaseUrl()}
      guestReadOnly={session.user.isGuest}
    />
  );
}
