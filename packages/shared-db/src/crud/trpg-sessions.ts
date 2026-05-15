/**
 * trpg_sessions CRUD 리포지토리
 *
 * trpg-bot 의 신규 세션 모델(open/cancelled, 날짜+시각 분리, DM 알림 기반)을 다룬다.
 * 기존 registra-bot 공유 `sessions` 컬렉션과는 완전히 분리되어 있으며,
 * 스케줄러용 atomic claim 패턴(notification / reminder24h)을 제공한다.
 *
 * 진입 시점 검증:
 *  - `createTrpgSession` / `updateTrpgSession` 는 Zod 스키마로 입력을 parse 한다.
 *  - 검증 실패 시 `ZodError` 를 그대로 throw — 호출처(슬래시 커맨드 핸들러) 에서
 *    사용자 메시지로 매핑.
 *
 * 결과 union:
 *  - `updateTrpgSession` / `cancelTrpgSession` 은 단순 nullable 반환이 아니라
 *    `not-found` / `forbidden` / `not-open` (또는 `already-cancelled`) 를
 *    구분해 호출처가 서로 다른 응답 메시지를 낼 수 있도록 한다.
 *  - race-safe: 사전 조회로 사유를 판단한 뒤 `findOneAndUpdate` 의 status 필터로
 *    실제 갱신을 검증.
 *
 * @module crud/trpg-sessions
 */

import { ObjectId, type Filter } from "mongodb";

import type {
  CancelTrpgSessionResult,
  TrpgSession,
  UpdateTrpgSessionResult,
} from "../types/trpg-session.js";

import { trpgSessionsCol } from "../collections.js";
import {
  type CreateTrpgSessionInput,
  type UpdateTrpgSessionPatch,
  createTrpgSessionInputSchema,
  updateTrpgSessionPatchSchema,
} from "../schemas/trpg-session.schema.js";

/** MongoDB 내부 _id 는 ObjectId — 필터 타입 가드 */
type TrpgSessionFilter = Filter<TrpgSession> & { _id?: ObjectId };

/** 새 trpg 세션을 DB 에 저장하고 _id 를 반환한다. */
export async function createTrpgSession(
  input: CreateTrpgSessionInput,
): Promise<string> {
  // 진입 검증: 잘못된 date/time 포맷, 길이 초과를 DB 적재 전에 차단.
  const validated = createTrpgSessionInputSchema.parse(input);

  const col = await trpgSessionsCol();
  const now = new Date();
  const doc: TrpgSession = {
    ...validated,
    status: "open",
    notificationSentAt: null,
    notificationClaimLeaseUntil: null,
    reminderSentAt: null,
    reminderClaimLeaseUntil: null,
    cancellationNotificationQueuedAt: null,
    cancellationNotificationSentAt: null,
    cancellationNotificationClaimLeaseUntil: null,
    updateNotificationQueuedAt: null,
    updateNotificationSentAt: null,
    updateNotificationClaimLeaseUntil: null,
    updateNotificationRecipientDiscordIds: null,
    updateNotificationChanges: null,
    createdAt: now,
    updatedAt: now,
  };
  const result = await col.insertOne(doc);
  return result.insertedId.toString();
}

/** ID 로 trpg 세션을 조회한다. */
export async function findTrpgSessionById(
  id: string,
): Promise<TrpgSession | null> {
  if (!ObjectId.isValid(id)) return null;

  const col = await trpgSessionsCol();
  return col.findOne({ _id: new ObjectId(id) } as TrpgSessionFilter);
}

/**
 * 지정한 길드의 해당 연·월에 속한 open 세션을 날짜 오름차순으로 조회한다.
 *
 * `date` 는 "YYYY-MM-DD" 문자열 — 사전식 정렬이 시간 순서와 일치하므로
 * prefix range 매칭으로 인덱스를 활용한다.
 */
export async function findTrpgSessionsByMonth(
  guildId: string,
  year: number,
  /** 1-12 (1 = January) */
  month: number,
): Promise<TrpgSession[]> {
  const mm = String(month).padStart(2, "0");
  const start = `${year}-${mm}-01`;
  // 다음 달 첫 날을 exclusive 상한으로 — `< end` 비교는 인덱스 range scan.
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

  const col = await trpgSessionsCol();
  return col
    .find({
      guildId,
      status: "open",
      date: { $gte: start, $lt: end },
    })
    .sort({ date: 1, startTime: 1 })
    .toArray();
}

