import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { getOwnedDataViewerId } from "@/lib/auth/guest";
import { getResearchLabOverview } from "@/lib/db/research-lab-overview";
import { toGuestResearchLabOverview } from "@/lib/research/guest-overview";

import {
  researchLabErrorResponse,
  unauthorizedResearchResponse,
} from "./_response";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorizedResearchResponse();

  try {
    const viewerId = getOwnedDataViewerId(session.user);
    const overview = await getResearchLabOverview({
      userId: viewerId,
    });
    const response =
      viewerId === null ? toGuestResearchLabOverview(overview) : overview;
    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return researchLabErrorResponse(
      error,
      "연구소 상태를 불러오지 못했습니다.",
    );
  }
}
