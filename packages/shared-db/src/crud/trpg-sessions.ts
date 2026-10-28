/**
 * trpg_sessions CRUD 리포지토리
 *
 * trpg-bot 의 신규 세션 모델(open/cancelled, 날짜+시각 분리, DM 알림 기반)을 다룬다.
 * 기존 registra-bot 공유 `sessions` 컬렉션과는 완전히 분리되어 있으며,
 * 스케줄러용 atomic claim 패턴(생성 / 수정 / 취소 / 리마인드 24h·1h)을 제공한다.
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
 * 회차 고정(claim / mark):
 *  - 수정 알림은 `updateNotificationQueuedAt`, 리마인드는 `date`+`startTime` 을
 *    claim·mark 필터에 함께 넣는다. 발송 중 재대기·재일정이 오면 mark 가 0건을
 *    반환하고, 호출처는 `release*` 로 자기 lease 만 해제해 다음 tick 이 최신
 *    회차를 바로 처리하게 한다.
 *
 * @module crud/trpg-sessions
 */

import { ObjectId, type ClientSession, type Filter } from "mongodb";

import type {
  CancelTrpgSessionResult,
  TrpgReminderRound,
  TrpgReminderSlot,
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
import {
  isCreationNotificationPending,
  planTrpgSessionCancel,
  planTrpgSessionUpdate,
} from "./trpg-session-notification-state.js";

export type {
  TrpgReminderRound,
  TrpgReminderSlot,
  TrpgSessionUpdateBaseline,
} from "../types/trpg-session.js";

/** MongoDB 내부 _id 는 ObjectId — 필터 타입 가드 */
type TrpgSessionFilter = Filter<TrpgSession> & { _id?: ObjectId };

/** `updateTrpgSession` 이 guard 불일치로 재조회·재계획하는 최대 횟수 */
const UPDATE_PLAN_ATTEMPTS = 5;

/** 리마인드 슬롯별 문서 필드 이름 */
const REMINDER_FIELDS: Record<
  TrpgReminderSlot,
  { sentAt: keyof TrpgSession; leaseUntil: keyof TrpgSession }
> = {
  "24h": { sentAt: "reminderSentAt", leaseUntil: "reminderClaimLeaseUntil" },
  "1h": {
    sentAt: "reminder1hSentAt",
    leaseUntil: "reminder1hClaimLeaseUntil",
  },
};

/** `field IS NULL OR 누락` 필터 조각 */
function nullOrMissing(field: string): Record<string, unknown> {
  return { $or: [{ [field]: { $exists: false } }, { [field]: null }] };
}

/** `field 누락 OR null OR < now` — lease 비활성 필터 조각 */
function leaseInactive(field: string, now: Date): Record<string, unknown> {
  return {
    $or: [
      { [field]: { $exists: false } },
      { [field]: null },
      { [field]: { $lt: now } },
    ],
  };
}

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
    notificationClaimedAt: null,
    notificationClaimLeaseUntil: null,
    reminderSentAt: null,
    reminderClaimLeaseUntil: null,
    reminder1hSentAt: null,
    reminder1hClaimLeaseUntil: null,
    cancellationNotificationQueuedAt: null,
    cancellationNotificationSentAt: null,
    cancellationNotificationClaimLeaseUntil: null,
    updateNotificationQueuedAt: null,
    updateNotificationSentAt: null,
    updateNotificationClaimLeaseUntil: null,
    updateNotificationRecipientDiscordIds: null,
    updateNotificationChanges: null,
    updateNotificationBaseline: null,
    createdAt: now,
    updatedAt: now,
  };
  const result = await col.insertOne(doc);
  return result.insertedId.toString();
}

