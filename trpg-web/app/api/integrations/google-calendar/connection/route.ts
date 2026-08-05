import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { getGoogleCalendarConnectionView } from "@/lib/db/google-calendar-connections";
import { isGoogleCalendarEnabled } from "@/lib/google-calendar/config";
import {
  forbiddenGoogleCalendarResponse,
  googleCalendarErrorResponse,
  isSameOriginRequest,
  PRIVATE_NO_STORE_HEADERS,
  unauthorizedGoogleCalendarResponse,
} from "@/lib/google-calendar/http";
import { disconnectGoogleCalendar } from "@/lib/google-calendar/service";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.discordUserId) {
    return unauthorizedGoogleCalendarResponse();
  }
  if (!isGoogleCalendarEnabled()) {
    return NextResponse.json(
      {
        enabled: false,
        connected: false,
        reconnectRequired: false,
        selectedCalendarCount: 0,
      },
      { headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  try {
    const view = await getGoogleCalendarConnectionView(
      session.user.discordUserId,
    );
    return NextResponse.json(view, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    return googleCalendarErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) return forbiddenGoogleCalendarResponse();
  const session = await auth();
  if (!session?.user?.discordUserId) {
    return unauthorizedGoogleCalendarResponse();
  }
  try {
    const result = await disconnectGoogleCalendar(session.user.discordUserId);
    return NextResponse.json(result, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    return googleCalendarErrorResponse(error);
  }
}
