/**
 * 세션 CRUD 리포지토리
 *
 * sessions 컬렉션에 대한 생성, 조회, 상태 업데이트를 담당합니다.
 */

import { ObjectId, type Filter } from "mongodb";

import type {
  Session,
  SessionFinalizationKind,
  SessionStatus,
} from "../types/index.js";

import { sessionResponsesCol, sessionsCol } from "../collections.js";

/** MongoDB 내부 _id는 ObjectId이므로 필터용 타입 */
type SessionFilter = Filter<Session> & { _id?: ObjectId };

export type UpdateOpenSessionTimeResult = "updated" | "not_open";
export type ReminderClaimResult = { token: string } | null;

/** 세션 생성 시 필요한 입력 (DB 자동 필드 제외) */
export type CreateSessionInput = Omit<
  Session,
  "_id" | "createdAt" | "updatedAt"
> & { createdAt?: Date; updatedAt?: Date };

/** 새 세션을 DB에 저장합니다. */
export async function createSession(input: CreateSessionInput): Promise<string> {
  const col = await sessionsCol();
  const now = new Date();
  const doc: Session = {
    ...input,
    createdAt: now,
    updatedAt: now,
  };

  const result = await col.insertOne(doc);
  return result.insertedId.toString();
}

/** ID로 세션을 조회합니다. */
export async function findSessionById(sessionId: string): Promise<Session | null> {
  if (!ObjectId.isValid(sessionId)) return null;

  const col = await sessionsCol();
  const doc = await col.findOne({
    _id: new ObjectId(sessionId),
  } as SessionFilter);
  return doc;
}

/** 세션 상태를 업데이트합니다. */
export async function updateSessionStatus(
  sessionId: string,
  status: SessionStatus
): Promise<boolean> {
  if (!ObjectId.isValid(sessionId)) return false;

  const col = await sessionsCol();
  const result = await col.updateOne(
    { _id: new ObjectId(sessionId) } as SessionFilter,
    { $set: { status, updatedAt: new Date() } }
  );
  return result.modifiedCount > 0;
}

/** 세션의 공지 메시지 ID를 업데이트합니다. */
export async function updateSessionMessageId(
  sessionId: string,
  messageId: string
): Promise<boolean> {
  if (!ObjectId.isValid(sessionId)) return false;

  const col = await sessionsCol();
  const result = await col.updateOne(
    { _id: new ObjectId(sessionId) } as SessionFilter,
    { $set: { messageId, updatedAt: new Date() } }
  );
  return result.modifiedCount > 0;
}

/** 세션을 삭제합니다. */
export async function deleteSessionById(sessionId: string): Promise<boolean> {
  if (!ObjectId.isValid(sessionId)) return false;

  const col = await sessionsCol();
  const result = await col.deleteOne({
    _id: new ObjectId(sessionId),
  } as SessionFilter);
  return result.deletedCount > 0;
}

/** 세션 상태를 현재 값이 일치할 때만 갱신합니다(CAS). */
export async function updateSessionStatusIfCurrent(
  sessionId: string,
  currentStatuses: SessionStatus | SessionStatus[],
  nextStatus: SessionStatus
): Promise<boolean> {
  if (!ObjectId.isValid(sessionId)) return false;

  const expected = Array.isArray(currentStatuses)
    ? currentStatuses
    : [currentStatuses];

  const col = await sessionsCol();
  const result = await col.updateOne(
    {
      _id: new ObjectId(sessionId),
      status: { $in: expected },
    } as unknown as SessionFilter,
    { $set: { status: nextStatus, updatedAt: new Date() } }
  );
  return result.modifiedCount > 0;
}

/** 마감 시간이 지난 OPEN 상태 세션을 조회합니다. */
export async function findOpenSessionsPastClose(
  guildId?: string
): Promise<Session[]> {
  const col = await sessionsCol();
  const now = new Date();
  const filter: Record<string, unknown> = {
    status: "OPEN",
    closeDateTime: { $lte: now },
  };
  if (guildId) filter.guildId = guildId;

  return col.find(filter).toArray();
}

/** 모든 OPEN 세션을 조회합니다. */
export async function findAllOpenSessions(): Promise<Session[]> {
  const col = await sessionsCol();
  return col.find({ status: "OPEN" }).toArray();
}

