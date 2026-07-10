import { redirect } from "next/navigation";

import {
  findMergedSessionsByGuildInMonth,
  findUpcomingSessionsByGuild,
} from "@/lib/db/sessions";
import { getTrpgWebBaseUrl } from "@/lib/db/trpg-sessions-bridge";
import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";

import type { SerializedSession } from "@/hooks/queries/useSessionsQuery";

import Box from "@/components/ui/Box/Box";
import PageHead from "@/components/ui/PageHead/PageHead";

import SessionsClient from "./SessionsClient";

import styles from "./page.module.css";

const UPCOMING_OPEN_LIMIT = 5;

/** 사이드 "OPEN · 임박" 카드에서 사용하는 경량 세션 링크 형태. */
export interface UpcomingSessionLink {
  _id: string;
  title: string;
  targetDateTime: string;
  guildId: string;
  channelId: string;
  messageId: string;
}

export default async function SessionsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const guildId = process.env.GUILD_ID ?? "";

  let serializedSessions: SerializedSession[] = [];
  let initialUpcoming: UpcomingSessionLink[] = [];

  if (guildId) {
    try {
      // findMergedSessionsByGuildInMonth: registra + trpg 합본을 SerializedSession 으로 직렬화.
      // findUpcomingSessionsByGuild: registra 임박 세션 (trpg 는 디스코드 채널 링크 모델이 없어 별도 표시 안 함).
      const [mergedSessions, rawUpcoming] = await Promise.all([
        findMergedSessionsByGuildInMonth(
          guildId,
          year,
          month - 1,
          session.user.discordId,
        ),
        findUpcomingSessionsByGuild(guildId, UPCOMING_OPEN_LIMIT),
      ]);
      serializedSessions = mergedSessions;

      initialUpcoming = rawUpcoming.map((s) => ({
        _id: s._id?.toString() ?? "",
        title: s.title,
        targetDateTime: new Date(s.targetDateTime).toISOString(),
        guildId: s.guildId,
        channelId: s.channelId,
        messageId: s.messageId,
      }));
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
      initialSessions={serializedSessions}
      initialYear={year}
      initialMonth={month}
      guildId={guildId}
      initialUpcoming={initialUpcoming}
      canCreateReport={hasRole(session.user.role, "V")}
      trpgWebBaseUrl={getTrpgWebBaseUrl()}
    />
  );
}
