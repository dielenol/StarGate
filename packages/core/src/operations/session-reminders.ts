import type {
  CreateNotificationOnceResult,
  CreateNotificationInput,
  Session,
  SessionResponse,
  TrpgSession,
  User,
} from "@stargate/shared-db";

import {
  createNotificationOnce,
  findResponsesBySessionIds,
  findUsersByDiscordIds,
  sessionsCol,
  trpgSessionsCol,
} from "@stargate/shared-db";

const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;

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

interface SessionReminderDependencies {
  findRegistraCandidates?: (
    windowStart: Date,
    windowEnd: Date,
  ) => Promise<Session[]>;
  findTrpgCandidates?: (
    windowStart: Date,
    windowEnd: Date,
  ) => Promise<TrpgSession[]>;
  findRegistraResponses?: (
    sessionIds: string[],
  ) => Promise<SessionResponse[]>;
  findUsers?: typeof findUsersByDiscordIds;
  createOnce?: (
    input: CreateNotificationInput & { dedupeKey: string },
  ) => Promise<CreateNotificationOnceResult>;
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

export function sessionReminderDedupeKey(
  source: ReminderSource,
  sessionId: string,
  occurrenceKey: string,
  userId: string,
): string {
  return `erp-session-reminder:v1:${source}:${sessionId}:${occurrenceKey}:${userId}`;
}

function buildRegistraNotification(
  session: Session,
  sessionId: string,
  userId: string,
): CreateNotificationInput & { dedupeKey: string } {
  return {
    userId,
    dedupeKey: sessionReminderDedupeKey(
      "registra",
      sessionId,
      new Date(session.targetDateTime).toISOString(),
      userId,
    ),
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
  sessionId: string,
  userId: string,
): CreateNotificationInput & { dedupeKey: string } {
  const targetDateTime = `${session.date}T${session.startTime}:00+09:00`;
  return {
    userId,
    dedupeKey: sessionReminderDedupeKey(
      "trpg",
      sessionId,
      `${session.date}T${session.startTime}`,
      userId,
    ),
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

function toKstDateString(date: Date): string {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

async function findRegistraReminderCandidates(
  windowStart: Date,
  windowEnd: Date,
): Promise<Session[]> {
  const col = await sessionsCol();
  return col
    .find({
      status: { $in: ["OPEN", "CLOSING", "CLOSED"] },
      targetDateTime: { $gt: windowStart, $lte: windowEnd },
    })
    .sort({ targetDateTime: 1 })
    .toArray();
}

async function findTrpgReminderCandidates(
  windowStart: Date,
  windowEnd: Date,
): Promise<TrpgSession[]> {
  const col = await trpgSessionsCol();
  const candidates = await col
    .find({
      status: "open",
      date: {
        $gte: toKstDateString(windowStart),
        $lte: toKstDateString(windowEnd),
      },
    })
    .sort({ date: 1, startTime: 1 })
    .toArray();

  return candidates.filter((session) => {
    const startsAt = new Date(
      `${session.date}T${session.startTime}:00+09:00`,
    );
    return startsAt > windowStart && startsAt <= windowEnd;
  });
}

async function createReminderNotifications(
  inputs: readonly (CreateNotificationInput & { dedupeKey: string })[],
  createOnce: NonNullable<SessionReminderDependencies["createOnce"]>,
): Promise<{ created: number; duplicate: number; errors: string[] }> {
  let created = 0;
  let duplicate = 0;
  const errors: string[] = [];

  for (const input of inputs) {
    try {
      const result = await createOnce(input);
      if (result.created) created += 1;
      else duplicate += 1;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return { created, duplicate, errors };
}

async function processRegistraSession(
  session: Session,
  dependencies: SessionReminderDependencies,
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

  try {
    const findResponses =
      dependencies.findRegistraResponses ?? findResponsesBySessionIds;
    const findUsers = dependencies.findUsers ?? findUsersByDiscordIds;
    const createOnce = dependencies.createOnce ?? createNotificationOnce;
    const responses = await findResponses([sessionId]);
    const discordIds = uniqueDiscordIds(yesResponderDiscordIds(responses));
    const users =
      discordIds.length === 0 ? [] : await findUsers(discordIds);
    const recipients = activeUsersWithIds(users);
    const notifications = recipients.map((user) =>
      buildRegistraNotification(
        session,
        sessionId,
        user._id!.toString(),
      ),
    );
    const delivery = await createReminderNotifications(
      notifications,
      createOnce,
    );

    return {
      source: "registra",
      sessionId,
      title: session.title,
      status:
        delivery.errors.length > 0
          ? "failed"
          : delivery.created > 0
            ? "sent"
            : "skipped",
      recipients: recipients.length,
      notifications: delivery.created,
      reason:
        delivery.errors.length > 0
          ? delivery.errors.join("; ")
          : recipients.length === 0
            ? "no-active-recipients"
            : delivery.created === 0
              ? "already-notified"
              : undefined,
    };
  } catch (error) {
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
  dependencies: SessionReminderDependencies,
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

  try {
    const findUsers = dependencies.findUsers ?? findUsersByDiscordIds;
    const createOnce = dependencies.createOnce ?? createNotificationOnce;
    const discordIds = uniqueDiscordIds(session.participantDiscordIds);
    const users =
      discordIds.length === 0 ? [] : await findUsers(discordIds);
    const recipients = activeUsersWithIds(users);
    const notifications = recipients.map((user) =>
      buildTrpgNotification(session, sessionId, user._id!.toString()),
    );
    const delivery = await createReminderNotifications(
      notifications,
      createOnce,
    );

    return {
      source: "trpg",
      sessionId,
      title: session.title,
      status:
        delivery.errors.length > 0
          ? "failed"
          : delivery.created > 0
            ? "sent"
            : "skipped",
      recipients: recipients.length,
      notifications: delivery.created,
      reason:
        delivery.errors.length > 0
          ? delivery.errors.join("; ")
          : recipients.length === 0
            ? "no-active-recipients"
            : delivery.created === 0
              ? "already-notified"
              : undefined,
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
  dependencies: SessionReminderDependencies = {},
): Promise<SessionReminderSummary> {
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_MS);
  const findRegistraCandidates =
    dependencies.findRegistraCandidates ?? findRegistraReminderCandidates;
  const findTrpgCandidates =
    dependencies.findTrpgCandidates ?? findTrpgReminderCandidates;
  const [registraCandidates, trpgCandidates] = await Promise.all([
    findRegistraCandidates(now, windowEnd),
    findTrpgCandidates(now, windowEnd),
  ]);

  const registraItems: ReminderResult[] = [];
  for (const session of registraCandidates) {
    registraItems.push(await processRegistraSession(session, dependencies));
  }

  const trpgItems: ReminderResult[] = [];
  for (const session of trpgCandidates) {
    trpgItems.push(await processTrpgSession(session, dependencies));
  }

  return {
    now: now.toISOString(),
    windowEnd: windowEnd.toISOString(),
    registra: summarize(registraItems, registraCandidates.length),
    trpg: summarize(trpgItems, trpgCandidates.length),
  };
}
