import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { getErpDashboardResponse } from "@/lib/erp/dashboard";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(
      await getErpDashboardResponse({
        userId: session.user.id,
        viewerDiscordId: session.user.discordId ?? null,
      }),
    );
  } catch (error) {
    console.error("[dashboard] GET failed", error);
    return NextResponse.json(
      { error: "대시보드를 불러올 수 없습니다." },
      { status: 500 },
    );
  }
}
