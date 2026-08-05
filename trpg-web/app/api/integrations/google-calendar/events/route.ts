import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth/config";
import { assertGoogleCalendarEnabled } from "@/lib/google-calendar/config";
import {
  googleCalendarErrorResponse,
  PRIVATE_NO_STORE_HEADERS,
  unauthorizedGoogleCalendarResponse,
} from "@/lib/google-calendar/http";
import { getGoogleCalendarEvents } from "@/lib/google-calendar/service";

export const runtime = "nodejs";

const yearSchema = z.coerce.number().int().min(2000).max(2100);
const monthSchema = z.coerce.number().int().min(1).max(12);

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.discordUserId) {
    return unauthorizedGoogleCalendarResponse();
  }
  try {
    assertGoogleCalendarEnabled();
    const year = yearSchema.parse(request.nextUrl.searchParams.get("year"));
    const month = monthSchema.parse(request.nextUrl.searchParams.get("month"));
    const events = await getGoogleCalendarEvents(
      session.user.discordUserId,
      year,
      month,
    );
    return NextResponse.json(events, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    return googleCalendarErrorResponse(error);
  }
}
