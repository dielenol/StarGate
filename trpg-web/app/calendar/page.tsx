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
import {
  currentKstDateString,
  currentKstYearMonth,
} from "@/lib/calendar/month";
import { getGoogleCalendarConnectionView } from "@/lib/db/google-calendar-connections";
import { toTrpgMemberViews } from "@/lib/discord/avatar";
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
  // "오늘"은 요청 시점에 서버가 한 번 계산해 내려준다 — 클라이언트가 자정 전후로 다시 계산하면
  // SSR 마크업(지난 날짜 셀·오늘 링)과 hydration 결과가 어긋난다. 기본 월과 todayKey 가 같은
  // 시각에서 나오도록 now 를 한 번만 읽는다(말일 자정 경계에서 둘이 갈리지 않게).
  const now = new Date();
  const { year, month } = linkedYearMonth ?? currentKstYearMonth(now);
  const todayKey = currentKstDateString(now);
  // initialSessions 조회 직전 시각(몇 ms 보수적) — useTrpgSessions 의 initialDataUpdatedAt 으로 쓰인다.
  const initialFetchedAt = now.getTime();

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
  const initialMembers: TrpgMemberView[] = toTrpgMemberViews(rawMembers, {
    currentUserDiscordId: session.user.discordUserId,
    currentUserAvatarUrl: session.user.image,
  });

  return (
    <CalendarClient
      currentUserDiscordId={session.user.discordUserId}
      currentUserName={session.user.name ?? null}
      initialYear={year}
      initialMonth={month}
      todayKey={todayKey}
      initialSessions={initialSessions}
      initialFetchedAt={initialFetchedAt}
      initialMembers={initialMembers}
      initialGoogleConnection={initialGoogleConnection}
      initialGoogleStatus={googleStatus}
      initialSelectedDate={initialSelectedDate}
      initialFocusedSessionId={initialFocusedSessionId}
    />
  );
}
