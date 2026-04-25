import { redirect } from "next/navigation";

import {
  enrichSessions,
  findSessionsByGuildInMonth,
  findUpcomingSessionsByGuild,
} from "@/lib/db/sessions";
import { auth } from "@/lib/auth/config";

import type { SerializedSession } from "@/hooks/queries/useSessionsQuery";

import Box from "@/components/ui/Box/Box";
import Button from "@/components/ui/Button/Button";
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
      // findSessionsByGuildInMonth 는 monthIndex(0~11) 기반
      const [rawMonth, rawUpcoming] = await Promise.all([
        findSessionsByGuildInMonth(guildId, year, month - 1),
        findUpcomingSessionsByGuild(guildId, UPCOMING_OPEN_LIMIT),
      ]);

      const enriched = await enrichSessions(
        rawMonth,
        session.user.discordId,
      );

      serializedSessions = enriched.map(
        ({ raw: s, participants, counts, myRsvp }) => ({
          _id: s._id?.toString() ?? "",
          guildId: s.guildId,
          channelId: s.channelId,
          messageId: s.messageId,
          title: s.title,
          targetDateTime: new Date(s.targetDateTime).toISOString(),
          closeDateTime: new Date(s.closeDateTime).toISOString(),
          targetRoleId: s.targetRoleId,
          status: s.status,
          createdBy: s.createdBy,
          createdAt: new Date(s.createdAt).toISOString(),
          updatedAt: new Date(s.updatedAt).toISOString(),
          participants,
          counts,
          myRsvp,
        }),
      );

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

  return (
    <>
      <PageHead
        breadcrumb="ERP / SESSIONS"
        title="세션"
        right={
          <Button
            as="a"
            href="/erp/sessions/report"
            variant="primary"
          >
            리포트 →
          </Button>
        }
      />

      {!guildId ? (
        <Box>
          <div className={styles.empty}>
            GUILD_ID 환경변수가 설정되지 않았습니다.
          </div>
        </Box>
      ) : (
        <SessionsClient
          initialSessions={serializedSessions}
          initialYear={year}
          initialMonth={month}
          guildId={guildId}
          initialUpcoming={initialUpcoming}
        />
      )}
    </>
  );
}
