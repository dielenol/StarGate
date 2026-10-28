/**
 * 시작 전 리마인드 폴링 스케줄러 (24h / 1h)
 *
 * `TRPG_REMINDER_INTERVAL_MS` 주기로 폴링. 매 틱:
 *   center      = now + (24h | 1h)
 *   windowStart = center - buffer, windowEnd = center + buffer  (buffer = 2×interval)
 *   `findDueReminderSessions(windowStart, windowEnd, slot)` 호출.
 *
 * 종류별 규칙 (공용 팩토리 `createNotificationScheduler` 위에서):
 *   - 회차 = `date startTime` (roundKey). claim/mark 필터에 스냅샷을 넣어 발송 중
 *     재일정되면 mark 가 불일치해 lease 만 해제된다. 재일정 후 새 회차는 기존 참가자
 *     전원에게 다시 간다.
 *   - 수신자는 참가자 + GM.
 *   - 선행조건: 생성 알림이 먼저 나가야 한다(find/claim 이 `notificationSentAt != null`
 *     만 잡는다). 생성 알림이 30분 이내에 나갔으면 DM 없이 완료 처리.
 *
 * 1h 리마인드는 `config.trpgReminder1hEnabled` 가 false 면 시작하지 않는다.
 *
 * @module scheduler/trpg-reminder-checker
 */

import {
  claimReminder,
  findDueReminderSessions,
  markReminderSent,
  releaseReminderClaim,
} from "@stargate/shared-db";

import type { Client } from "discord.js";
import type { TrpgReminderSlot, TrpgSession } from "@stargate/shared-db";

import type { SchedulerStartOptions } from "./default-scheduler-deps.js";
import type { NotificationSchedulerSpec } from "./notification-scheduler.js";

import { config } from "../config.js";
import { createDefaultSchedulerDeps } from "./default-scheduler-deps.js";
import {
  createNotificationScheduler,
  recipientsWithGameMaster,
  reminderRoundKey,
  reminderSkipReason,
} from "./notification-scheduler.js";

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

/** 슬롯별 "시작 몇 ms 전" 과 스케줄러 이름 */
const SLOT_CONFIG: Record<
  TrpgReminderSlot,
  { leadMs: number; name: "reminder24h" | "reminder1h" }
> = {
  "24h": { leadMs: ONE_DAY_MS, name: "reminder24h" },
  "1h": { leadMs: ONE_HOUR_MS, name: "reminder1h" },
};

/** 리마인드 스케줄러가 쓰는 DB 접근 — 테스트에서 가짜로 교체한다 */
export interface ReminderSchedulerDb {
  find: typeof findDueReminderSessions;
  claim: typeof claimReminder;
  mark: typeof markReminderSent;
  release: typeof releaseReminderClaim;
}

const DEFAULT_DB: ReminderSchedulerDb = {
  find: findDueReminderSessions,
  claim: claimReminder,
  mark: markReminderSent,
  release: releaseReminderClaim,
};

/**
 * 윈도우 설계:
 *   - center = now + lead
 *   - buffer = intervalMs * 2 (단일 tick 지연으로 윈도우 사이가 비는 사고 방지.
 *     GC/네트워크 hang 대응으로 interval 의 2배 마진 확보)
 *   - 따라서 한 세션은 ±2*interval 내 중복 노출되지만 claim 이 atomic 차단.
 */
export function reminderWindow(
  now: Date,
  slot: TrpgReminderSlot,
  intervalMs: number,
): { windowStart: Date; windowEnd: Date } {
  const center = now.getTime() + SLOT_CONFIG[slot].leadMs;
  const bufferMs = intervalMs * 2;
  return {
    windowStart: new Date(center - bufferMs),
    windowEnd: new Date(center + bufferMs),
  };
}

function roundOf(slot: TrpgReminderSlot, session: TrpgSession) {
  return { slot, date: session.date, startTime: session.startTime };
}

export function createReminderSpec(
  slot: TrpgReminderSlot,
  db: Partial<ReminderSchedulerDb> = {},
  intervalMs: number = config.trpgReminderIntervalMs,
): NotificationSchedulerSpec {
  const d = { ...DEFAULT_DB, ...db };
  const { name } = SLOT_CONFIG[slot];
  return {
    name,
    logKind: name,
    messageKind: name,
    intervalMs,
    find: (now) => {
      const { windowStart, windowEnd } = reminderWindow(now, slot, intervalMs);
      return d.find(windowStart, windowEnd, slot);
    },
    claim: (sessionId, session, leaseUntil) =>
      d.claim(sessionId, leaseUntil, roundOf(slot, session)),
    mark: (sessionId, session) => d.mark(sessionId, roundOf(slot, session)),
    release: (sessionId, leaseUntil) => d.release(sessionId, leaseUntil, slot),
    roundKey: reminderRoundKey,
    recipients: recipientsWithGameMaster,
    skipReason: reminderSkipReason,
  };
}

/** 24h 리마인드 폴링 시작. 반환된 함수 호출 시 인터벌 정리 + 진행 중 tick 대기. */
export function startTrpgReminderChecker(
  client: Client,
  options: SchedulerStartOptions,
): () => Promise<void> {
  return createNotificationScheduler(
    createReminderSpec("24h"),
    createDefaultSchedulerDeps(client, options),
  ).start();
}

/**
 * 1h 리마인드 폴링 시작. `TRPG_REMINDER_1H` 가 꺼져 있으면 시작하지 않고 null 을 반환한다.
 */
export function startTrpgReminder1hChecker(
  client: Client,
  options: SchedulerStartOptions,
): (() => Promise<void>) | null {
  if (!config.trpgReminder1hEnabled) return null;
  return createNotificationScheduler(
    createReminderSpec("1h"),
    createDefaultSchedulerDeps(client, options),
  ).start();
}
