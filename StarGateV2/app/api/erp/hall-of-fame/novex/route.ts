import { type NextRequest, NextResponse } from "next/server";

import { getActiveSession } from "@/lib/auth/active-session";
import { getHallOfFameNovexResponse } from "@/lib/hall-of-fame/honors";

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
};

export async function GET(request: NextRequest) {
  const session = await getActiveSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  const seasonKey = request.nextUrl.searchParams.get("season")?.trim();
  if (seasonKey && seasonKey.length > 160) {
    return NextResponse.json(
      { error: "잘못된 시즌 식별자입니다.", code: "INVALID_SEASON_KEY" },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  try {
    const response = await getHallOfFameNovexResponse(seasonKey || undefined);
    return NextResponse.json(response, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error("[hall-of-fame/novex] failed to load honors", error);
    return NextResponse.json(
      {
        error: "NOVEX 시즌 공적을 불러오지 못했습니다.",
        code: "NOVEX_HALL_OF_FAME_LOAD_FAILED",
      },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
}