/** 특정 길드의 OPEN 세션을 최근 생성 순으로 조회합니다. */
export async function findOpenSessionsByGuild(
  guildId: string
): Promise<Session[]> {
  const col = await sessionsCol();
  return col
    .find({ guildId, status: "OPEN" })
    .sort({ createdAt: -1 })
    .toArray();
}

/** 길드의 OPEN/CLOSED 세션을 세션 일시 오름차순으로 최대 limit건 조회합니다. */
export async function findOpenAndClosedSessionsByGuildOrderByTarget(
  guildId: string,
  limit: number
): Promise<Session[]> {
  const col = await sessionsCol();
  return col
    .find({
      guildId,
      status: { $in: ["OPEN", "CLOSING", "CANCELING", "CLOSED"] },
    })
    .sort({ targetDateTime: 1 })
    .limit(limit)
    .toArray();
}

/** 길드·연월로 targetDateTime이 해당 달에 속하는 세션을 조회합니다. */
export async function findSessionsByGuildInMonth(
  guildId: string,
  year: number,
  monthIndex: number
): Promise<Session[]> {
  const col = await sessionsCol();
  const start = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  return col
    .find({
      guildId,
      status: { $in: ["OPEN", "CLOSING", "CANCELING", "CLOSED", "CANCELED"] },
      targetDateTime: { $gte: start, $lte: end },
    })
    .sort({ targetDateTime: 1 })
    .toArray();
}

/** 길드 내 시작 예정(OPEN) 세션을 가까운 순으로 limit건 조회합니다. */
export async function findUpcomingSessionsByGuild(
  guildId: string,
  limit = 3
): Promise<Session[]> {
  const col = await sessionsCol();
  return col
    .find({
      guildId,
      status: "OPEN",
      targetDateTime: { $gte: new Date() },
    })
    .sort({ targetDateTime: 1 })
    .limit(limit)
    .toArray();
}

/** 세션 시작 24시간 이내이면서 아직 시작 전인 세션 중, 시작 리마인드를 아직 안 보낸 것. */
export async function findSessionsForStartReminder(): Promise<Session[]> {
  const col = await sessionsCol();
  const now = new Date();
  const within24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const filter: Filter<Session> = {
    status: { $in: ["OPEN", "CLOSING", "CLOSED"] },
    targetDateTime: { $gt: now, $lte: within24h },
    $or: [
      { sessionStartReminder24hSent: { $exists: false } },
      { sessionStartReminder24hSent: false },
    ],
    $and: [
      {
        $or: [
          { sessionStartReminder24hClaimLeaseUntil: { $exists: false } },
          { sessionStartReminder24hClaimLeaseUntil: { $lte: now } },
        ],
      },
    ],
  };

  return col.find(filter).toArray();
}

/** 길드 내 가장 최근 생성된 OPEN 세션 1건을 조회합니다. */
export async function findLatestOpenSessionByGuild(
  guildId: string
): Promise<Session | null> {
  const col = await sessionsCol();
  return col.findOne(
    { guildId, status: "OPEN" },
    { sort: { createdAt: -1 } }
  );
}

/** 길드 내 가장 최근 마감된(CLOSED) 세션 1건을 조회합니다. */
export async function findLatestClosedSessionByGuild(
  guildId: string
): Promise<Session | null> {
  const col = await sessionsCol();
  return col.findOne(
    { guildId, status: "CLOSED" },
    { sort: { updatedAt: -1 } }
  );
}

/** ID로 세션을 조회하되 해당 길드에 속한지 검증합니다. */
export async function findSessionByIdInGuild(
  sessionId: string,
  guildId: string
): Promise<Session | null> {
  const s = await findSessionById(sessionId);
  if (!s || s.guildId !== guildId) return null;
  return s;
}

/** 응답 마감 일시만 변경합니다. */
export async function updateSessionCloseDateTime(
  sessionId: string,
  closeDateTime: Date
): Promise<UpdateOpenSessionTimeResult> {
  if (!ObjectId.isValid(sessionId)) return "not_open";

  const col = await sessionsCol();
  const result = await col.updateOne(
    { _id: new ObjectId(sessionId), status: "OPEN" } as SessionFilter,
    {
      $set: {
        closeDateTime,
        updatedAt: new Date(),
      },
    }
  );
  return result.matchedCount > 0 ? "updated" : "not_open";
}

