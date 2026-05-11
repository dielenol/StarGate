/**
 * 월간 캘린더 페이지 (서버 컴포넌트).
 *
 * - middleware 가 쿠키만 검사하므로 여기서 `auth()` 로 실제 세션 검증.
 * - 길드 멤버 캐시 + 현재 월 세션을 prefetch 해 클라이언트의 useQuery 초기값으로 전달.
 */

import "@/lib/db/init";

import { redirect } from "next/navigation";

import {
  findTrpgSessionsByMonth,
  listActiveTrpgGuildMembers,
} from "@stargate/shared-db";

import type { TrpgMemberView } from "@/app/api/trpg/members/route";
import { auth } from "@/lib/auth/config";
import { currentKstYearMonth } from "@/lib/calendar/month";
import { TRPG_GUILD_ID } from "@/lib/env";
import { toTrpgSessionView, type TrpgSessionView } from "@/lib/trpg/serializer";

import { CalendarClient } from "./CalendarClient";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const session = await auth();
  if (!session?.user?.discordUserId) {
    redirect("/login");
  }

  const guildId = TRPG_GUILD_ID;
  const { year, month } = currentKstYearMonth();

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
    />
  );
}
