import { NextResponse } from "next/server";

import { jsonWithETag } from "@/lib/api/http-cache";
import { auth } from "@/lib/auth/config";
import { countUnread, listUserNotifications } from "@/lib/db/notifications";

const RECENT_NOTIFICATION_LIMIT = 3;

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [recent, unreadCount] = await Promise.all([
      listUserNotifications(session.user.id, RECENT_NOTIFICATION_LIMIT),
      countUnread(session.user.id),
    ]);

    return jsonWithETag(request, { recent, unreadCount });
  } catch {
    return NextResponse.json(
      { error: "알림 요약 조회 실패" },
      { status: 500 },
    );
  }
}
