import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { getOwnedDataViewerId } from "@/lib/auth/guest";
import { hasRole } from "@/lib/auth/rbac";
import { getZuluSampleLabOverview } from "@/lib/db/zulu-sample-lab";

import { zuluSampleLabErrorResponse } from "./_response";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  try {
    const overview = await getZuluSampleLabOverview({
      userId: getOwnedDataViewerId(session.user),
      isGm: hasRole(session.user.role, "GM"),
    });
    return NextResponse.json(overview, {
      status: 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return zuluSampleLabErrorResponse(
      error,
      "ZULU-0028 연구 상태를 불러올 수 없습니다.",
    );
  }
}
