/**
 * ERP 대시보드 개인 세션 요약.
 *
 * Registra와 TRPG를 독립 조회해 한쪽 장애가 다른 쪽의 참여 일정을 지우지 않게 한다.
 * 출력은 카드와 딥링크에 필요한 최소 필드만 포함하며 참여자/응답 문서는 노출하지 않는다.
 */

import "./init";

import {
  sessionResponsesCol,
  sessionsCol,
  trpgSessionsCol,
  type ResponseStatus,
} from "@stargate/shared-db";
import type { Filter } from "mongodb";

import {
  selectDashboardSessionOverview,
  type DashboardRegistraSessionCandidate,
  type DashboardRegistraSourceResult,
  type DashboardSessionOverview,
  type DashboardTrpgSessionCandidate,
} from "@/types/dashboard-sessions";
import { getTrpgGuildId, getTrpgWebBaseUrl } from "./trpg-sessions-bridge";

async function loadRegistraSource(input: {
  guildId: string;
  viewerDiscordId: string;
  now: Date;
}): Promise<DashboardRegistraSourceResult> {
  const sessions = await (await sessionsCol())
    .find(
      {
        guildId: input.guildId,
        targetDateTime: { $gte: input.now },
        status: { $in: ["OPEN", "CLOSING", "CANCELING", "CLOSED"] },
      } as Filter<DashboardRegistraSessionCandidate>,
    )
    .project<DashboardRegistraSessionCandidate>({
      _id: 1,
      title: 1,
      targetDateTime: 1,
      status: 1,
      guildId: 1,
      channelId: 1,
      messageId: 1,
    })
    .sort({ targetDateTime: 1, _id: 1 })
    .toArray();

  const sessionIds = sessions.map((session) => String(session._id));
  const responses =
    sessionIds.length === 0
      ? []
      : await (await sessionResponsesCol())
          .find({
            userId: input.viewerDiscordId,
            sessionId: { $in: sessionIds },
          })
          .project<{ sessionId: string; status: ResponseStatus }>({
            _id: 0,
            sessionId: 1,
            status: 1,
          })
          .toArray();

  return {
    sessions: sessions.map((session) => ({
      ...session,
      _id: String(session._id),
    })),
    responseBySessionId: new Map(
      responses.map((response) => [response.sessionId, response.status]),
    ),
  };
}

function currentKstDate(now: Date): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

async function loadTrpgSource(input: {
  trpgGuildId: string;
  viewerDiscordId: string;
  now: Date;
}): Promise<DashboardTrpgSessionCandidate[]> {
  const raws = await (await trpgSessionsCol())
    .find({
      guildId: input.trpgGuildId,
      status: "open",
      participantDiscordIds: input.viewerDiscordId,
      date: { $gte: currentKstDate(input.now) },
    })
    .project<{
      _id: unknown;
      guildId: string;
      title: string;
      date: string;
      startTime: string;
    }>({
      _id: 1,
      guildId: 1,
      title: 1,
      date: 1,
      startTime: 1,
    })
    .sort({ date: 1, startTime: 1, _id: 1 })
    .toArray();

  const result: DashboardTrpgSessionCandidate[] = [];
  for (const raw of raws) {
    const targetDateTime = new Date(`${raw.date}T${raw.startTime}:00+09:00`);
    if (
      !Number.isNaN(targetDateTime.getTime()) &&
      targetDateTime.getTime() >= input.now.getTime()
    ) {
      result.push({
        _id: String(raw._id),
        title: raw.title,
        targetDateTime,
        guildId: raw.guildId,
      });
    }
  }
  return result;
}

export async function getDashboardSessionOverview(input: {
  guildId: string;
  viewerDiscordId: string | null;
  now?: Date;
}): Promise<DashboardSessionOverview> {
  const now = input.now ?? new Date();
  const trpgGuildId = getTrpgGuildId();
  if (!input.viewerDiscordId) {
    return {
      myRsvpUpcoming: [],
      pendingResponse: [],
      pendingResponseCount: 0,
      unavailableSources: [],
    };
  }

  const [registraResult, trpgResult] = await Promise.allSettled([
    loadRegistraSource({
      guildId: input.guildId,
      viewerDiscordId: input.viewerDiscordId,
      now,
    }),
    trpgGuildId
      ? loadTrpgSource({
          trpgGuildId,
          viewerDiscordId: input.viewerDiscordId,
          now,
        })
      : Promise.resolve([]),
  ]);

  if (registraResult.status === "rejected") {
    console.error(
      "[getDashboardSessionOverview] registra fetch failed",
      registraResult.reason,
    );
  }
  if (trpgResult.status === "rejected") {
    console.error(
      "[getDashboardSessionOverview] trpg fetch failed",
      trpgResult.reason,
    );
  }

  return selectDashboardSessionOverview({
    registra:
      registraResult.status === "fulfilled" ? registraResult.value : null,
    trpg: trpgResult.status === "fulfilled" ? trpgResult.value : null,
    trpgEnabled: trpgGuildId !== null,
    trpgWebBaseUrl: getTrpgWebBaseUrl(),
    now,
  });
}
