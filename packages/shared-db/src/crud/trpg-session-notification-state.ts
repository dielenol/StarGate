/**
 * trpg_sessions 알림 상태 전이 — 순수 함수
 *
 * `updateTrpgSession` / `cancelTrpgSession` 이 "대기열에 무엇을 쌓을지" 를 결정하는
 * 로직을 DB 접근 없이 계산한다. 반환값은 `$set` 페이로드와, 결정의 근거가 된
 * 문서 상태를 다시 검사하는 필터 조각(`guard`) 이다. 호출처는 `_id`/owner/status
 * 필터에 guard 를 합쳐 findOneAndUpdate 로 원자적으로 적용하고, 0건이면 재조회해
 * 다시 계획한다.
 *
 * 규칙:
 *  - 생성 알림이 아직 안 나갔고(한 번도 선점된 적 없고) 생성 lease 도 비활성이면
 *    수정·취소 대기열을 쌓지 않는다 (생성 DM 이 최신 스냅샷으로 나가므로).
 *    일부 수신자에게라도 나간 뒤 중단된 세션(`notificationClaimedAt` 있음)은
 *    "안내받은 세션" 으로 보아 대기열을 쌓는다.
 *  - 대기 중(미발송)인 수정 알림이 있으면 그 누적 baseline 대비 최신 상태로 변경
 *    요약을 다시 계산하고, lease 상태와 무관하게 회차(`updateNotificationQueuedAt`)를
 *    새로 발급한다 — 부분 수신자도 새 roundKey 로 누적 요약을 다시 받는다.
 *  - 누적 baseline 기준 변경이 없으면(되돌림): lease 비활성이면 대기를 해제하고,
 *    lease 활성(발송 중)이면 현재 문서를 baseline 으로 정정 회차를 만든다.
 *  - 활성 lease 는 어떤 경로에서도 지우지 않는다. 발송 중 회차는 mark 불일치 →
 *    release 로 끝난다.
 *  - 재일정 판정과 리마인드 초기화는 date/startTime 값이 실제로 바뀔 때만 한다.
 *
 * @module crud/trpg-session-notification-state
 */

import type {
  TrpgSession,
  TrpgSessionUpdateBaseline,
} from "../types/trpg-session.js";
import type { UpdateTrpgSessionPatch } from "../schemas/trpg-session.schema.js";

/** 수정 알림 변경 요약 + 수신자 */
export interface TrpgUpdateNotificationState {
  changes: string[];
  recipients: string[];
}

/** 세션 갱신 계획 — `$set` 페이로드와 결정 근거를 재검사하는 필터 조각 */
export interface TrpgSessionUpdatePlan {
  set: Record<string, unknown>;
  guard: Record<string, unknown>;
  /** 이번 갱신으로 수정 알림이 대기열에 남는지 (병합 포함) */
  queued: boolean;
}

