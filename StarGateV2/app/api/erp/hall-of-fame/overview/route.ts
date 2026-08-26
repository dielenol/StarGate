import { NextResponse } from "next/server";

import { getActiveSession } from "@/lib/auth/active-session";
import { getHallOfFameOverviewResponse } from "@/lib/hall-of-fame/honors";

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
};

export async function GET() {
  const session = await getActiveSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  try {
    const response = await getHallOfFameOverviewResponse({
      viewerRole: session.user.role,
      isGuest: session.user.isGuest === true,
    });
    return NextResponse.json(response, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error("[hall-of-fame/overview] failed to load aggregate", error);
    return NextResponse.json(
      {
        error: "명예의 전당 집계를 불러오지 못했습니다.",
        code: "HALL_OF_FAME_OVERVIEW_LOAD_FAILED",
      },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
}