/** 세션 진행 일시를 변경합니다. 리마인드 플래그 초기화. */
export async function updateSessionTargetDateTime(
  sessionId: string,
  targetDateTime: Date
): Promise<UpdateOpenSessionTimeResult> {
  if (!ObjectId.isValid(sessionId)) return "not_open";

  const col = await sessionsCol();
  const result = await col.updateOne(
    { _id: new ObjectId(sessionId), status: "OPEN" } as SessionFilter,
    {
      $set: {
        targetDateTime,
        updatedAt: new Date(),
        sessionStartReminder24hSent: false,
      },
    }
  );
  return result.matchedCount > 0 ? "updated" : "not_open";
}

/** 세션 일시·응답 마감을 한 번에 갱신합니다. */
export async function updateSessionTargetAndCloseDateTime(
  sessionId: string,
  targetDateTime: Date,
  closeDateTime: Date
): Promise<UpdateOpenSessionTimeResult> {
  if (!ObjectId.isValid(sessionId)) return "not_open";

  const col = await sessionsCol();
  const result = await col.updateOne(
    { _id: new ObjectId(sessionId), status: "OPEN" } as SessionFilter,
    {
      $set: {
        targetDateTime,
        closeDateTime,
        updatedAt: new Date(),
        sessionStartReminder24hSent: false,
      },
    }
  );
  return result.matchedCount > 0 ? "updated" : "not_open";
}

/** 리마인드 발송 플래그를 설정합니다. */
export async function setSessionReminderFlags(
  sessionId: string,
  flags: { sessionStartReminder24hSent?: boolean }
): Promise<boolean> {
  if (!ObjectId.isValid(sessionId)) return false;

  const $set: Record<string, unknown> = { updatedAt: new Date() };
  if (flags.sessionStartReminder24hSent !== undefined)
    $set.sessionStartReminder24hSent = flags.sessionStartReminder24hSent;

  const col = await sessionsCol();
  const result = await col.updateOne(
    { _id: new ObjectId(sessionId) } as SessionFilter,
    { $set }
  );
  return result.modifiedCount > 0;
}

export async function claimSessionStartReminder(
  sessionId: string,
  claimToken: string,
  leaseUntil: Date
): Promise<ReminderClaimResult> {
  if (!ObjectId.isValid(sessionId)) return null;

  const col = await sessionsCol();
  const now = new Date();
  const result = await col.findOneAndUpdate(
    {
      _id: new ObjectId(sessionId),
      status: { $in: ["OPEN", "CLOSING", "CLOSED"] },
      $or: [
        { sessionStartReminder24hSent: { $exists: false } },
        { sessionStartReminder24hSent: false },
      ],
      $and: [
        {
          $or: [
            { sessionStartReminder24hClaimLeaseUntil: { $exists: false } },
            { sessionStartReminder24hClaimLeaseUntil: { $lte: now } },
          ],
        },
      ],
    } as unknown as SessionFilter,
    {
      $set: {
        sessionStartReminder24hClaimToken: claimToken,
        sessionStartReminder24hClaimedAt: now,
        sessionStartReminder24hClaimLeaseUntil: leaseUntil,
        updatedAt: now,
      },
    },
    {
      returnDocument: "after",
      includeResultMetadata: true,
    }
  );

  return result.value ? { token: claimToken } : null;
}

export async function markSessionStartReminderSent(
  sessionId: string,
  claimToken: string
): Promise<boolean> {
  if (!ObjectId.isValid(sessionId)) return false;

  const col = await sessionsCol();
  const result = await col.updateOne(
    {
      _id: new ObjectId(sessionId),
      sessionStartReminder24hClaimToken: claimToken,
      $or: [
        { sessionStartReminder24hSent: { $exists: false } },
        { sessionStartReminder24hSent: false },
      ],
    } as unknown as SessionFilter,
    {
      $set: {
        sessionStartReminder24hSent: true,
        updatedAt: new Date(),
      },
      $unset: {
        sessionStartReminder24hClaimToken: "",
        sessionStartReminder24hClaimedAt: "",
        sessionStartReminder24hClaimLeaseUntil: "",
      },
    }
  );
  return result.modifiedCount > 0;
}

