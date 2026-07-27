import { NextResponse } from "next/server";

import { getActiveSession } from "@/lib/auth/active-session";
import { issueRealtimeTicket } from "@/lib/realtime/ticket";

export async function POST() {
  const session = await getActiveSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const ticket = await issueRealtimeTicket({
      userId: session.user.id,
      role: session.user.role,
    });
    return NextResponse.json(ticket, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[realtime-ticket] ticket 발급 실패", error);
    return NextResponse.json(
      { error: "실시간 연결을 준비하지 못했습니다." },
      { status: 503 },
    );
  }
}
