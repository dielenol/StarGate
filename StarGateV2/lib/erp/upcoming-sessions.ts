import { findUpcomingSessionsByGuild } from "@/lib/db/sessions";
import type { UpcomingSessionsResponse } from "@/types/erp-realtime";

export const UPCOMING_SESSION_LIMIT = 5;

export async function getUpcomingSessionsResponse(
  guildId: string,
): Promise<UpcomingSessionsResponse> {
  const sessions = await findUpcomingSessionsByGuild(
    guildId,
    UPCOMING_SESSION_LIMIT,
  );
  return {
    sessions: sessions.map((session) => ({
      _id: session._id?.toString() ?? "",
      title: session.title,
      targetDateTime: new Date(session.targetDateTime).toISOString(),
      guildId: session.guildId,
      channelId: session.channelId,
      messageId: session.messageId,
    })),
  };
}
