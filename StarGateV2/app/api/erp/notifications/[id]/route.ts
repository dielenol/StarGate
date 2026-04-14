import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { markAsRead } from "@/lib/db/notifications";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const updated = await markAsRead(id);
    if (!updated) {
      return NextResponse.json(
        { error: "알림을 찾을 수 없거나 이미 읽음 처리되었습니다." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "읽음 처리 실패" },
      { status: 500 },
    );
  }
}
