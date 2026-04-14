import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { listUserNotifications } from "@/lib/db/notifications";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const notifications = await listUserNotifications(session.user.id);
    return NextResponse.json({ notifications });
  } catch {
    return NextResponse.json(
      { error: "알림 목록 조회 실패" },
      { status: 500 },
    );
  }
}
