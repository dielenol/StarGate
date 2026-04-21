import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import { findSessionsByGuildInMonth } from "@/lib/db/sessions";

// 단일 길드 전제. 다중 길드 확장 시 세션 유저의 소속 길드 화이트리스트 검증 추가.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireRole(session.user.role, "PLAYER");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const guildId = process.env.GUILD_ID;
  if (!guildId) {
    return NextResponse.json(
      { error: "GUILD_ID 환경변수가 설정되지 않았습니다." },
      { status: 500 },
    );
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

  const year = parseInt(yearParam, 10);
  const month = parseInt(monthParam, 10);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return NextResponse.json(
      { error: "유효하지 않은 year 또는 month 값입니다." },
      { status: 400 },
    );
  }

  try {
    // findSessionsByGuildInMonth 는 monthIndex(0~11) 기반
    const sessions = await findSessionsByGuildInMonth(guildId, year, month - 1);

    const serialized = sessions.map((s) => ({
      ...s,
      _id: s._id?.toString() ?? "",
      targetDateTime: new Date(s.targetDateTime).toISOString(),
      closeDateTime: new Date(s.closeDateTime).toISOString(),
      createdAt: new Date(s.createdAt).toISOString(),
      updatedAt: new Date(s.updatedAt).toISOString(),
    }));

    return NextResponse.json(
      { sessions: serialized },
      {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "세션 데이터를 불러오는데 실패했습니다." },
      { status: 500 },
    );
  }
}
