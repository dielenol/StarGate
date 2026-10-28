/**
 * trpg 세션 취소 알림 폴링 스케줄러
 *
 * `TRPG_POLLING_INTERVAL_MS` 주기로 `findUnnotifiedCancelledTrpgSessions(now)` 를 폴링하고
 * 공용 팩토리(`createNotificationScheduler`)로 발송한다. 종류별 규칙:
 *   - 후보는 shared-db 에서 `cancellationNotificationQueuedAt` 이 있는 문서로 제한
 *     (생성 DM 전 취소는 대기열에 적재되지 않는다).
 *   - 단일 회차(roundKey 없음). 수신자는 참가자에서 GM 을 제외한 목록.
 *   - 세션 시작 시각이 이미 지났으면 DM 없이 완료 처리.
 *
 * @module scheduler/trpg-cancellation-notification-checker
 */

import {
  claimCancellationNotification,
  findUnnotifiedCancelledTrpgSessions,
  markCancellationNotificationSent,
  releaseCancellationNotificationClaim,
} from "@stargate/shared-db";

import type { Client } from "discord.js";

import type { SchedulerStartOptions } from "./default-scheduler-deps.js";
import type { NotificationSchedulerSpec } from "./notification-scheduler.js";

import { config } from "../config.js";
import { createDefaultSchedulerDeps } from "./default-scheduler-deps.js";
import {
  createNotificationScheduler,
  hasSessionStarted,
  recipientsWithoutGameMaster,
} from "./notification-scheduler.js";

/** 취소 알림 스케줄러가 쓰는 DB 접근 — 테스트에서 가짜로 교체한다 */
export interface CancellationSchedulerDb {
  find: typeof findUnnotifiedCancelledTrpgSessions;
  claim: typeof claimCancellationNotification;
  mark: typeof markCancellationNotificationSent;
  release: typeof releaseCancellationNotificationClaim;
}

const DEFAULT_DB: CancellationSchedulerDb = {
  find: findUnnotifiedCancelledTrpgSessions,
  claim: claimCancellationNotification,
  mark: markCancellationNotificationSent,
  release: releaseCancellationNotificationClaim,
};

export function createCancellationNotificationSpec(
  db: Partial<CancellationSchedulerDb> = {},
): NotificationSchedulerSpec {
  const d = { ...DEFAULT_DB, ...db };
  return {
    name: "cancellation",
    logKind: "cancellation",
    messageKind: "cancellation",
    intervalMs: config.trpgPollingIntervalMs,
    find: (now) => d.find(now),
    claim: (sessionId, _session, leaseUntil) => d.claim(sessionId, leaseUntil),
    mark: (sessionId) => d.mark(sessionId),
    release: (sessionId, leaseUntil) => d.release(sessionId, leaseUntil),
    roundKey: () => null,
    recipients: (session) => recipientsWithoutGameMaster(session),
    skipReason: (session, now) =>
      hasSessionStarted(session, now) ? "세션 시작 시각 경과" : null,
  };
}

/**
 * 취소 알림 폴링 시작. 반환되는 함수를 호출하면 인터벌이 정리되고 진행 중 tick 을 기다린다.
 */
export function startTrpgCancellationNotificationChecker(
  client: Client,
  options: SchedulerStartOptions,
): () => Promise<void> {
  return createNotificationScheduler(
    createCancellationNotificationSpec(),
    createDefaultSchedulerDeps(client, options),
  ).start();
}
