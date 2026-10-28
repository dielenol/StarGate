/**
 * trpg 세션 수정 알림 폴링 스케줄러
 *
 * `TRPG_POLLING_INTERVAL_MS` 주기로 `findUnnotifiedUpdatedTrpgSessions(now)` 를 폴링하고
 * 공용 팩토리(`createNotificationScheduler`)로 발송한다. 종류별 규칙:
 *   - 회차 = `updateNotificationQueuedAt` (roundKey 는 ISO 문자열). claim/mark 필터에
 *     스냅샷을 넣어 발송 중 새 회차가 쌓이면 mark 가 불일치해 lease 만 해제된다.
 *   - 수신자는 대기열 스냅샷(`updateNotificationRecipientDiscordIds`, 제외된 참가자 포함)
 *     에서 GM 을 제외한 목록. 스냅샷이 없으면 현재 참가자.
 *   - 세션 시작 시각이 이미 지났으면 DM 없이 완료 처리.
 *
 * @module scheduler/trpg-update-notification-checker
 */

import {
  claimUpdateNotification,
  findUnnotifiedUpdatedTrpgSessions,
  markUpdateNotificationSent,
  releaseUpdateNotificationClaim,
} from "@stargate/shared-db";

import type { Client } from "discord.js";
import type { TrpgSession } from "@stargate/shared-db";

import type { SchedulerStartOptions } from "./default-scheduler-deps.js";
import type { NotificationSchedulerSpec } from "./notification-scheduler.js";

import { config } from "../config.js";
import { createDefaultSchedulerDeps } from "./default-scheduler-deps.js";
import {
  createNotificationScheduler,
  hasSessionStarted,
  recipientsWithoutGameMaster,
} from "./notification-scheduler.js";

/** 수정 알림 스케줄러가 쓰는 DB 접근 — 테스트에서 가짜로 교체한다 */
export interface UpdateSchedulerDb {
  find: typeof findUnnotifiedUpdatedTrpgSessions;
  claim: typeof claimUpdateNotification;
  mark: typeof markUpdateNotificationSent;
  release: typeof releaseUpdateNotificationClaim;
}

const DEFAULT_DB: UpdateSchedulerDb = {
  find: findUnnotifiedUpdatedTrpgSessions,
  claim: claimUpdateNotification,
  mark: markUpdateNotificationSent,
  release: releaseUpdateNotificationClaim,
};

/** 회차 스냅샷 — 대기열이 없는 문서(queuedAt null)는 claim 이 실패하도록 epoch 0 */
function queuedAtOf(session: TrpgSession): Date {
  return session.updateNotificationQueuedAt ?? new Date(0);
}

export function updateRoundKey(session: TrpgSession): string | null {
  return session.updateNotificationQueuedAt?.toISOString() ?? null;
}

export function updateRecipients(session: TrpgSession): string[] {
  const snapshot = session.updateNotificationRecipientDiscordIds;
  return recipientsWithoutGameMaster(
    session,
    snapshot?.length ? snapshot : session.participantDiscordIds,
  );
}

export function createUpdateNotificationSpec(
  db: Partial<UpdateSchedulerDb> = {},
): NotificationSchedulerSpec {
  const d = { ...DEFAULT_DB, ...db };
  return {
    name: "update",
    logKind: "update",
    messageKind: "update",
    intervalMs: config.trpgPollingIntervalMs,
    find: (now) => d.find(now),
    claim: (sessionId, session, leaseUntil) =>
      d.claim(sessionId, leaseUntil, queuedAtOf(session)),
    mark: (sessionId, session) => d.mark(sessionId, queuedAtOf(session)),
    release: (sessionId, leaseUntil) => d.release(sessionId, leaseUntil),
    roundKey: updateRoundKey,
    recipients: updateRecipients,
    skipReason: (session, now) =>
      hasSessionStarted(session, now) ? "세션 시작 시각 경과" : null,
  };
}

export function startTrpgUpdateNotificationChecker(
  client: Client,
  options: SchedulerStartOptions,
): () => Promise<void> {
  return createNotificationScheduler(
    createUpdateNotificationSpec(),
    createDefaultSchedulerDeps(client, options),
  ).start();
}
