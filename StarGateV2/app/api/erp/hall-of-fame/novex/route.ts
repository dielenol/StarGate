import { NextResponse } from "next/server";

import { getActiveSession } from "@/lib/auth/active-session";
import { getHallOfFameNovexResponse } from "@/lib/hall-of-fame/honors";

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
    const response = await getHallOfFameNovexResponse();
    return NextResponse.json(response, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error("[hall-of-fame/novex] failed to load honors", error);
    return NextResponse.json(
      {
        error: "NOVEX 누적 수익 순위를 불러오지 못했습니다.",
        code: "NOVEX_HALL_OF_FAME_LOAD_FAILED",
      },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
}