/**
 * 특정 날짜의 open 세션 목록 (충돌 검사 / 같은 날 일정 확인용).
 */
export async function findTrpgSessionsByDate(
  guildId: string,
  date: string,
): Promise<TrpgSession[]> {
  const col = await trpgSessionsCol();
  return col
    .find({ guildId, status: "open", date })
    .sort({ startTime: 1 })
    .toArray();
}

/**
 * 생성 알림 스케줄러용: 아직 생성 알림이 발송되지 않았고 lease 도 만료된 open 세션.
 *
 * - `notificationSentAt IS NULL`
 * - `notificationClaimLeaseUntil IS NULL OR notificationClaimLeaseUntil < now`
 */
export async function findUnnotifiedTrpgSessions(
  now: Date,
): Promise<TrpgSession[]> {
  const col = await trpgSessionsCol();
  return col
    .find({
      status: "open",
      $and: [
        {
          $or: [
            { notificationSentAt: { $exists: false } },
            { notificationSentAt: null },
          ],
        },
        {
          $or: [
            { notificationClaimLeaseUntil: { $exists: false } },
            { notificationClaimLeaseUntil: null },
            { notificationClaimLeaseUntil: { $lt: now } },
          ],
        },
      ],
    })
    .toArray();
}

/**
 * 24h 리마인드 스케줄러용: 시작 시각이 [windowStart, windowEnd] 사이이며
 * 아직 리마인드가 발송되지 않은 open 세션.
 *
 * `date` + `startTime` 은 둘 다 문자열이라 사전식으로 비교한다.
 * - "YYYY-MM-DD" + " " + "HH:mm" 결합값을 in-memory 필터로 한 번 더 정제하는 대신,
 *   인덱스 활용을 위해 1차 필터는 `date` range 로만 좁히고 호출처에서 정렬·재필터.
 *
 * windowStart / windowEnd 는 datetime(Date) 객체이며, 본 함수에서 string 으로 변환하여
 * 비교한다. 호출처는 KST 기준 24h 전후 윈도우를 그대로 전달하면 된다.
 */
export async function findDueReminderSessions(
  windowStart: Date,
  windowEnd: Date,
): Promise<TrpgSession[]> {
  if (windowStart > windowEnd) return [];

  // 윈도우의 날짜 범위를 한국 시각 기준으로 잘라낸다.
  // KST = UTC+9. Date 객체를 KST 로 환산해 "YYYY-MM-DD" 추출.
  const toKstDateString = (d: Date): string => {
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 10);
  };

  const startDate = toKstDateString(windowStart);
  const endDate = toKstDateString(windowEnd);

  const col = await trpgSessionsCol();
  const candidates = await col
    .find({
      status: "open",
      $or: [
        { reminderSentAt: { $exists: false } },
        { reminderSentAt: null },
      ],
      date: { $gte: startDate, $lte: endDate },
    })
    .toArray();

  // date+startTime 결합 datetime 이 윈도우 안에 있는지 재필터.
  // KST 기준 startTime 을 그대로 사용 — 호출처도 KST datetime 으로 들어오는 전제.
  const inWindow = candidates.filter((s) => {
    const dt = new Date(`${s.date}T${s.startTime}:00+09:00`);
    return dt >= windowStart && dt <= windowEnd;
  });

  return inWindow;
}

/**
 * 취소 알림 스케줄러용: 취소 시 대기열에 적재되었고 아직 알림이 발송되지 않은 세션.
 *
 * `cancellationNotificationQueuedAt` 이 존재하는 문서만 대상으로 삼아, 기능 배포 전부터
 * cancelled 상태였던 과거 세션이 뒤늦게 발송되는 것을 막는다.
 */