/** 세션 취소 계획 — 대기열 적재 여부별 `$set` 과 guard */
export interface TrpgSessionCancelPlan {
  mode: "queue" | "skip";
  set: Record<string, unknown>;
  guard: Record<string, unknown>;
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

/** lease 가 아직 유효한지 (`> now`). null/undefined/만료는 비활성. */
export function hasActiveLease(
  leaseUntil: Date | null | undefined,
  now: Date,
): boolean {
  return leaseUntil instanceof Date && leaseUntil.getTime() > now.getTime();
}

/**
 * 생성 알림이 미발송이고, 한 번도 선점된 적 없고, 생성 lease 도 비활성인지 —
 * 아무도 안내받지 않은 세션. 선점 흔적(`notificationClaimedAt`)이 있으면 일부
 * 수신자에게 나갔을 수 있으므로 안내받은 세션으로 본다.
 */
export function isCreationNotificationPending(
  session: Pick<
    TrpgSession,
    "notificationSentAt" | "notificationClaimedAt" | "notificationClaimLeaseUntil"
  >,
  now: Date,
): boolean {
  return (
    session.notificationSentAt == null &&
    session.notificationClaimedAt == null &&
    !hasActiveLease(session.notificationClaimLeaseUntil, now)
  );
}

/** `isCreationNotificationPending` 과 같은 조건을 MongoDB 필터로 표현한다. */
export function creationNotificationPendingFilter(
  now: Date,
): Record<string, unknown> {
  return {
    $and: [
      {
        $or: [
          { notificationSentAt: { $exists: false } },
          { notificationSentAt: null },
        ],
      },
      {
        $or: [
          { notificationClaimedAt: { $exists: false } },
          { notificationClaimedAt: null },
        ],
      },
      {
        $or: [
          { notificationClaimLeaseUntil: { $exists: false } },
          { notificationClaimLeaseUntil: null },
          // hasActiveLease 는 `> now` 를 활성으로 보므로 경계(= now)는 비활성.
          { notificationClaimLeaseUntil: { $lte: now } },
        ],
      },
    ],
  };
}

/** 생성 알림이 발송됐거나 선점된 적 있거나 발송 중(lease 활성)인 문서 필터 — 위 필터의 여집합. */
export function creationNotificationSentOrInFlightFilter(
  now: Date,
): Record<string, unknown> {
  return {
    $or: [
      { notificationSentAt: { $ne: null } },
      { notificationClaimedAt: { $ne: null } },
      { notificationClaimLeaseUntil: { $gt: now } },
    ],
  };
}

/** 문서에서 수정 알림 baseline 스냅샷을 뽑는다. */
export function toUpdateNotificationBaseline(
  session: TrpgSessionUpdateBaseline,
): TrpgSessionUpdateBaseline {
  return {
    title: session.title,
    date: session.date,
    startTime: session.startTime,
    participantDiscordIds: [...session.participantDiscordIds],
  };
}

/** 패치를 적용한 뒤의 상태 (알림 관련 필드만). */
export function applyTrpgSessionPatch(
  existing: TrpgSessionUpdateBaseline,
  patch: UpdateTrpgSessionPatch,
): TrpgSessionUpdateBaseline {
  return {
    title: patch.title ?? existing.title,
    date: patch.date ?? existing.date,
    startTime: patch.startTime ?? existing.startTime,
    participantDiscordIds:
      patch.participantDiscordIds ?? existing.participantDiscordIds,
  };
}

/**
 * baseline 대비 next 의 변경 요약과 수신자(baseline ∪ next 참가자)를 계산한다.
 * 변경이 없으면 `changes` 가 빈 배열 — 호출처가 "되돌림" 으로 판정한다.
 */
export function buildUpdateNotificationState(
  baseline: TrpgSessionUpdateBaseline,
  next: TrpgSessionUpdateBaseline,
): TrpgUpdateNotificationState {
  const changes: string[] = [];

  if (next.title !== baseline.title) {
    changes.push(`세션 제목 변경: ${baseline.title} → ${next.title}`);
  }

  if (next.date !== baseline.date || next.startTime !== baseline.startTime) {
    changes.push(
      `일시 변경: ${baseline.date} ${baseline.startTime} → ${next.date} ${next.startTime}`,
    );
  }

  if (!sameDiscordIdSet(baseline.participantDiscordIds, next.participantDiscordIds)) {
    const before = new Set(baseline.participantDiscordIds);
    const after = new Set(next.participantDiscordIds);
    const added = next.participantDiscordIds.filter((id) => !before.has(id));
    const removed = baseline.participantDiscordIds.filter((id) => !after.has(id));
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
      baseline.participantDiscordIds,
      next.participantDiscordIds,
    ),
  };
}

/** 수정 알림 대기 상태를 비우는 `$set` 조각 (lease 는 호출처가 비활성일 때만 함께 비움). */
function clearedUpdateQueueSet(): Record<string, unknown> {
  return {
    updateNotificationQueuedAt: null,
    updateNotificationSentAt: null,
    updateNotificationBaseline: null,
    updateNotificationRecipientDiscordIds: null,
    updateNotificationChanges: null,
  };
}

/**
 * `updateTrpgSession` 의 갱신 계획을 세운다.
 *
 * `guard` 는 결정에 쓰인 문서 상태(생성 알림 대기 여부, 수정 대기열 회차·발송
 * 여부·lease)를 그대로 필터로 돌려준다 — 조회와 갱신 사이에 claim→발송→mark 가
 * 끝나면 0건이 되어 호출처가 재조회·재계획한다. 발송 완료된 문서에 새 회차를
 * 덮어쓰면 영영 나가지 않으므로 `updateNotificationSentAt` 일치도 반드시 본다.
 */