export async function releaseSessionStartReminderClaim(
  sessionId: string,
  claimToken: string
): Promise<boolean> {
  if (!ObjectId.isValid(sessionId)) return false;

  const col = await sessionsCol();
  const result = await col.updateOne(
    {
      _id: new ObjectId(sessionId),
      sessionStartReminder24hClaimToken: claimToken,
      $or: [
        { sessionStartReminder24hSent: { $exists: false } },
        { sessionStartReminder24hSent: false },
      ],
    } as unknown as SessionFilter,
    {
      $unset: {
        sessionStartReminder24hClaimToken: "",
        sessionStartReminder24hClaimedAt: "",
        sessionStartReminder24hClaimLeaseUntil: "",
      },
      $set: {
        updatedAt: new Date(),
      },
    }
  );
  return result.modifiedCount > 0;
}

export async function extendSessionStartReminderClaimLease(
  sessionId: string,
  claimToken: string,
  leaseUntil: Date
): Promise<boolean> {
  if (!ObjectId.isValid(sessionId)) return false;

  const col = await sessionsCol();
  const result = await col.updateOne(
    {
      _id: new ObjectId(sessionId),
      sessionStartReminder24hClaimToken: claimToken,
      $or: [
        { sessionStartReminder24hSent: { $exists: false } },
        { sessionStartReminder24hSent: false },
      ],
    } as unknown as SessionFilter,
    {
      $set: {
        sessionStartReminder24hClaimLeaseUntil: leaseUntil,
        updatedAt: new Date(),
      },
    }
  );
  return result.modifiedCount > 0;
}

export async function beginSessionFinalization(
  sessionId: string,
  nextStatus: "CLOSING" | "CANCELING",
  kind: SessionFinalizationKind,
  requestedBy?: string
): Promise<boolean> {
  if (!ObjectId.isValid(sessionId)) return false;

  const col = await sessionsCol();
  const result = await col.updateOne(
    {
      _id: new ObjectId(sessionId),
      status: "OPEN",
    } as SessionFilter,
    {
      $set: {
        status: nextStatus,
        updatedAt: new Date(),
        finalizationPending: true,
        finalizationKind: kind,
        finalizationAnnouncementDone: false,
        finalizationLogDone: false,
        finalizationRequestedBy: requestedBy,
        finalizationRequestedAt: new Date(),
      },
      $unset: {
        finalizationResultMessageId: "",
      },
    }
  );
  return result.modifiedCount > 0;
}

export async function markSessionFinalizationAnnouncementDone(
  sessionId: string,
  status: "CLOSING" | "CANCELING"
): Promise<boolean> {
  if (!ObjectId.isValid(sessionId)) return false;

  const col = await sessionsCol();
  const result = await col.updateOne(
    {
      _id: new ObjectId(sessionId),
      status,
      finalizationPending: true,
    } as SessionFilter,
    {
      $set: {
        finalizationAnnouncementDone: true,
        updatedAt: new Date(),
      },
    }
  );
  return result.modifiedCount > 0;
}

export async function recordSessionFinalizationResultMessage(
  sessionId: string,
  messageId: string
): Promise<boolean> {
  if (!ObjectId.isValid(sessionId)) return false;

  const col = await sessionsCol();
  const result = await col.updateOne(
    {
      _id: new ObjectId(sessionId),
      status: "CLOSING",
      finalizationPending: true,
    } as SessionFilter,
    {
      $set: {
        finalizationResultMessageId: messageId,
        updatedAt: new Date(),
      },
    }
  );
  return result.modifiedCount > 0;
}

export async function markSessionFinalizationLogDone(
  sessionId: string,
  status: "CLOSING" | "CANCELING"
): Promise<boolean> {
  if (!ObjectId.isValid(sessionId)) return false;

  const col = await sessionsCol();
  const result = await col.updateOne(
    {
      _id: new ObjectId(sessionId),
      status,
      finalizationPending: true,
    } as SessionFilter,
    {
      $set: {
        finalizationLogDone: true,
        updatedAt: new Date(),
      },
    }
  );
  return result.modifiedCount > 0;
}

