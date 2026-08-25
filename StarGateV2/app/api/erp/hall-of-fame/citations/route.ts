import { type NextRequest, NextResponse } from "next/server";

import {
  OPERATION_HONOR_CATEGORIES,
  type OperationHonorCategory,
} from "@stargate/shared-db";

import { getActiveSession } from "@/lib/auth/active-session";
import { isMemberErpViewer } from "@/lib/auth/guest";
import { isValidObjectId } from "@/lib/db/utils";
import { getHallOfFameCitationPage } from "@/lib/hall-of-fame/honors";

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
};
const OPERATION_HONOR_CATEGORY_SET = new Set<string>(
  OPERATION_HONOR_CATEGORIES,
);

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

  const categoryParam = request.nextUrl.searchParams.get("category")?.trim();
  const cursor = request.nextUrl.searchParams.get("cursor")?.trim();
  const characterId = request.nextUrl.searchParams.get("characterId")?.trim();
  const reportId = request.nextUrl.searchParams.get("reportId")?.trim();
  if (
    (categoryParam && !OPERATION_HONOR_CATEGORY_SET.has(categoryParam)) ||
    (cursor && cursor.length > 1_000) ||
    (characterId && !isValidObjectId(characterId)) ||
    (reportId && !isValidObjectId(reportId)) ||
    (characterId && reportId) ||
    (cursor && (characterId || reportId))
  ) {
    return NextResponse.json(
      { error: "잘못된 공적 조회 조건입니다.", code: "INVALID_HONOR_QUERY" },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  try {
    const response = await getHallOfFameCitationPage({
      viewerRole: session.user.role,
      ...(categoryParam
        ? { category: categoryParam as OperationHonorCategory }
        : {}),
      ...(cursor ? { cursor } : {}),
      ...(characterId ? { characterId } : {}),
      ...(reportId ? { reportId } : {}),
    });
    return NextResponse.json(response, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_HONOR_CURSOR") {
      return NextResponse.json(
        { error: "잘못된 페이지 위치입니다.", code: "INVALID_HONOR_CURSOR" },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }
    console.error("[hall-of-fame/citations] failed to load honors", error);
    return NextResponse.json(
      {
        error: "작전 공적을 불러오지 못했습니다.",
        code: "OPERATION_HONORS_LOAD_FAILED",
      },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
}
