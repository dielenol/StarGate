/**
 * 월간 캘린더 페이지 (서버 컴포넌트).
 *
 * - proxy 가 쿠키만 검사하므로 여기서 `auth()` 로 실제 세션 검증.
 * - 길드 멤버 캐시 + 현재 월 세션을 prefetch 해 클라이언트의 useQuery 초기값으로 전달.
 */

import "@/lib/db/init";

import { redirect } from "next/navigation";

import {
  findTrpgSessionById,
  findTrpgSessionsByMonth,
  listActiveTrpgGuildMembers,
} from "@stargate/shared-db";

import type { TrpgMemberView } from "@/app/api/trpg/members/route";
import { auth } from "@/lib/auth/config";
import { yearMonthFromDateKey } from "@/lib/calendar/date-key";
import { currentKstYearMonth } from "@/lib/calendar/month";
import { getGoogleCalendarConnectionView } from "@/lib/db/google-calendar-connections";
import { TRPG_GUILD_ID } from "@/lib/env";
import { isGoogleCalendarEnabled } from "@/lib/google-calendar/config";
import type { GoogleCalendarConnectionView } from "@/lib/google-calendar/types";
import { toTrpgSessionView, type TrpgSessionView } from "@/lib/trpg/serializer";

import { CalendarClient } from "./CalendarClient";

export const dynamic = "force-dynamic";

type CalendarSearchParams = Record<string, string | string[] | undefined>;

function firstSearchParam(
  params: CalendarSearchParams,
  key: string,
): string | null {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams?: Promise<CalendarSearchParams>;
}) {
  const session = await auth();
  if (!session?.user?.discordUserId) {
    redirect("/login");
  }

  const guildId = TRPG_GUILD_ID;
  const params = searchParams ? await searchParams : {};
  const sessionId = firstSearchParam(params, "sessionId");
  const dateParam = firstSearchParam(params, "date");
  const googleStatus = firstSearchParam(params, "google");
  const linkedSession = sessionId
    ? await findTrpgSessionById(sessionId).catch(() => null)
    : null;
  const linkedDate = linkedSession?.date ?? dateParam;
  const linkedYearMonth = linkedDate ? yearMonthFromDateKey(linkedDate) : null;
  const initialSelectedDate = linkedYearMonth ? linkedDate : null;
  const initialFocusedSessionId =
    linkedSession?.status === "open" ? linkedSession._id?.toString() : null;
  const { year, month } = linkedYearMonth ?? currentKstYearMonth();

  const googleCalendarEnabled = isGoogleCalendarEnabled();
  const disabledGoogleConnection: GoogleCalendarConnectionView = {
    enabled: false,
    available: false,
    connected: false,
    reconnectRequired: false,
    selectedCalendarCount: 0,
  };
  const unavailableGoogleConnection: GoogleCalendarConnectionView = {
    enabled: true,
    available: false,
    connected: false,
    reconnectRequired: false,
    selectedCalendarCount: 0,
  };

  // 초기 sessions + members + Google 연결 상태 병렬 prefetch.
  const [rawSessions, rawMembers, initialGoogleConnection] = await Promise.all([
    findTrpgSessionsByMonth(guildId, year, month).catch(() => []),
    listActiveTrpgGuildMembers(guildId).catch(() => []),
    googleCalendarEnabled
      ? getGoogleCalendarConnectionView(session.user.discordUserId).catch(
          () => unavailableGoogleConnection,
        )
      : Promise.resolve(disabledGoogleConnection),
  ]);

  const initialSessions: TrpgSessionView[] = rawSessions.map(toTrpgSessionView);
  const initialMembers: TrpgMemberView[] = rawMembers.map((m) => ({
    discordUserId: m.discordUserId,
    displayName: m.displayName,
    discordUsername: m.discordUsername,
    avatarUrl: m.discordAvatarUrl ?? null,
  }));

  return (
    <CalendarClient
      currentUserDiscordId={session.user.discordUserId}
      initialYear={year}
      initialMonth={month}
      initialSessions={initialSessions}
      initialMembers={initialMembers}
      initialGoogleConnection={initialGoogleConnection}
      initialGoogleStatus={googleStatus}
      initialSelectedDate={initialSelectedDate}
      initialFocusedSessionId={initialFocusedSessionId}
    />
  );
}
