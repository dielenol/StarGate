import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth/config";
import { assertGoogleCalendarEnabled } from "@/lib/google-calendar/config";
import {
  forbiddenGoogleCalendarResponse,
  googleCalendarErrorResponse,
  isSameOriginRequest,
  parseGoogleCalendarJson,
  PRIVATE_NO_STORE_HEADERS,
  unauthorizedGoogleCalendarResponse,
} from "@/lib/google-calendar/http";
import {
  getGoogleCalendarOptions,
  updateSelectedGoogleCalendars,
} from "@/lib/google-calendar/service";
import { MAX_SELECTED_GOOGLE_CALENDARS } from "@/lib/google-calendar/types";

export const runtime = "nodejs";

const updateCalendarsSchema = z.object({
  calendarIds: z
    .array(z.string().min(1).max(1024))
    .max(MAX_SELECTED_GOOGLE_CALENDARS),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.discordUserId) {
    return unauthorizedGoogleCalendarResponse();
  }
  try {
    assertGoogleCalendarEnabled();
    const calendars = await getGoogleCalendarOptions(
      session.user.discordUserId,
    );
    return NextResponse.json(calendars, {
      headers: PRIVATE_NO_STORE_HEADERS,
    });
  } catch (error) {
    return googleCalendarErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  if (!isSameOriginRequest(request)) return forbiddenGoogleCalendarResponse();
  const session = await auth();
  if (!session?.user?.discordUserId) {
    return unauthorizedGoogleCalendarResponse();
  }
  try {
    assertGoogleCalendarEnabled();
    const body = await parseGoogleCalendarJson(request, updateCalendarsSchema);
    const selectedCalendarCount = await updateSelectedGoogleCalendars(
      session.user.discordUserId,
      body.calendarIds,
    );
    return NextResponse.json(
      { selectedCalendarCount },
      { headers: PRIVATE_NO_STORE_HEADERS },
    );
  } catch (error) {
    return googleCalendarErrorResponse(error);
  }
}
