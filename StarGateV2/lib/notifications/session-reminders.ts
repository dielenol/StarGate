import type {
  CreateNotificationInput,
  Session,
  SessionResponse,
  TrpgSession,
  User,
} from "@stargate/shared-db";

import {
  claimSessionStartReminder,
  findResponsesBySessionIds,
  findSessionsForStartReminder,
  markSessionStartReminderSent,
  releaseSessionStartReminderClaim,
} from "@/lib/db/sessions";
import {
  claimReminder,
  findDueReminderSessions,
  markReminderSent,
} from "@/lib/db/trpg-sessions";
import { findUsersByDiscordIds } from "@/lib/db/users";
import { notifyUsers } from "@/lib/notifications/events";

const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;
const CLAIM_LEASE_MS = 10 * 60 * 1000;

type ReminderSource = "registra" | "trpg";
type ReminderStatus = "sent" | "skipped" | "failed";

interface ReminderResult {
  source: ReminderSource;
  sessionId: string;
  title: string;
  status: ReminderStatus;
  recipients: number;
  notifications: number;
  reason?: string;
}

interface ReminderSourceSummary {
  candidates: number;
  sent: number;
  skipped: number;
  failed: number;
  recipients: number;
  notifications: number;
  items: ReminderResult[];
}

export interface SessionReminderSummary {
  now: string;
  windowEnd: string;
  registra: ReminderSourceSummary;
  trpg: ReminderSourceSummary;
}

function summarize(items: ReminderResult[], candidates: number): ReminderSourceSummary {
  return {
    candidates,
    sent: items.filter((item) => item.status === "sent").length,
    skipped: items.filter((item) => item.status === "skipped").length,
    failed: items.filter((item) => item.status === "failed").length,
    recipients: items.reduce((sum, item) => sum + item.recipients, 0),
    notifications: items.reduce((sum, item) => sum + item.notifications, 0),
    items,
  };
}

function sessionIdOf(session: { _id?: unknown }): string {
  return session._id?.toString() ?? "";
}

function leaseUntil(now: Date): Date {
  return new Date(now.getTime() + CLAIM_LEASE_MS);
}

function formatKstDateTime(value: Date | string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function uniqueDiscordIds(discordIds: readonly string[]): string[] {
  return Array.from(
    new Set(discordIds.map((id) => id.trim()).filter((id) => id.length > 0)),
  );
}

function activeUsersWithIds(users: readonly User[]): User[] {
  return users.filter((user) => user.status === "ACTIVE" && Boolean(user._id));
}

async function findActiveUsersByDiscordIds(discordIds: readonly string[]) {
  const unique = uniqueDiscordIds(discordIds);
  if (unique.length === 0) return [];

  const users = await findUsersByDiscordIds(unique);
  return activeUsersWithIds(users);
}

function buildRegistraNotification(
  session: Session,
  userId: string,
): CreateNotificationInput {
  return {
    userId,
    type: "SESSION_REMIND",
    title: "세션 시작 알림",
    message: [
      session.title,
      `${formatKstDateTime(session.targetDateTime)} KST`,
      "참여 확정",
    ].join(" · "),
    link: "/erp/sessions",
  };
}

function buildTrpgNotification(
  session: TrpgSession,
  userId: string,
): CreateNotificationInput {
  const targetDateTime = `${session.date}T${session.startTime}:00+09:00`;
  return {
    userId,
    type: "SESSION_REMIND",
    title: "TRPG 세션 시작 알림",
    message: [
      session.title,
      `${formatKstDateTime(targetDateTime)} KST`,
      "참여 예정",
    ].join(" · "),
    link: "/erp/sessions",
  };
}

function yesResponderDiscordIds(responses: readonly SessionResponse[]): string[] {
  return responses
    .filter((response) => response.status === "YES")
    .map((response) => response.userId);
}

async function processRegistraSession(
  session: Session,
  now: Date,
): Promise<ReminderResult> {
  const sessionId = sessionIdOf(session);
  if (!sessionId) {
    return {
      source: "registra",
      sessionId: "",
      title: session.title,
      status: "skipped",
      recipients: 0,
      notifications: 0,
      reason: "missing-session-id",
    };
  }

  const claimToken = crypto.randomUUID();
  const claimed = await claimSessionStartReminder(
    sessionId,
    claimToken,
    leaseUntil(now),
  );
  if (!claimed) {
    return {
      source: "registra",
      sessionId,
      title: session.title,
      status: "skipped",
      recipients: 0,
      notifications: 0,
      reason: "claim-not-acquired",
    };
  }

  try {
    const responses = await findResponsesBySessionIds([sessionId]);
    const recipients = await findActiveUsersByDiscordIds(
      yesResponderDiscordIds(responses),
    );
    const notifications = recipients.map((user) =>
      buildRegistraNotification(session, user._id!.toString()),
    );

    await notifyUsers(notifications);
    const marked = await markSessionStartReminderSent(sessionId, claimToken);

    return {
      source: "registra",
      sessionId,
      title: session.title,
      status: marked ? "sent" : "failed",
      recipients: recipients.length,
      notifications: notifications.length,
      reason: marked ? undefined : "mark-sent-failed",
    };
  } catch (error) {
    await releaseSessionStartReminderClaim(sessionId, claimToken).catch(
      (releaseError) => {
        console.warn("[session-reminders] release registra claim failed", {
          sessionId,
          error:
            releaseError instanceof Error
              ? releaseError.message
              : String(releaseError),
        });
      },
    );

    return {
      source: "registra",
      sessionId,
      title: session.title,
      status: "failed",
      recipients: 0,
      notifications: 0,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function processTrpgSession(
  session: TrpgSession,
  now: Date,
): Promise<ReminderResult> {
  const sessionId = sessionIdOf(session);
  if (!sessionId) {
    return {
      source: "trpg",
      sessionId: "",
      title: session.title,
      status: "skipped",
      recipients: 0,
      notifications: 0,
      reason: "missing-session-id",
    };
  }

  const claimed = await claimReminder(sessionId, leaseUntil(now));
  if (!claimed) {
    return {
      source: "trpg",
      sessionId,
      title: session.title,
      status: "skipped",
      recipients: 0,
      notifications: 0,
      reason: "claim-not-acquired",
    };
  }

  try {
    const recipients = await findActiveUsersByDiscordIds(
      session.participantDiscordIds,
    );
    const notifications = recipients.map((user) =>
      buildTrpgNotification(session, user._id!.toString()),
    );

    await notifyUsers(notifications);
    await markReminderSent(sessionId);

    return {
      source: "trpg",
      sessionId,
      title: session.title,
      status: "sent",
      recipients: recipients.length,
      notifications: notifications.length,
    };
  } catch (error) {
    return {
      source: "trpg",
      sessionId,
      title: session.title,
      status: "failed",
      recipients: 0,
      notifications: 0,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runSessionReminderNotifications(
  now = new Date(),
): Promise<SessionReminderSummary> {
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_MS);
  const [registraCandidates, trpgCandidates] = await Promise.all([
    findSessionsForStartReminder(),
    findDueReminderSessions(now, windowEnd),
  ]);

  const registraItems: ReminderResult[] = [];
  for (const session of registraCandidates) {
    registraItems.push(await processRegistraSession(session, now));
  }

  const trpgItems: ReminderResult[] = [];
  for (const session of trpgCandidates) {
    trpgItems.push(await processTrpgSession(session, now));
  }

  return {
    now: now.toISOString(),
    windowEnd: windowEnd.toISOString(),
    registra: summarize(registraItems, registraCandidates.length),
    trpg: summarize(trpgItems, trpgCandidates.length),
  };
}
