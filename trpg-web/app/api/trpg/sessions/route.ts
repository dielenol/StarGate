/**
 * /api/trpg/sessions
 *
 * - GET: 월별 세션 조회 (year, month)
 * - POST: 새 세션 생성 (참가자 충돌 검사 포함, race 차단을 위해 insert 후 재검사)
 */

import "@/lib/db/init";

import { NextResponse } from "next/server";

import { z } from "zod";

import {
  cancelTrpgSession,
  createTrpgSession,
  createTrpgSessionInputSchema,
  findTrpgGuildMember,
  findTrpgSessionsByDate,
  findTrpgSessionsByMonth,
  listActiveTrpgGuildMembers,
} from "@stargate/shared-db";

import { auth } from "@/lib/auth/config";
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

  // 모든 참여자가 활성 길드 멤버 캐시에 존재하는지 서버 사이드 재검증.
  const activeMembers = await listActiveTrpgGuildMembers(guildId);
  const activeIds = new Set(activeMembers.map((m) => m.discordUserId));
  const invalidIds = parsed.data.participantDiscordIds.filter(
    (id) => !activeIds.has(id),
  );
  if (invalidIds.length > 0) {
    return NextResponse.json(
      { error: "활성 길드 멤버가 아닌 참여자가 포함되어 있습니다.", invalidIds },
      { status: 400 },
    );
  }

  // 사전 conflict check — 같은 날짜 다른 open 세션과의 참여자 교집합 검사.
  const sessionsBefore = await findTrpgSessionsByDate(guildId, parsed.data.date);
  const requestedSet = new Set(parsed.data.participantDiscordIds);
  {
    const conflicted = new Set<string>();
    for (const s of sessionsBefore) {
      if (s.status !== "open") continue;
      for (const pid of s.participantDiscordIds) {
        if (requestedSet.has(pid)) conflicted.add(pid);
      }
    }
    if (conflicted.size > 0) {
      return NextResponse.json(
        {
          error: "conflict",
          conflictedParticipants: Array.from(conflicted),
        },
        { status: 409 },
      );
    }
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
      participantDiscordIds: parsed.data.participantDiscordIds,
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

  // Race 차단: insert 직후 재검사. 사이에 다른 요청이 동일 인원을 등록했을 수 있다.
  // 충돌 발견 시 방금 생성한 세션을 즉시 cancel 하고 409 반환.
  try {
    const sessionsAfter = await findTrpgSessionsByDate(guildId, parsed.data.date);
    const conflictedPost = new Set<string>();
    for (const s of sessionsAfter) {
      if (s.status !== "open") continue;
      if (s._id?.toString() === insertedId) continue;
      for (const pid of s.participantDiscordIds) {
        if (requestedSet.has(pid)) conflictedPost.add(pid);
      }
    }
    if (conflictedPost.size > 0) {
      // 자신이 만든 세션이므로 createdByDiscordId 일치 — 안전하게 취소 가능.
      await cancelTrpgSession(insertedId, createdByDiscordId).catch((err) => {
        // rollback 실패 시 좀비 open 세션이 남을 수 있음. 운영 모니터링으로 잡아야 함.
        console.error("[trpg] POST rollback 실패 — 좀비 세션 가능", {
          insertedId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
      return NextResponse.json(
        {
          error: "conflict",
          conflictedParticipants: Array.from(conflictedPost),
        },
        { status: 409 },
      );
    }
  } catch {
    // 사후 재검사 실패는 무시 — 이미 insert 는 성공했고 정합성 책임은 운영 모니터링으로.
  }

  return NextResponse.json({ id: insertedId }, { status: 201 });
}