/** ID 로 trpg 세션을 조회한다. */
export async function findTrpgSessionById(
  id: string,
  options: { session?: ClientSession } = {},
): Promise<TrpgSession | null> {
  if (!ObjectId.isValid(id)) return null;

  const col = await trpgSessionsCol();
  return col.findOne(
    { _id: new ObjectId(id) } as TrpgSessionFilter,
    { session: options.session },
  );
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
 * 특정 사용자가 참가하거나 마스터인 다가오는 open 세션 (`date >= fromDateKey`).
 *
 * `{ guildId, status, date }` 인덱스의 range scan 뒤 `$or` 는 residual 필터 —
 * 단일 길드 수십 건 규모라 별도 인덱스는 두지 않는다.
 */
export async function findUpcomingTrpgSessionsForParticipant(
  guildId: string,
  discordUserId: string,
  fromDateKey: string,
  limit: number,
): Promise<TrpgSession[]> {
  const col = await trpgSessionsCol();
  return col
    .find({
      guildId,
      status: "open",
      date: { $gte: fromDateKey },
      $or: [
        { participantDiscordIds: discordUserId },
        { createdByDiscordId: discordUserId },
      ],
    })
    .sort({ date: 1, startTime: 1 })
    .limit(limit)
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
        nullOrMissing("notificationSentAt"),
        leaseInactive("notificationClaimLeaseUntil", now),
      ],
    } as unknown as TrpgSessionFilter)
    .toArray();
}

/**
 * 리마인드 스케줄러용: 시작 시각이 [windowStart, windowEnd] 사이이며
 * 해당 슬롯의 리마인드가 아직 발송되지 않은 open 세션.
 *
 * 선행조건: 생성 알림이 먼저 나가야 한다 (`notificationSentAt != null`).
 * 아직 안내받지 않은 세션에 리마인드부터 보내지 않는다.
 *
 * `date` + `startTime` 은 둘 다 문자열이라 사전식으로 비교한다.
 * - 인덱스 활용을 위해 1차 필터는 `date` range 로만 좁히고 결합 datetime 으로 재필터.
 *
 * windowStart / windowEnd 는 datetime(Date) 객체이며, 본 함수에서 string 으로 변환하여
 * 비교한다. 호출처는 KST 기준 24h/1h 전후 윈도우를 그대로 전달하면 된다.
 */
export async function findDueReminderSessions(
  windowStart: Date,
  windowEnd: Date,
  slot: TrpgReminderSlot = "24h",
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
  const fields = REMINDER_FIELDS[slot];

  const col = await trpgSessionsCol();
  const candidates = await col
    .find({
      status: "open",
      ...nullOrMissing(fields.sentAt),
      notificationSentAt: { $ne: null },
      date: { $gte: startDate, $lte: endDate },
    } as unknown as TrpgSessionFilter)
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
 * 생성 알림이 발송 중(lease 활성)이면 그 발송이 끝날 때까지 기다린다 — 생성 완료까지
 * 기다리지는 않는다(취소된 세션의 생성 회차는 재개되지 않으므로).
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
        nullOrMissing("cancellationNotificationSentAt"),
        leaseInactive("cancellationNotificationClaimLeaseUntil", now),
        leaseInactive("notificationClaimLeaseUntil", now),
      ],
    } as unknown as TrpgSessionFilter)
    .toArray();
}

/**
 * 수정 알림 스케줄러용: 수정 시 대기열에 적재되었고 아직 알림이 발송되지 않은 세션.
 * 생성 알림이 완료(`notificationSentAt != null`)된 세션만 — 생성 발송이 중단·재개되는
 * 동안 수정 DM 이 생성 DM 보다 먼저 가지 않게 한다. (생성 lease 활성 조건은 이에
 * 포함된다: mark 가 sentAt 과 lease 해제를 함께 적는다.)
 */
export async function findUnnotifiedUpdatedTrpgSessions(
  now: Date,
): Promise<TrpgSession[]> {
  const col = await trpgSessionsCol();
  return col
    .find({
      status: "open",
      updateNotificationQueuedAt: { $exists: true, $ne: null },
      notificationSentAt: { $ne: null },
      $and: [
        nullOrMissing("updateNotificationSentAt"),
        leaseInactive("updateNotificationClaimLeaseUntil", now),
      ],
    } as unknown as TrpgSessionFilter)
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
 *
 * `notificationClaimedAt` 은 선점 흔적 — 발송 도중 멈춘 세션을 "안내받은 세션"
 * 으로 판정하기 위해 release·mark 가 지우지 않는다.
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
      $and: [
        nullOrMissing("notificationSentAt"),
        leaseInactive("notificationClaimLeaseUntil", now),
      ],
    } as unknown as TrpgSessionFilter,
    {
      $set: {
        notificationClaimedAt: now,
        notificationClaimLeaseUntil: leaseUntil,
        updatedAt: now,
      },
    },
  );

  return result.matchedCount > 0;
}

