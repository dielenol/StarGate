import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { getUpcomingSessionsResponse } from "@/lib/erp/upcoming-sessions";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guildId = process.env.GUILD_ID ?? "";
  if (!guildId) {
    return NextResponse.json(
      { error: "GUILD_ID 환경변수가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  try {
    if (session.user.isGuest) {
      return NextResponse.json(
        { sessions: [] },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    return NextResponse.json(await getUpcomingSessionsResponse(guildId));
  } catch (error) {
    console.error("[sessions/upcoming] GET failed", error);
    return NextResponse.json(
      { error: "예정 세션을 불러올 수 없습니다." },
      { status: 500 },
    );
  }
}