export async function findUnnotifiedCancelledTrpgSessions(
  now: Date,
): Promise<TrpgSession[]> {
  const col = await trpgSessionsCol();
  return col
    .find({
      status: "cancelled",
      cancellationNotificationQueuedAt: { $exists: true, $ne: null },
      $and: [
        {
          $or: [
            { cancellationNotificationSentAt: { $exists: false } },
            { cancellationNotificationSentAt: null },
          ],
        },
        {
          $or: [
            { cancellationNotificationClaimLeaseUntil: { $exists: false } },
            { cancellationNotificationClaimLeaseUntil: null },
            { cancellationNotificationClaimLeaseUntil: { $lt: now } },
          ],
        },
      ],
    })
    .toArray();
}

/**
 * 수정 알림 스케줄러용: 수정 시 대기열에 적재되었고 아직 알림이 발송되지 않은 세션.
 */
export async function findUnnotifiedUpdatedTrpgSessions(
  now: Date,
): Promise<TrpgSession[]> {
  const col = await trpgSessionsCol();
  return col
    .find({
      status: "open",
      updateNotificationQueuedAt: { $exists: true, $ne: null },
      $and: [
        {
          $or: [
            { updateNotificationSentAt: { $exists: false } },
            { updateNotificationSentAt: null },
          ],
        },
        {
          $or: [
            { updateNotificationClaimLeaseUntil: { $exists: false } },
            { updateNotificationClaimLeaseUntil: null },
            { updateNotificationClaimLeaseUntil: { $lt: now } },
          ],
        },
      ],
    })
    .toArray();
}

/**
 * 생성 알림 발송권을 원자적으로 선점한다.
 *
 * 동일 lease 기간 내에 다른 워커가 같은 세션을 다시 잡지 못하도록
 * `notificationClaimLeaseUntil` 을 `leaseUntil` 로 set.
 *
 * 멱등 판정 기준은 `matchedCount` — 동일 워커가 같은 lease 로 재호출했을 때
 * `$set` 값이 기존 값과 동일하면 `modifiedCount = 0` 이 되어 false 를 잘못
 * 반환하는 사고를 막는다. 필터가 일치하면 발송권 선점에 성공한 것.
 */
export async function claimNotification(
  sessionId: string,
  leaseUntil: Date,
): Promise<boolean> {
  if (!ObjectId.isValid(sessionId)) return false;

  const col = await trpgSessionsCol();
  const now = new Date();
  const result = await col.updateOne(
    {
      _id: new ObjectId(sessionId),
      status: "open",
      $or: [
        { notificationSentAt: { $exists: false } },
        { notificationSentAt: null },
      ],
      $and: [
        {
          $or: [
            { notificationClaimLeaseUntil: { $exists: false } },
            { notificationClaimLeaseUntil: null },
            { notificationClaimLeaseUntil: { $lt: now } },
          ],
        },
      ],
    } as unknown as TrpgSessionFilter,
    {
      $set: {
        notificationClaimLeaseUntil: leaseUntil,
        updatedAt: now,
      },
    },
  );

  return result.matchedCount > 0;
}

/** 생성 알림 발송 완료를 기록한다 (lease 해제 포함). */
export async function markNotificationSent(sessionId: string): Promise<void> {
  if (!ObjectId.isValid(sessionId)) return;

  const col = await trpgSessionsCol();
  const now = new Date();
  await col.updateOne(
    { _id: new ObjectId(sessionId) } as TrpgSessionFilter,
    {
      $set: {
        notificationSentAt: now,
        notificationClaimLeaseUntil: null,
        updatedAt: now,
      },
    },
  );
}

/**
 * 취소 알림 발송권을 원자적으로 선점한다.
 *
 * 취소 알림은 `cancelTrpgSession` 이 `cancellationNotificationQueuedAt` 을 찍은
 * 문서만 대상으로 삼는다.
 */
export async function claimCancellationNotification(
  sessionId: string,
  leaseUntil: Date,
): Promise<boolean> {
  if (!ObjectId.isValid(sessionId)) return false;

  const col = await trpgSessionsCol();
  const now = new Date();
  const result = await col.updateOne(
    {
      _id: new ObjectId(sessionId),
      status: "cancelled",
      cancellationNotificationQueuedAt: { $exists: true, $ne: null },
      $or: [
        { cancellationNotificationSentAt: { $exists: false } },
        { cancellationNotificationSentAt: null },
      ],
      $and: [
        {
          $or: [
            { cancellationNotificationClaimLeaseUntil: { $exists: false } },
            { cancellationNotificationClaimLeaseUntil: null },
            { cancellationNotificationClaimLeaseUntil: { $lt: now } },
          ],
        },
      ],
    } as unknown as TrpgSessionFilter,
    {
      $set: {
        cancellationNotificationClaimLeaseUntil: leaseUntil,
        updatedAt: now,
      },
    },
  );

  return result.matchedCount > 0;
}

