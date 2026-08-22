import { NextResponse } from "next/server";

import { getActiveSession } from "@/lib/auth/active-session";
import { getResearchHallOfFameResponse } from "@/lib/hall-of-fame/research";

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
    const response = await getResearchHallOfFameResponse();
    return NextResponse.json(response, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error("[hall-of-fame/research] failed to load ranking", error);
    return NextResponse.json(
      {
        error: "연구 공로 순위를 불러오지 못했습니다.",
        code: "RESEARCH_HALL_OF_FAME_LOAD_FAILED",
      },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
}
