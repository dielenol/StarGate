/**
 * /api/trpg/sessions
 *
 * - GET: 월별 세션 조회 (year, month)
 * - POST: 새 세션 생성
 */

import "@/lib/db/init";

import { NextResponse } from "next/server";

import { z } from "zod";

import {
  createTrpgSession,
  createTrpgSessionInputSchema,
  findTrpgGuildMember,
  findTrpgSessionsByMonth,
  listActiveTrpgGuildMembers,
} from "@stargate/shared-db";

import { auth } from "@/lib/auth/config";
import { currentKstDateString } from "@/lib/calendar/month";
import { TRPG_GUILD_ID } from "@/lib/env";
import { toTrpgSessionView } from "@/lib/trpg/serializer";

const createBodySchema = z.object({
  title: z.string().min(1).max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  participantDiscordIds: z.array(z.string().min(1).max(64)).max(50),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get("year");
  const monthParam = searchParams.get("month");

  if (!yearParam || !monthParam) {
    return NextResponse.json(
      { error: "year, month 파라미터가 필요합니다." },
      { status: 400 },
    );
  }

  const year = Number.parseInt(yearParam, 10);
  const month = Number.parseInt(monthParam, 10);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    month < 1 ||
    month > 12
  ) {
    return NextResponse.json(
      { error: "유효하지 않은 year 또는 month 값입니다." },
      { status: 400 },
    );
  }

  try {
    const sessions = await findTrpgSessionsByMonth(TRPG_GUILD_ID, year, month);
    return NextResponse.json(sessions.map(toTrpgSessionView));
  } catch (err) {
    const message = err instanceof Error ? err.message : "세션 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  const createdByDiscordId = session?.user?.discordUserId;
  if (!session?.user || !createdByDiscordId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 JSON 본문" }, { status: 400 });
  }

  const parsed = createBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "입력 검증 실패", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const guildId = TRPG_GUILD_ID;
  const todayKey = currentKstDateString();
  if (parsed.data.date < todayKey) {
    return NextResponse.json(
      { error: "오늘 이전 날짜에는 세션을 생성할 수 없습니다." },
      { status: 400 },
    );
  }

  // 모든 참여자가 활성 길드 멤버 캐시에 존재하는지 서버 사이드 재검증.
  const participantDiscordIds = Array.from(
    new Set([createdByDiscordId, ...parsed.data.participantDiscordIds]),
  );
  const activeMembers = await listActiveTrpgGuildMembers(guildId);
  const activeIds = new Set(activeMembers.map((m) => m.discordUserId));
  const invalidIds = participantDiscordIds.filter((id) => !activeIds.has(id));
  if (invalidIds.length > 0) {
    return NextResponse.json(
      { error: "활성 길드 멤버가 아닌 참여자가 포함되어 있습니다.", invalidIds },
      { status: 400 },
    );
  }

  // 표시용 username 은 길드 멤버 캐시의 displayName 을 우선 사용 (PII 최소화 — email 미사용).
  const member = await findTrpgGuildMember(guildId, createdByDiscordId);
  const createdByUsername =
    member?.displayName ?? session.user.name ?? createdByDiscordId;

  let insertedId: string;
  try {
    // shared-db 의 Zod 스키마로 한 번 더 진입 검증 (DB 적재 직전 마지막 가드).
    const input = createTrpgSessionInputSchema.parse({
      guildId,
      title: parsed.data.title,
      date: parsed.data.date,
      startTime: parsed.data.startTime,
      createdByDiscordId,
      createdByUsername,
      participantDiscordIds,
    });

    insertedId = await createTrpgSession(input);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "스키마 검증 실패", details: err.flatten() },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : "세션 생성 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ id: insertedId }, { status: 201 });
}
