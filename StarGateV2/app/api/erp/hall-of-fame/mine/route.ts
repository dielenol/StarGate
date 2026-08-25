import { NextResponse } from "next/server";

import { getActiveSession } from "@/lib/auth/active-session";
import { isMemberErpViewer } from "@/lib/auth/guest";
import { getHallOfFameMineResponse } from "@/lib/hall-of-fame/honors";

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
};

function notFoundResponse() {
  return NextResponse.json(
    { error: "Not Found", code: "NOT_FOUND" },
    { status: 404, headers: PRIVATE_NO_STORE_HEADERS },
  );
}

export async function GET() {
  const session = await getActiveSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
  if (!isMemberErpViewer(session.user)) return notFoundResponse();

  try {
    const response = await getHallOfFameMineResponse({
      userId: session.user.id,
      viewerRole: session.user.role,
    });
    return NextResponse.json(response, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error("[hall-of-fame/mine] failed to load honors", error);
    return NextResponse.json(
      {
        error: "내 공적 기록을 불러오지 못했습니다.",
        code: "MY_HONORS_LOAD_FAILED",
      },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
}
