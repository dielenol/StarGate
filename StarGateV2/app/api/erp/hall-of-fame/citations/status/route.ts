import { type NextRequest, NextResponse } from "next/server";

import { getActiveSession } from "@/lib/auth/active-session";
import { isMemberErpViewer } from "@/lib/auth/guest";
import { isValidObjectId } from "@/lib/db/utils";
import { getHallOfFameReportReviewResponse } from "@/lib/hall-of-fame/honors";

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
};

function notFoundResponse() {
  return NextResponse.json(
    { error: "Not Found", code: "NOT_FOUND" },
    { status: 404, headers: PRIVATE_NO_STORE_HEADERS },
  );
}

export async function GET(request: NextRequest) {
  const session = await getActiveSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
  if (!isMemberErpViewer(session.user)) return notFoundResponse();

  const reportId = request.nextUrl.searchParams.get("reportId")?.trim();
  if (!reportId || !isValidObjectId(reportId)) {
    return NextResponse.json(
      { error: "잘못된 보고서 식별자입니다.", code: "INVALID_REPORT_ID" },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  try {
    const response = await getHallOfFameReportReviewResponse(reportId);
    return NextResponse.json(response, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error("[hall-of-fame/citations/status] failed to load state", error);
    return NextResponse.json(
      {
        error: "공적 검토 상태를 불러오지 못했습니다.",
        code: "HONOR_REVIEW_STATE_LOAD_FAILED",
      },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
}