/** 취소 알림 발송 완료를 기록한다 (lease 해제 포함). */
export async function markCancellationNotificationSent(
  sessionId: string,
): Promise<void> {
  if (!ObjectId.isValid(sessionId)) return;

  const col = await trpgSessionsCol();
  const now = new Date();
  await col.updateOne(
    { _id: new ObjectId(sessionId) } as TrpgSessionFilter,
    {
      $set: {
        cancellationNotificationSentAt: now,
        cancellationNotificationClaimLeaseUntil: null,
        updatedAt: now,
      },
    },
  );
}

/** 수정 알림 발송권을 원자적으로 선점한다. */
export async function claimUpdateNotification(
  sessionId: string,
  leaseUntil: Date,
): Promise<boolean> {
  if (!ObjectId.isValid(sessionId)) return false;

  const col = await trpgSessionsCol();
  const now = new Date();
  const result = await col.updateOne(
    {
      _id: new ObjectId(sessionId),
      status: "open",
      updateNotificationQueuedAt: { $exists: true, $ne: null },
      $or: [
        { updateNotificationSentAt: { $exists: false } },
        { updateNotificationSentAt: null },
      ],
      $and: [
        {
          $or: [
            { updateNotificationClaimLeaseUntil: { $exists: false } },
            { updateNotificationClaimLeaseUntil: null },
            { updateNotificationClaimLeaseUntil: { $lt: now } },
          ],
        },
      ],
    } as unknown as TrpgSessionFilter,
    {
      $set: {
        updateNotificationClaimLeaseUntil: leaseUntil,
        updatedAt: now,
      },
    },
  );

  return result.matchedCount > 0;
}

/** 수정 알림 발송 완료를 기록한다 (lease 해제 포함). */
export async function markUpdateNotificationSent(
  sessionId: string,
): Promise<void> {
  if (!ObjectId.isValid(sessionId)) return;

  const col = await trpgSessionsCol();
  const now = new Date();
  await col.updateOne(
    { _id: new ObjectId(sessionId) } as TrpgSessionFilter,
    {
      $set: {
        updateNotificationSentAt: now,
        updateNotificationClaimLeaseUntil: null,
        updatedAt: now,
      },
    },
  );
}

/**
 * 24h 리마인드 발송권을 원자적으로 선점한다. `claimNotification` 과 동일 패턴.
 *
 * `matchedCount` 기준 — 멱등성을 위한 동일한 이유.
 */
export async function claimReminder(
  sessionId: string,
  leaseUntil: Date,
): Promise<boolean> {
  if (!ObjectId.isValid(sessionId)) return false;

  const col = await trpgSessionsCol();
  const now = new Date();
  const result = await col.updateOne(
    {
      _id: new ObjectId(sessionId),
      status: "open",
      $or: [
        { reminderSentAt: { $exists: false } },
        { reminderSentAt: null },
      ],
      $and: [
        {
          $or: [
            { reminderClaimLeaseUntil: { $exists: false } },
            { reminderClaimLeaseUntil: null },
            { reminderClaimLeaseUntil: { $lt: now } },
          ],
        },
      ],
    } as unknown as TrpgSessionFilter,
    {
      $set: {
        reminderClaimLeaseUntil: leaseUntil,
        updatedAt: now,
      },
    },
  );

  return result.matchedCount > 0;
}

/** 24h 리마인드 발송 완료를 기록한다 (lease 해제 포함). */
export async function markReminderSent(sessionId: string): Promise<void> {
  if (!ObjectId.isValid(sessionId)) return;

  const col = await trpgSessionsCol();
  const now = new Date();
  await col.updateOne(
    { _id: new ObjectId(sessionId) } as TrpgSessionFilter,
    {
      $set: {
        reminderSentAt: now,
        reminderClaimLeaseUntil: null,
        updatedAt: now,
      },
    },
  );
}

function sameDiscordIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  if (set.size !== b.length) return false;
  return b.every((id) => set.has(id));
}

function unionDiscordIds(a: string[], b: string[]): string[] {
  return Array.from(new Set([...a, ...b]));
}

function buildUpdateNotificationState(
  existing: TrpgSession,
  validated: UpdateTrpgSessionPatch,
): {
  changes: string[];
  recipients: string[];
} {
  const changes: string[] = [];

  if (validated.title !== undefined && validated.title !== existing.title) {
    changes.push(`세션 제목 변경: ${existing.title} → ${validated.title}`);
  }

  const nextDate = validated.date ?? existing.date;
  const nextStartTime = validated.startTime ?? existing.startTime;
  if (nextDate !== existing.date || nextStartTime !== existing.startTime) {
    changes.push(
      `일시 변경: ${existing.date} ${existing.startTime} → ${nextDate} ${nextStartTime}`,
    );
  }

  const nextParticipantDiscordIds =
    validated.participantDiscordIds ?? existing.participantDiscordIds;
  if (
    validated.participantDiscordIds !== undefined &&
    !sameDiscordIdSet(existing.participantDiscordIds, nextParticipantDiscordIds)
  ) {
    const before = new Set(existing.participantDiscordIds);
    const after = new Set(nextParticipantDiscordIds);
    const added = nextParticipantDiscordIds.filter((id) => !before.has(id));
    const removed = existing.participantDiscordIds.filter((id) => !after.has(id));
    const parts = [
      added.length > 0 ? `추가 ${added.length}명` : null,
      removed.length > 0 ? `제외 ${removed.length}명` : null,
    ].filter((v): v is string => v !== null);
    changes.push(
      `참가 대상 변경: ${parts.length > 0 ? parts.join(", ") : "목록 조정"}`,
    );
  }

  return {
    changes,
    recipients: unionDiscordIds(
      existing.participantDiscordIds,
      nextParticipantDiscordIds,
    ),
  };
}

/**
 * 세션을 부분 갱신한다 (생성자 본인 검증 포함).
 *
 * 결과 union 으로 실패 사유를 구분:
 *  - `not-found`: ID 가 invalid 거나 해당 세션이 존재하지 않음
 *  - `forbidden`: requester 가 생성자가 아님
 *  - `not-open`: 세션이 이미 cancelled
 *
 * race-safe: 사전 조회로 사유를 추정한 뒤 `findOneAndUpdate` 의 status/owner
 * 필터로 한 번 더 검증. 사전 조회와 갱신 사이에 cancel 이 끼어들어도 update 가
 * 실패하면 다시 조회해 정확한 사유를 반환한다.
 *
 * 화이트리스트 필드만 `$set`. 날짜/시간 변경 시에는 24h 리마인드 발송 상태도 초기화.
 */
