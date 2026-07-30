import type { Character } from "@/types/character";
import type {
  ErpDashboardResponse,
  ErpDashboardSession,
} from "@/types/erp-realtime";

import {
  findCharacterById,
  findMainCharacterByOwnerCached as findMainCharacterByOwner,
  listCharactersByOwner,
} from "@/lib/db/characters";
import { getCharacterBalance } from "@/lib/db/credits";
import {
  countUnread,
  listUserNotifications,
} from "@/lib/db/notifications";
import {
  countParticipationForUser,
  enrichSessions,
  findMergedSessionsByGuildInMonth,
  findUpcomingSessionsByGuild,
} from "@/lib/db/sessions";
import { findUserById } from "@/lib/db/users";
import { listWikiPagesLite } from "@/lib/db/wiki";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function daysSinceCreated(createdAt: Date | string): number {
  const date =
    typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  const diff = Date.now() - date.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function toKstDateString(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  return kst.toISOString().slice(0, 10);
}

function currentKstYearMonth(now = new Date()): {
  year: number;
  monthIndex: number;
} {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return {
    year: kst.getUTCFullYear(),
    monthIndex: kst.getUTCMonth(),
  };
}

function serializeDashboardSession(
  session: Awaited<ReturnType<typeof findUpcomingSessionsByGuild>>[number],
): ErpDashboardSession {
  return {
    _id: session._id?.toString() ?? "",
    title: session.title,
    targetDateTime: new Date(session.targetDateTime).toISOString(),
    status: session.status,
    guildId: session.guildId,
    channelId: session.channelId,
    messageId: session.messageId,
  };
}

export async function getErpDashboardResponse(input: {
  userId: string;
  viewerDiscordId: string | null;
}): Promise<ErpDashboardResponse> {
  const { userId, viewerDiscordId } = input;
  const guildId = process.env.GUILD_ID ?? "";
  const todayKst = toKstDateString(new Date());
  const todayKstYearMonth = currentKstYearMonth();
  const mainCharacterPromise = findMainCharacterByOwner(userId).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({
      ok: false as const,
      message:
        error instanceof Error
          ? error.message
          : "메인 캐릭터 조회 실패 (정합성 위반)",
    }),
  );

  const [
    user,
    myCharRefs,
    mainCharacterResult,
    notifications,
    unreadCount,
    upcomingRaw,
    todayMergedSessions,
    mySessionCount,
    wikiPages,
  ] = await Promise.all([
    findUserById(userId).catch(() => null),
    listCharactersByOwner(userId).catch(() => []),
    mainCharacterPromise,
    listUserNotifications(userId, 20).catch(() => []),
    countUnread(userId).catch(() => 0),
    guildId
      ? findUpcomingSessionsByGuild(guildId, 20).catch(() => [])
      : Promise.resolve([]),
    guildId
      ? findMergedSessionsByGuildInMonth(
          guildId,
          todayKstYearMonth.year,
          todayKstYearMonth.monthIndex,
          viewerDiscordId,
        ).catch(() => [])
      : Promise.resolve([]),
    viewerDiscordId
      ? countParticipationForUser(viewerDiscordId).catch(() => 0)
      : Promise.resolve(null),
    listWikiPagesLite().catch(() => []),
  ]);

  const mainCharacter = mainCharacterResult.ok
    ? mainCharacterResult.value
    : null;
  const mainIntegrityError = mainCharacterResult.ok
    ? null
    : mainCharacterResult.message;
  const firstCharRef = myCharRefs[0];
  const firstCharId = firstCharRef?._id ? String(firstCharRef._id) : null;
  const mainCharacterId = mainCharacter
    ? String(mainCharacter._id)
    : null;
  const firstIsMain =
    Boolean(firstCharId) && firstCharId === mainCharacterId;

  const [balance, enrichedUpcoming, firstCharacter] = await Promise.all([
    mainCharacterId
      ? getCharacterBalance(mainCharacterId).catch(() => 0)
      : Promise.resolve(0),
    upcomingRaw.length > 0
      ? enrichSessions(upcomingRaw, viewerDiscordId).catch(() => [])
      : Promise.resolve(
          [] as Awaited<ReturnType<typeof enrichSessions>>,
        ),
    firstCharId && !firstIsMain
      ? findCharacterById(firstCharId).catch(() => null)
      : Promise.resolve(null),
  ]);

  const displayCharacter = (
    firstIsMain ? mainCharacter : firstCharacter ?? mainCharacter
  ) as Character | null;
  const myRsvpUpcoming = enrichedUpcoming
    .filter(
      ({ raw, myRsvp }) =>
        myRsvp === "YES" && raw.status !== "CANCELED",
    )
    .slice(0, 3)
    .map(({ raw }) => serializeDashboardSession(raw));
  const pendingResponse = enrichedUpcoming
    .filter(
      ({ raw, myRsvp }) =>
        myRsvp === null &&
        (raw.status === "OPEN" || raw.status === "CLOSING"),
    )
    .slice(0, 5)
    .map(({ raw }) => serializeDashboardSession(raw));
  const recentWikis = [...wikiPages]
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() -
        new Date(left.updatedAt).getTime(),
    )
    .slice(0, 3)
    .map((page) => ({
      _id: page._id?.toString() ?? "",
      title: page.title,
      updatedAt: new Date(page.updatedAt).toISOString(),
    }));
  const notificationPreview = notifications.slice(0, 5).map(
    (notification) => ({
      ...notification,
      _id: notification._id?.toString() ?? "",
      createdAt: new Date(notification.createdAt).toISOString(),
    }),
  );
  const todaySessionCount = todayMergedSessions.filter(
    (session) =>
      session.status !== "CANCELED" &&
      toKstDateString(session.targetDateTime) === todayKst,
  ).length;
  const characterPointBalance =
    displayCharacter?.type === "AGENT"
      ? (displayCharacter.play?.points ?? 0)
      : null;

  return {
    displayCharacter: displayCharacter
      ? (JSON.parse(JSON.stringify(displayCharacter)) as Character)
      : null,
    balance,
    characterPointBalance,
    characterPointHref: displayCharacter
      ? `/erp/characters/${String(displayCharacter._id)}`
      : "/erp/characters",
    discordLinked: Boolean(viewerDiscordId),
    joinedDays: user ? daysSinceCreated(user.createdAt) : 0,
    mainIntegrityError,
    myCharacterCount: myCharRefs.length,
    myRsvpUpcoming,
    mySessionCount,
    notificationPreview,
    pendingResponse,
    recentWikis,
    todaySessionCount,
    unreadCount,
  };
}