/**
 * 생성 알림 발송 완료를 기록한다 (lease 해제 포함).
 * 생성 알림은 단일 회차라 `_id` 만으로 판정하며, 문서가 없으면 false.
 */
export async function markNotificationSent(
  sessionId: string,
): Promise<boolean> {
  if (!ObjectId.isValid(sessionId)) return false;

  const col = await trpgSessionsCol();
  const now = new Date();
  const result = await col.updateOne(
    { _id: new ObjectId(sessionId) } as TrpgSessionFilter,
    {
      $set: {
        notificationSentAt: now,
        notificationClaimLeaseUntil: null,
        updatedAt: now,
      },
    },
  );
  return result.matchedCount > 0;
}

/** 내 lease(`leaseUntil` 일치)일 때만 생성 알림 lease 를 해제한다. */
export async function releaseNotificationClaim(
  sessionId: string,
  leaseUntil: Date,
): Promise<void> {
  if (!ObjectId.isValid(sessionId)) return;

  const col = await trpgSessionsCol();
  await col.updateOne(
    {
      _id: new ObjectId(sessionId),
      notificationClaimLeaseUntil: leaseUntil,
    } as TrpgSessionFilter,
    { $set: { notificationClaimLeaseUntil: null, updatedAt: new Date() } },
  );
}

/**
 * 취소 알림 발송권을 원자적으로 선점한다.
 *
 * 취소 알림은 `cancelTrpgSession` 이 `cancellationNotificationQueuedAt` 을 찍은
 * 문서만 대상으로 삼는다. 생성 알림 발송 중(lease 활성)에는 선점하지 않는다.
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
      $and: [
        nullOrMissing("cancellationNotificationSentAt"),
        leaseInactive("cancellationNotificationClaimLeaseUntil", now),
        leaseInactive("notificationClaimLeaseUntil", now),
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

/** 취소 알림 발송 완료를 기록한다 (lease 해제 포함). 문서가 없으면 false. */
export async function markCancellationNotificationSent(
  sessionId: string,
): Promise<boolean> {
  if (!ObjectId.isValid(sessionId)) return false;

  const col = await trpgSessionsCol();
  const now = new Date();
  const result = await col.updateOne(
    { _id: new ObjectId(sessionId) } as TrpgSessionFilter,
    {
      $set: {
        cancellationNotificationSentAt: now,
        cancellationNotificationClaimLeaseUntil: null,
        updatedAt: now,
      },
    },
  );
  return result.matchedCount > 0;
}

/** 내 lease 일 때만 취소 알림 lease 를 해제한다. */
export async function releaseCancellationNotificationClaim(
  sessionId: string,
  leaseUntil: Date,
): Promise<void> {
  if (!ObjectId.isValid(sessionId)) return;

  const col = await trpgSessionsCol();
  await col.updateOne(
    {
      _id: new ObjectId(sessionId),
      cancellationNotificationClaimLeaseUntil: leaseUntil,
    } as TrpgSessionFilter,
    {
      $set: {
        cancellationNotificationClaimLeaseUntil: null,
        updatedAt: new Date(),
      },
    },
  );
}

/**
 * 수정 알림 발송권을 원자적으로 선점한다.
 *
 * `queuedAt` 은 find 스냅샷의 `updateNotificationQueuedAt` — 조회 후 새 회차가
 * 쌓였으면(값이 바뀜) 선점하지 않는다. 호출처는 다음 tick 에 최신 회차를 처리.
 * 생성 알림이 완료된 세션(`notificationSentAt != null`)만 선점한다.
 */