export async function updateTrpgSession(
  id: string,
  requesterDiscordId: string,
  patch: UpdateTrpgSessionPatch,
): Promise<UpdateTrpgSessionResult> {
  if (!ObjectId.isValid(id)) return { kind: "not-found" };

  // 진입 검증: 잘못된 date/time 포맷, 길이 초과를 DB 조회 전에 차단.
  const validated = updateTrpgSessionPatchSchema.parse(patch);

  const col = await trpgSessionsCol();
  const objectId = new ObjectId(id);

  // 사전 조회 — 실패 사유 판정용. 사전 조회 후 갱신 전까지 race 가 발생해도
  // 아래 findOneAndUpdate 가 실패하면 한 번 더 fetch 해 정확한 사유를 산출.
  const existing = await col.findOne({ _id: objectId } as TrpgSessionFilter);
  if (!existing) return { kind: "not-found" };
  if (existing.createdByDiscordId !== requesterDiscordId) {
    return { kind: "forbidden" };
  }
  if (existing.status !== "open") return { kind: "not-open" };

  const $set: Record<string, unknown> = { updatedAt: new Date() };
  const notificationState = buildUpdateNotificationState(existing, validated);
  if (validated.title !== undefined) $set.title = validated.title;
  if (validated.date !== undefined) {
    $set.date = validated.date;
    // 일정이 바뀌면 24h 리마인드 발송 상태도 초기화.
    $set.reminderSentAt = null;
    $set.reminderClaimLeaseUntil = null;
  }
  if (validated.startTime !== undefined) {
    $set.startTime = validated.startTime;
    $set.reminderSentAt = null;
    $set.reminderClaimLeaseUntil = null;
  }
  if (validated.participantDiscordIds !== undefined) {
    $set.participantDiscordIds = validated.participantDiscordIds;
  }
  if (
    notificationState.changes.length > 0 &&
    notificationState.recipients.length > 0
  ) {
    $set.updateNotificationQueuedAt = new Date();
    $set.updateNotificationSentAt = null;
    $set.updateNotificationClaimLeaseUntil = null;
    $set.updateNotificationRecipientDiscordIds = notificationState.recipients;
    $set.updateNotificationChanges = notificationState.changes;
  }

  const updated = await col.findOneAndUpdate(
    {
      _id: objectId,
      createdByDiscordId: requesterDiscordId,
      status: "open",
    } as TrpgSessionFilter,
    { $set },
    { returnDocument: "after" },
  );

  if (updated) return { kind: "updated", session: updated };

  // findOneAndUpdate 실패 — 사전 조회 이후 race 가 발생. 다시 fetch 해 사유 재산출.
  const after = await col.findOne({ _id: objectId } as TrpgSessionFilter);
  if (!after) return { kind: "not-found" };
  if (after.createdByDiscordId !== requesterDiscordId) {
    return { kind: "forbidden" };
  }
  if (after.status !== "open") return { kind: "not-open" };

  // 사전/사후 조회가 모두 정상인데도 update 가 실패하는 경우는 동시 갱신으로
  // 인한 일시적 race — 호출처가 재시도하도록 not-open 으로 응답.
  return { kind: "not-open" };
}

/**
 * 세션을 취소(soft delete) — `status = "cancelled"`.
 *
 * 결과 union 으로 실패 사유를 구분:
 *  - `not-found`: ID 가 invalid 거나 해당 세션이 존재하지 않음
 *  - `forbidden`: requester 가 생성자가 아님
 *  - `already-cancelled`: 이미 취소된 세션
 *
 * race-safe: 사전 조회로 사유를 추정한 뒤 `updateOne` 의 status 필터로 검증.
 * cancel 은 멱등이지만 "이미 취소" 와 "새로 취소" 를 호출처가 구분해야 하므로
 * 사전 status 검사를 유지한다.
 */
export async function cancelTrpgSession(
  id: string,
  requesterDiscordId: string,
): Promise<CancelTrpgSessionResult> {
  if (!ObjectId.isValid(id)) return { kind: "not-found" };

  const col = await trpgSessionsCol();
  const objectId = new ObjectId(id);

  const existing = await col.findOne({ _id: objectId } as TrpgSessionFilter);
  if (!existing) return { kind: "not-found" };
  if (existing.createdByDiscordId !== requesterDiscordId) {
    return { kind: "forbidden" };
  }
  if (existing.status === "cancelled") return { kind: "already-cancelled" };

  const now = new Date();
  const result = await col.updateOne(
    {
      _id: objectId,
      createdByDiscordId: requesterDiscordId,
      status: "open",
    } as TrpgSessionFilter,
    {
      $set: {
        status: "cancelled",
        cancellationNotificationQueuedAt: now,
        cancellationNotificationSentAt: null,
        cancellationNotificationClaimLeaseUntil: null,
        updatedAt: now,
      },
    },
  );

  if (result.matchedCount > 0) return { kind: "cancelled" };

  // 사전 조회 후 race — 다시 fetch.
  const after = await col.findOne({ _id: objectId } as TrpgSessionFilter);
  if (!after) return { kind: "not-found" };
  if (after.createdByDiscordId !== requesterDiscordId) {
    return { kind: "forbidden" };
  }
  if (after.status === "cancelled") return { kind: "already-cancelled" };

  // 이론상 도달 불가 (open 인데 updateOne 이 0개를 잡음). 안전망으로 not-found.
  return { kind: "not-found" };
}
