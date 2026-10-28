/**
 * 알림 스케줄러 운영용 의존성 묶음
 *
 * `createNotificationScheduler` 가 요구하는 `NotificationSchedulerDeps` 를 실제
 * shared-db CRUD · Discord DM 유틸 · config · 종료 상태 · 런타임 기록으로 채운다.
 * 팩토리 모듈 자체는 config 를 import 하지 않아 DB·환경변수 없이 테스트할 수 있다.
 *
 * @module scheduler/default-scheduler-deps
 */

import {
  findTrpgGuildMembersByDiscordIds,
  findTrpgSessionById,
  hasDeliveredNotificationAttempt,
  recordNotificationAttempt,
} from "@stargate/shared-db";

import type { Client } from "discord.js";

import type { OperatorAlertSink } from "../utils/operator-alerts.js";
import type { NotificationSchedulerDeps } from "./notification-scheduler.js";

import { config } from "../config.js";
import { sendDmOrFallback } from "../utils/dm-with-fallback.js";
import { recordTaskRun } from "../utils/runtime-status.js";
import { isShuttingDown } from "../utils/shutdown-state.js";

export interface SchedulerStartOptions {
  operatorAlerts: OperatorAlertSink;
}

export function createDefaultSchedulerDeps(
  client: Client,
  options: SchedulerStartOptions,
): NotificationSchedulerDeps {
  return {
    baseUrl: config.trpgWebBaseUrl,
    refetch: findTrpgSessionById,
    hasDelivered: hasDeliveredNotificationAttempt,
    record: recordNotificationAttempt,
    send: (userId, payload, { allowFallback }) =>
      sendDmOrFallback(client, userId, payload, {
        fallbackChannelId: config.trpgFallbackChannelId,
        mentionUser: true,
        allowFallback,
      }),
    findGuildMembers: findTrpgGuildMembersByDiscordIds,
    isShuttingDown,
    now: () => new Date(),
    operatorAlerts: options.operatorAlerts,
    recordTaskRun,
  };
}