export async function claimUpdateNotification(
  sessionId: string,
  leaseUntil: Date,
  queuedAt: Date,
): Promise<boolean> {
  if (!ObjectId.isValid(sessionId)) return false;

  const col = await trpgSessionsCol();
  const now = new Date();
  const result = await col.updateOne(
    {
      _id: new ObjectId(sessionId),
      status: "open",
      updateNotificationQueuedAt: queuedAt,
      notificationSentAt: { $ne: null },
      $and: [
        nullOrMissing("updateNotificationSentAt"),
        leaseInactive("updateNotificationClaimLeaseUntil", now),
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

/**
 * 수정 알림 발송 완료를 기록한다 (lease 해제 포함).
 *
 * 회차(`queuedAt`)가 발송 중 바뀌었으면 0건 → false. 호출처는
 * `releaseUpdateNotificationClaim` 으로 자기 lease 만 해제한다.
 */
export async function markUpdateNotificationSent(
  sessionId: string,
  queuedAt: Date,
): Promise<boolean> {
  if (!ObjectId.isValid(sessionId)) return false;

  const col = await trpgSessionsCol();
  const now = new Date();
  const result = await col.updateOne(
    {
      _id: new ObjectId(sessionId),
      updateNotificationQueuedAt: queuedAt,
    } as TrpgSessionFilter,
    {
      $set: {
        updateNotificationSentAt: now,
        updateNotificationClaimLeaseUntil: null,
        updateNotificationBaseline: null,
        updatedAt: now,
      },
    },
  );
  return result.matchedCount > 0;
}

/** 내 lease 일 때만 수정 알림 lease 를 해제한다. */
export async function releaseUpdateNotificationClaim(
  sessionId: string,
  leaseUntil: Date,
): Promise<void> {
  if (!ObjectId.isValid(sessionId)) return;

  const col = await trpgSessionsCol();
  await col.updateOne(
    {
      _id: new ObjectId(sessionId),
      updateNotificationClaimLeaseUntil: leaseUntil,
    } as TrpgSessionFilter,
    {
      $set: { updateNotificationClaimLeaseUntil: null, updatedAt: new Date() },
    },
  );
}

/**
 * 리마인드(24h / 1h) 발송권을 원자적으로 선점한다. `claimNotification` 과 동일 패턴.
 *
 * `round` 는 find 스냅샷의 `date`/`startTime` — 조회 후 재일정됐으면 선점하지 않는다.
 * 생성 알림이 아직 안 나간 세션(`notificationSentAt == null`)도 선점하지 않는다.
 *
 * `matchedCount` 기준 — 멱등성을 위한 동일한 이유.
 */
export async function claimReminder(
  sessionId: string,
  leaseUntil: Date,
  round: TrpgReminderRound,
): Promise<boolean> {
  if (!ObjectId.isValid(sessionId)) return false;

  const fields = REMINDER_FIELDS[round.slot];
  const col = await trpgSessionsCol();
  const now = new Date();
  const result = await col.updateOne(
    {
      _id: new ObjectId(sessionId),
      status: "open",
      date: round.date,
      startTime: round.startTime,
      notificationSentAt: { $ne: null },
      $and: [
        nullOrMissing(fields.sentAt),
        leaseInactive(fields.leaseUntil, now),
      ],
    } as unknown as TrpgSessionFilter,
    {
      $set: {
        [fields.leaseUntil]: leaseUntil,
        updatedAt: now,
      },
    },
  );

  return result.matchedCount > 0;
}

/**
 * 리마인드 발송 완료를 기록한다 (lease 해제 포함).
 *
 * 회차(`date`/`startTime`)가 발송 중 바뀌었으면 0건 → false. 호출처는
 * `releaseReminderClaim` 으로 자기 lease 만 해제한다.
 */
export async function markReminderSent(
  sessionId: string,
  round: TrpgReminderRound,
): Promise<boolean> {
  if (!ObjectId.isValid(sessionId)) return false;

  const fields = REMINDER_FIELDS[round.slot];
  const col = await trpgSessionsCol();
  const now = new Date();
  const result = await col.updateOne(
    {
      _id: new ObjectId(sessionId),
      date: round.date,
      startTime: round.startTime,
    } as TrpgSessionFilter,
    {
      $set: {
        [fields.sentAt]: now,
        [fields.leaseUntil]: null,
        updatedAt: now,
      },
    },
  );
  return result.matchedCount > 0;
}

/** 내 lease 일 때만 리마인드 lease 를 해제한다. */
export async function releaseReminderClaim(
  sessionId: string,
  leaseUntil: Date,
  slot: TrpgReminderSlot,
): Promise<void> {
  if (!ObjectId.isValid(sessionId)) return;

  const fields = REMINDER_FIELDS[slot];
  const col = await trpgSessionsCol();
  await col.updateOne(
    {
      _id: new ObjectId(sessionId),
      [fields.leaseUntil]: leaseUntil,
    } as unknown as TrpgSessionFilter,
    { $set: { [fields.leaseUntil]: null, updatedAt: new Date() } },
  );
}

/** findOneAndUpdate 가 0건일 때 재조회로 실패 사유를 산출한다. */
async function resolveUpdateFailure(
  objectId: ObjectId,
  requesterDiscordId: string,
): Promise<UpdateTrpgSessionResult> {
  const col = await trpgSessionsCol();
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
 * 세션을 부분 갱신한다 (생성자 본인 검증 포함).
 *
 * 결과 union 으로 실패 사유를 구분:
 *  - `not-found`: ID 가 invalid 거나 해당 세션이 존재하지 않음
 *  - `forbidden`: requester 가 생성자가 아님
 *  - `not-open`: 세션이 이미 cancelled
 *
 * race-safe: 사전 조회로 사유를 추정하고 알림 상태 전이를 계획한 뒤
 * `findOneAndUpdate` 의 status/owner 필터 + 계획 guard 로 한 번 더 검증.
 * 조회와 갱신 사이에 claim/mark/cancel 이 끼어들어 0건이면 재조회해 다시
 * 계획한다 (최대 `UPDATE_PLAN_ATTEMPTS` 회). 그래도 실패하면 정확한 사유를 반환한다.
 *
 * 알림 상태 전이 규칙은 `planTrpgSessionUpdate` 참고 — 생성 DM 전 수정은 대기열을
 * 쌓지 않고, 대기 중 수정은 baseline 대비로 병합하며, 재일정 시 리마인드를
 * 초기화한다. 활성 lease 는 지우지 않는다.
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

  for (let attempt = 0; attempt < UPDATE_PLAN_ATTEMPTS; attempt += 1) {
    // 사전 조회 — 실패 사유 판정 + 알림 상태 전이 계획.
    const existing = await col.findOne({ _id: objectId } as TrpgSessionFilter);
    if (!existing) return { kind: "not-found" };
    if (existing.createdByDiscordId !== requesterDiscordId) {
      return { kind: "forbidden" };
    }
    if (existing.status !== "open") return { kind: "not-open" };

    const plan = planTrpgSessionUpdate(existing, validated, new Date());
    const updated = await col.findOneAndUpdate(
      {
        _id: objectId,
        createdByDiscordId: requesterDiscordId,
        status: "open",
        ...plan.guard,
      } as unknown as TrpgSessionFilter,
      { $set: plan.set },
      { returnDocument: "after" },
    );
    if (updated) return { kind: "updated", session: updated };
    // guard 불일치(claim/mark 끼어듦) — 재조회해 다시 계획.
  }

  return resolveUpdateFailure(objectId, requesterDiscordId);
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
 *
 * 취소 알림 대기열: 생성 알림이 아직 안 나갔고 생성 lease 도 비활성이면(아무도
 * 안내받지 않은 세션) `cancellationNotificationQueuedAt` 을 null 로 둔다. 판정은
 * updateOne 필터로 원자적으로 하고, 경합으로 0건이면 반대 경로로 한 번 재시도.
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
  const firstMode = isCreationNotificationPending(existing, now)
    ? "skip"
    : "queue";
  const modes = firstMode === "skip" ? ["skip", "queue"] : ["queue", "skip"];
  for (const mode of modes as Array<"skip" | "queue">) {
    const plan = planTrpgSessionCancel(mode, now);
    const result = await col.updateOne(
      {
        _id: objectId,
        createdByDiscordId: requesterDiscordId,
        status: "open",
        ...plan.guard,
      } as unknown as TrpgSessionFilter,
      { $set: plan.set },
    );
    if (result.matchedCount > 0) return { kind: "cancelled" };
  }

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
