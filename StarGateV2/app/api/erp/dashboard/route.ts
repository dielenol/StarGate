import { NextResponse } from "next/server";

import { jsonWithETag } from "@/lib/api/http-cache";
import { auth } from "@/lib/auth/config";
import { getOwnedDataViewerId } from "@/lib/auth/guest";
import { getErpDashboardResponse } from "@/lib/erp/dashboard";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await getErpDashboardResponse({
      userId: getOwnedDataViewerId(session.user),
      viewerRole: session.user.role,
      viewerDiscordId: session.user.discordId ?? null,
    });
    return jsonWithETag(request, payload);
  } catch (error) {
    console.error("[dashboard] GET failed", error);
    return NextResponse.json(
      { error: "대시보드를 불러올 수 없습니다." },
      { status: 500 },
    );
  }
}
