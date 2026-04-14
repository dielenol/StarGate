import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { markAllAsRead } from "@/lib/db/notifications";

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const count = await markAllAsRead(session.user.id);
    return NextResponse.json({ success: true, count });
  } catch {
    return NextResponse.json(
      { error: "모두 읽음 처리 실패" },
      { status: 500 },
    );
  }
}
