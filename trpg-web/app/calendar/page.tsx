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
import { TRPG_GUILD_ID } from "@/lib/env";
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
  const linkedSession = sessionId
    ? await findTrpgSessionById(sessionId).catch(() => null)
    : null;
  const linkedDate = linkedSession?.date ?? dateParam;
  const linkedYearMonth = linkedDate ? yearMonthFromDateKey(linkedDate) : null;
  const initialSelectedDate = linkedYearMonth ? linkedDate : null;
  const initialFocusedSessionId =
    linkedSession?.status === "open" ? linkedSession._id?.toString() : null;
  const { year, month } = linkedYearMonth ?? currentKstYearMonth();

  // 초기 sessions + members 병렬 prefetch.
  const [rawSessions, rawMembers] = await Promise.all([
    findTrpgSessionsByMonth(guildId, year, month).catch(() => []),
    listActiveTrpgGuildMembers(guildId).catch(() => []),
  ]);

  const initialSessions: TrpgSessionView[] = rawSessions.map(toTrpgSessionView);
  const initialMembers: TrpgMemberView[] = rawMembers.map((m) => ({
    discordUserId: m.discordUserId,
    displayName: m.displayName,
    discordUsername: m.discordUsername,
  }));

  return (
    <CalendarClient
      currentUserDiscordId={session.user.discordUserId}
      initialYear={year}
      initialMonth={month}
      initialSessions={initialSessions}
      initialMembers={initialMembers}
      initialSelectedDate={initialSelectedDate}
      initialFocusedSessionId={initialFocusedSessionId}
    />
  );
}
