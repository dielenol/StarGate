/**
 * 신규 trpg 세션 생성 알림 폴링 스케줄러
 *
 * `TRPG_POLLING_INTERVAL_MS` 주기로 `findUnnotifiedTrpgSessions(now)` 를 폴링하고
 * 공용 팩토리(`createNotificationScheduler`)로 발송한다. 종류별 규칙:
 *   - 단일 회차(roundKey 없음) — 사용자별 중복 가드는 세션 단위.
 *   - 수신자는 참가자에서 GM 을 제외한 목록.
 *   - 세션 시작 시각이 이미 지났으면 DM 없이 완료 처리.
 *
 * @module scheduler/trpg-notification-checker
 */

import {
  claimNotification,
  findUnnotifiedTrpgSessions,
  markNotificationSent,
  releaseNotificationClaim,
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

/** 생성 알림 스케줄러가 쓰는 DB 접근 — 테스트에서 가짜로 교체한다 */
export interface CreationSchedulerDb {
  find: typeof findUnnotifiedTrpgSessions;
  claim: typeof claimNotification;
  mark: typeof markNotificationSent;
  release: typeof releaseNotificationClaim;
}

const DEFAULT_DB: CreationSchedulerDb = {
  find: findUnnotifiedTrpgSessions,
  claim: claimNotification,
  mark: markNotificationSent,
  release: releaseNotificationClaim,
};

export function createCreationNotificationSpec(
  db: Partial<CreationSchedulerDb> = {},
): NotificationSchedulerSpec {
  const d = { ...DEFAULT_DB, ...db };
  return {
    name: "creation",
    logKind: "creation",
    messageKind: "creation",
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
 * 폴링 스케줄러 시작. 반환되는 함수를 호출하면 인터벌이 정리되고 진행 중 tick 을 기다린다.
 */
export function startTrpgNotificationChecker(
  client: Client,
  options: SchedulerStartOptions,
): () => Promise<void> {
  return createNotificationScheduler(
    createCreationNotificationSpec(),
    createDefaultSchedulerDeps(client, options),
  ).start();
}