export function planTrpgSessionUpdate(
  existing: TrpgSession,
  patch: UpdateTrpgSessionPatch,
  now: Date,
): TrpgSessionUpdatePlan {
  const next = applyTrpgSessionPatch(existing, patch);
  const set: Record<string, unknown> = { updatedAt: now };
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.date !== undefined) set.date = patch.date;
  if (patch.startTime !== undefined) set.startTime = patch.startTime;
  if (patch.participantDiscordIds !== undefined) {
    set.participantDiscordIds = patch.participantDiscordIds;
  }

  // 재일정: 값이 실제로 바뀔 때만 리마인드 회차를 초기화. 활성 lease 는 남긴다 —
  // 발송 중이던 회차는 mark 불일치로 스스로 lease 를 해제한다.
  const rescheduled =
    next.date !== existing.date || next.startTime !== existing.startTime;
  if (rescheduled) {
    set.reminderSentAt = null;
    set.reminder1hSentAt = null;
    if (!hasActiveLease(existing.reminderClaimLeaseUntil, now)) {
      set.reminderClaimLeaseUntil = null;
    }
    if (!hasActiveLease(existing.reminder1hClaimLeaseUntil, now)) {
      set.reminder1hClaimLeaseUntil = null;
    }
  }

  const updateLeaseActive = hasActiveLease(
    existing.updateNotificationClaimLeaseUntil,
    now,
  );

  // 생성 DM 전 수정: 대기열을 쌓지 않는다. 남아 있던 대기(이전 생성 lease 가
  // 발송 없이 만료된 경우)도 발송 중이 아니면 함께 비운다.
  if (isCreationNotificationPending(existing, now)) {
    if (!updateLeaseActive) {
      Object.assign(set, clearedUpdateQueueSet(), {
        updateNotificationClaimLeaseUntil: null,
      });
    }
    return {
      set,
      guard: creationNotificationPendingFilter(now),
      queued: false,
    };
  }

  // 결정 근거 CAS: 회차·발송 여부·lease 가 조회 시점과 같을 때만 적용한다.
  const guard: Record<string, unknown> = {
    updateNotificationQueuedAt: existing.updateNotificationQueuedAt ?? null,
    updateNotificationSentAt: existing.updateNotificationSentAt ?? null,
    updateNotificationClaimLeaseUntil:
      existing.updateNotificationClaimLeaseUntil ?? null,
  };
  const pending =
    existing.updateNotificationQueuedAt != null &&
    existing.updateNotificationSentAt == null;

  // 현재 문서 대비 변화가 없는 저장(같은 값 재저장)은 알림 상태를 건드리지 않는다 —
  // 대기·발송 중 회차를 재발급해 수신자 전원이 같은 DM 을 다시 받는 사고를 막는다.
  const current = toUpdateNotificationBaseline(existing);
  if (buildUpdateNotificationState(current, next).changes.length === 0) {
    return { set, guard, queued: pending };
  }

  const accumulatedBaseline = pending
    ? (existing.updateNotificationBaseline ?? null)
    : null;

  /** baseline 대비 변경이 있으면 새 회차를 발급한다. 없으면 false. */
  const issueRound = (baseline: TrpgSessionUpdateBaseline): boolean => {
    const state = buildUpdateNotificationState(baseline, next);
    if (state.changes.length === 0 || state.recipients.length === 0) {
      return false;
    }
    set.updateNotificationQueuedAt = now;
    set.updateNotificationSentAt = null;
    if (!updateLeaseActive) set.updateNotificationClaimLeaseUntil = null;
    set.updateNotificationBaseline = baseline;
    set.updateNotificationRecipientDiscordIds = state.recipients;
    set.updateNotificationChanges = state.changes;
    return true;
  };

  // 대기 중이면 누적 baseline, 아니면(배포 전 대기 포함) 현재 문서가 기준.
  if (issueRound(accumulatedBaseline ?? current)) {
    return { set, guard, queued: true };
  }

  if (!pending || !accumulatedBaseline) {
    // 변경은 있는데 수신자가 없는(참가자 0명) 경우뿐 — 회차 없음, 대기는 그대로.
    return { set, guard, queued: pending };
  }
  if (!updateLeaseActive) {
    // 되돌림 — 누적 baseline 과 같아졌고 아직 안 나갔으므로 대기 해제.
    Object.assign(set, clearedUpdateQueueSet(), {
      updateNotificationClaimLeaseUntil: null,
    });
    return { set, guard, queued: false };
  }
  // 되돌림인데 발송 중 — 이미 나간(또는 나가는) 내용을 바로잡는 정정 회차
  // (현재 문서 대비 변화는 위에서 보장되므로 반드시 발급된다).
  return { set, guard, queued: issueRound(current) };
}

/**
 * `cancelTrpgSession` 의 취소 계획. 생성 DM 전이면 `skip` (대기열 미적재),
 * 아니면 `queue`. 호출처는 반환된 guard 로 시도하고 0건이면 반대 모드로 재시도한다.
 */
export function planTrpgSessionCancel(
  mode: TrpgSessionCancelPlan["mode"],
  now: Date,
): TrpgSessionCancelPlan {
  const set: Record<string, unknown> = {
    status: "cancelled",
    cancellationNotificationQueuedAt: mode === "queue" ? now : null,
    cancellationNotificationSentAt: null,
    cancellationNotificationClaimLeaseUntil: null,
    updatedAt: now,
  };
  const guard =
    mode === "queue"
      ? creationNotificationSentOrInFlightFilter(now)
      : creationNotificationPendingFilter(now);
  return { mode, set, guard };
}