export async function completeSessionFinalization(
  sessionId: string,
  currentStatus: "CLOSING" | "CANCELING",
  finalStatus: "CLOSED" | "CANCELED"
): Promise<boolean> {
  if (!ObjectId.isValid(sessionId)) return false;

  const col = await sessionsCol();
  const result = await col.updateOne(
    {
      _id: new ObjectId(sessionId),
      status: currentStatus,
      finalizationPending: true,
      finalizationAnnouncementDone: true,
      ...(currentStatus === "CLOSING"
        ? { finalizationResultMessageId: { $exists: true, $ne: "" } }
        : {}),
      finalizationLogDone: true,
    } as unknown as SessionFilter,
    {
      $set: {
        status: finalStatus,
        updatedAt: new Date(),
        finalizationPending: false,
      },
      $unset: {
        finalizationKind: "",
        finalizationAnnouncementDone: "",
        finalizationResultMessageId: "",
        finalizationLogDone: "",
        finalizationRequestedBy: "",
        finalizationRequestedAt: "",
      },
    }
  );
  return result.modifiedCount > 0;
}

/**
 * 이미 마감된(CLOSED) 세션을 사후 철회합니다. (CLOSED → CANCELED 직접 전이)
 *
 * 일반 `executeSessionCancel` 흐름은 OPEN만 다루지만, 확정 보고 이후에도
 * 운영 사유로 철회가 필요한 경우가 있어 별도 경로를 제공합니다.
 *
 * - 필터: `status === "CLOSED"` 인 건만 갱신 (동시성 가드)
 * - 기존 `finalizationPending`류 플래그는 이미 `completeSessionFinalization`에서
 *   `$unset` 처리돼 있으므로, 여기서는 상태만 전환합니다.
 */
export async function retractClosedSession(sessionId: string): Promise<boolean> {
  if (!ObjectId.isValid(sessionId)) return false;

  const col = await sessionsCol();
  const result = await col.updateOne(
    {
      _id: new ObjectId(sessionId),
      status: "CLOSED",
    } as SessionFilter,
    {
      $set: {
        status: "CANCELED",
        updatedAt: new Date(),
      },
    }
  );
  return result.modifiedCount > 0;
}

export async function findSessionsPendingFinalization(): Promise<Session[]> {
  const col = await sessionsCol();
  return col
    .find({
      finalizationPending: true,
      status: { $in: ["CLOSING", "CANCELING"] },
      finalizationKind: { $in: ["CLOSE", "CANCEL"] },
    } as unknown as SessionFilter)
    .sort({ finalizationRequestedAt: 1, updatedAt: 1 })
    .toArray();
}

/** 길드별 활성 세션 카운트 (전체/모집중/확정/취소/내 참여). 월 범위와 무관. */
export interface ActiveSessionCounts {
  all: number;
  open: number;
  closed: number;
  cancel: number;
  mine: number;
}

const ACTIVE_STATUSES: SessionStatus[] = [
  "OPEN",
  "CLOSING",
  "CLOSED",
  "CANCELING",
  "CANCELED",
];

/**
 * 길드의 활성 세션을 status별로 카운트합니다 (월 범위 무관).
 *
 * `mine`은 viewerDiscordId가 YES 회신한 세션 중 활성 상태인 것 카운트.
 * 페이지 헤더 STATUS 칩 표기 전용 — 본문 달력/리스트와 별개로 작동.
 */
export async function countActiveSessionsByGuild(
  guildId: string,
  viewerDiscordId: string | null,
): Promise<ActiveSessionCounts> {
  const sCol = await sessionsCol();

  const agg = await sCol
    .aggregate<{ _id: SessionStatus; count: number }>([
      { $match: { guildId, status: { $in: ACTIVE_STATUSES } } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ])
    .toArray();

  let all = 0;
  let open = 0;
  let closed = 0;
  let cancel = 0;
  for (const row of agg) {
    all += row.count;
    if (row._id === "OPEN" || row._id === "CLOSING") open += row.count;
    else if (row._id === "CLOSED") closed += row.count;
    else if (row._id === "CANCELING" || row._id === "CANCELED")
      cancel += row.count;
  }

  let mine = 0;
  if (viewerDiscordId) {
    const rCol = await sessionResponsesCol();
    const yesRows = await rCol
      .find({ userId: viewerDiscordId, status: "YES" })
      .project<{ sessionId?: string }>({ sessionId: 1 })
      .toArray();

    const validIds = yesRows
      .map((r) => r.sessionId)
      .filter(
        (id): id is string => typeof id === "string" && ObjectId.isValid(id),
      );

    if (validIds.length > 0) {
      mine = await sCol.countDocuments({
        _id: { $in: validIds.map((id) => new ObjectId(id)) },
        guildId,
        status: { $in: ACTIVE_STATUSES },
      } as unknown as SessionFilter);
    }
  }

  return { all, open, closed, cancel, mine };
}
