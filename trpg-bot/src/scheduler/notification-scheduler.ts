/**
 * trpg 세션 알림 폴링 스케줄러 공용 팩토리
 *
 * 생성·수정·취소·리마인드(24h·1h) 스케줄러는 모두 같은 흐름이다:
 *   1. `spec.find(now)` 로 후보 세션 조회
 *   2. 세션마다 `spec.claim` 으로 발송권 선점 (회차 스냅샷 포함)
 *   3. 선점 후 `deps.refetch` 로 최신 문서 재조회 — 회차가 어긋나면 lease 해제 후 skip
 *   4. DM 없이 끝낼 사유(`spec.skipReason`: 시작 시각 경과, 생성 알림 직후 등)가 있으면
 *      수신자 루프를 건너뛰고 완료 처리
 *   5. 수신자마다: 회차별 중복 가드(`hasDelivered` + roundKey) → DM/폴백 → 로그 적재.
 *      길드 탈퇴자(`leftAt != null`)는 공개 폴백 멘션 없이 DM 만 시도.
 *   6. `spec.mark` 로 완료 표시. 회차 불일치(0건)면 자기 lease 만 해제해 다음 tick 이
 *      최신 회차를 처리하게 한다.
 *
 * 종료 중(`deps.isShuttingDown()`)에는 다음 수신자로 넘어가지 않고 mark 없이 lease 를
 * 해제한다 — 다음 인스턴스가 남은 수신자를 이어서 처리한다.
 *
 * 운영 알림: tick 실패(`trpg-scheduler:<name>:tick`, 1h cooldown, critical),
 * 세션 처리 예외 ≥1(`trpg-scheduler:<name>:session-error`, warning — claim 뒤 예외는
 * lease 를 해제하고 다시 던진다), 세션당 failed 수신자 ≥1
 * (`trpg-scheduler:<name>:delivery-failed`, warning). 예상된 실패(길드 탈퇴자 DM 실패,
 * 10013 Unknown User)는 시도 로그에는 failed 로 남기되 운영 경고에서는 뺀다.
 * 각 tick 종료 시 `recordTaskRun("scheduler:<name>", …)` 를 남기며, 세션 처리 예외가
 * 있으면 ok:false 다. 종료 중이면 tick 은 조회 전에 바로 돌아간다(기록·알림 없음).
 *
 * 모든 외부 의존성(DB·Discord·시계·종료 상태)은 `deps` 로 주입되어 DB 없이 테스트한다.
 *
 * @module scheduler/notification-scheduler
 */

import type { BaseMessageOptions } from "discord.js";
import type {
  findTrpgGuildMembersByDiscordIds,
  findTrpgSessionById,
  hasDeliveredNotificationAttempt,
  recordNotificationAttempt,
  TrpgNotificationKind,
  TrpgSession,
} from "@stargate/shared-db";

import type { DmResult } from "../utils/dm-with-fallback.js";
import type { OperatorAlertSink } from "../utils/operator-alerts.js";
import type { TaskRunInput } from "../utils/runtime-status.js";

import { DISCORD_UNKNOWN_USER } from "../utils/dm-with-fallback.js";
import { kstDateTimeToUnix } from "../utils/kst.js";
import {
  buildTrpgSessionDmMessage,
  type TrpgSessionDmKind,
} from "../utils/trpg-session-message.js";

/** lease 기간 — claim 후 발송 완료까지 5분 안에 끝낸다고 가정 */
const DEFAULT_LEASE_DURATION_MS = 5 * 60 * 1000;
/** tick 실패 운영 알림 cooldown — 같은 장애로 1시간에 한 번만 */
const TICK_FAILURE_ALERT_COOLDOWN_MS = 3_600_000;
/** 생성 알림 직후 리마인드 중복 안내를 막는 창 */
export const REMINDER_AFTER_CREATION_GRACE_MS = 30 * 60 * 1000;

export type NotificationSchedulerName =
  | "creation"
  | "update"
  | "cancellation"
  | "reminder24h"
  | "reminder1h";

const SCHEDULER_LABELS: Record<NotificationSchedulerName, string> = {
  creation: "세션 생성",
  update: "세션 수정",
  cancellation: "세션 취소",
  reminder24h: "24시간 전 리마인드",
  reminder1h: "1시간 전 리마인드",
};

/** 알림 종류별 설정 — 각 kind 파일이 채운다 */
export interface NotificationSchedulerSpec {
  name: NotificationSchedulerName;
  /** 알림 로그 `kind` */
  logKind: TrpgNotificationKind;
  /** DM 메시지 종류 */
  messageKind: TrpgSessionDmKind;
  intervalMs: number;
  find(now: Date): Promise<TrpgSession[]>;
  /** 조회 스냅샷(`session`)의 회차로 발송권을 선점한다 */
  claim(sessionId: string, session: TrpgSession, leaseUntil: Date): Promise<boolean>;
  /** 같은 회차일 때만 완료 표시. 불일치면 false */
  mark(sessionId: string, session: TrpgSession): Promise<boolean>;
  /** 내 lease 일 때만 해제 */
  release(sessionId: string, leaseUntil: Date): Promise<void>;
  /** 회차 키 — 로그 roundKey 겸 조회/재조회 스냅샷 비교 기준. 단일 회차면 null */
  roundKey(session: TrpgSession): string | null;
  /** 실제 발송 대상 (GM 제외 등 종류별 규칙 적용 후) */
  recipients(session: TrpgSession): string[];
  /** DM 없이 회차를 완료 처리할 사유. null 이면 발송한다 */
  skipReason(session: TrpgSession, now: Date): string | null;
}

/** 외부 의존성 — 운영은 `createDefaultSchedulerDeps`, 테스트는 가짜로 채운다 */
export interface NotificationSchedulerDeps {
  /** DM 버튼 링크의 trpg-web 베이스 URL */
  baseUrl: string;
  refetch: typeof findTrpgSessionById;
  hasDelivered: typeof hasDeliveredNotificationAttempt;
  record: typeof recordNotificationAttempt;
  send(
    userId: string,
    payload: BaseMessageOptions,
    options: { allowFallback: boolean },
  ): Promise<DmResult>;
  findGuildMembers: typeof findTrpgGuildMembersByDiscordIds;
  isShuttingDown(): boolean;
  now(): Date;
  operatorAlerts: OperatorAlertSink;
  recordTaskRun(name: string, result: TaskRunInput): void;
  leaseMs?: number;
}

export interface NotificationScheduler {
  /** 한 번 폴링한다. 직전 tick 이 진행 중이면 즉시 반환 */
  tick(): Promise<void>;
  /** 즉시 1회 + 주기 폴링 시작. 반환된 stop 은 인터벌 정리 후 진행 중 tick 을 기다린다 */
  start(): () => Promise<void>;
}

type SessionOutcome = "skipped" | "processed" | "aborted";

interface DeliveryFailure {
  userId: string;
  error: string;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** 세션 시작 시각(KST `date startTime`)이 `now` 이전인지. 형식이 깨졌으면 false */
export function hasSessionStarted(session: TrpgSession, now: Date): boolean {
  const unix = kstDateTimeToUnix(session.date, session.startTime);
  if (unix === null) return false;
  return unix * 1000 <= now.getTime();
}

/** 생성·수정·취소 수신자 — GM(`createdByDiscordId`)은 제외한다 */
export function recipientsWithoutGameMaster(
  session: TrpgSession,
  candidates: string[] = session.participantDiscordIds,
): string[] {
  return Array.from(
    new Set(candidates.filter((id) => id !== session.createdByDiscordId)),
  );
}

/** 리마인드 수신자 — 참가자 + GM */
export function recipientsWithGameMaster(session: TrpgSession): string[] {
  return Array.from(
    new Set([...session.participantDiscordIds, session.createdByDiscordId]),
  );
}

/** 리마인드 회차 키 `"${date} ${startTime}"` */
export function reminderRoundKey(session: TrpgSession): string {
  return `${session.date} ${session.startTime}`;
}

/** 생성 알림이 `graceMs` 안에 나갔으면 리마인드를 DM 없이 완료 처리할 사유를 돌려준다 */
export function reminderSkipReason(session: TrpgSession, now: Date): string | null {
  const sentAt = session.notificationSentAt;
  if (!(sentAt instanceof Date)) return null;
  const elapsed = now.getTime() - sentAt.getTime();
  return elapsed >= 0 && elapsed < REMINDER_AFTER_CREATION_GRACE_MS
    ? "생성 알림 직후"
    : null;
}

export function createNotificationScheduler(
  spec: NotificationSchedulerSpec,
  deps: NotificationSchedulerDeps,
): NotificationScheduler {
  const tag = `[trpg-scheduler:${spec.name}]`;
  const label = SCHEDULER_LABELS[spec.name];
  const leaseMs = deps.leaseMs ?? DEFAULT_LEASE_DURATION_MS;

  const notifyOperator = async (
    event: Parameters<OperatorAlertSink["notify"]>[0],
  ): Promise<void> => {
    try {
      await deps.operatorAlerts.notify(event);
    } catch (err) {
      console.error(`${tag} 운영 알림 처리 실패:`, err);
    }
  };

  const recordAttempt = async (
    input: Parameters<typeof deps.record>[0],
  ): Promise<void> => {
    try {
      await deps.record(input);
    } catch (err) {
      console.error(`${tag} 로그 적재 실패:`, err);
    }
  };

  /**
   * 수신자 전원에게 발송한다. 종료 중이면 `aborted` 를 돌려주고 즉시 멈춘다.
   */
  const deliver = async (
    sessionId: string,
    session: TrpgSession,
    recipients: string[],
    failures: DeliveryFailure[],
  ): Promise<"done" | "aborted"> => {
    const roundKey = spec.roundKey(session);
    const members = await deps.findGuildMembers(session.guildId, recipients);
    const leftGuild = new Set(
      members.filter((m) => m.leftAt != null).map((m) => m.discordUserId),
    );
    const payload = buildTrpgSessionDmMessage({
      kind: spec.messageKind,
      session,
      sessionId,
      baseUrl: deps.baseUrl,
    });

    for (const userId of recipients) {
      if (deps.isShuttingDown()) return "aborted";
      try {
        const alreadyDelivered = await deps.hasDelivered({
          sessionId,
          discordUserId: userId,
          kind: spec.logKind,
          roundKey,
        });
        if (alreadyDelivered) continue;

        const hasLeft = leftGuild.has(userId);
        const result = await deps.send(userId, payload, {
          allowFallback: !hasLeft,
        });
        const error =
          result.method === "failed" && hasLeft
            ? `left guild: ${result.error ?? "DM failed"}`
            : (result.error ?? null);

        await recordAttempt({
          sessionId,
          discordUserId: userId,
          kind: spec.logKind,
          roundKey,
          deliveryMethod: result.method,
          error,
        });

        if (result.method === "failed") {
          console.warn(
            `${tag} 발송 실패 — session=${sessionId} user=${userId} error=${error}`,
          );
          // 탈퇴자의 DM 실패와 존재하지 않는 계정(10013)은 예상된 결과 — 운영 경고 제외.
          const expected = hasLeft || result.code === DISCORD_UNKNOWN_USER;
          if (!expected) failures.push({ userId, error: error ?? "unknown" });
        }
      } catch (err) {
        // 개별 사용자 발송 중 unhandled — 로그만 남기고 다음 사용자 진행
        const error = errorMessage(err);
        failures.push({ userId, error });
        console.error(
          `${tag} 사용자 처리 예외 session=${sessionId} user=${userId}:`,
          err,
        );
        await recordAttempt({
          sessionId,
          discordUserId: userId,
          kind: spec.logKind,
          roundKey,
          deliveryMethod: "failed",
          error,
        });
      }
    }
    return "done";
  };

  const processSession = async (found: TrpgSession): Promise<SessionOutcome> => {
    const sessionId = found._id?.toString();
    if (!sessionId) return "skipped";

    const leaseUntil = new Date(deps.now().getTime() + leaseMs);
    const claimed = await spec.claim(sessionId, found, leaseUntil);
    if (!claimed) return "skipped";

    try {
      return await processClaimed(sessionId, found, leaseUntil);
    } catch (err) {
      // 선점한 채 예외로 빠지면 lease 가 만료될 때까지 아무도 못 잡는다 — 먼저 해제.
      await spec.release(sessionId, leaseUntil).catch(() => undefined);
      throw err;
    }
  };

  const processClaimed = async (
    sessionId: string,
    found: TrpgSession,
    leaseUntil: Date,
  ): Promise<SessionOutcome> => {
    // 선점 후 최신 문서로 payload·수신자를 만든다. 회차가 어긋나면 lease 해제 후 skip.
    const session = await deps.refetch(sessionId);
    if (
      !session ||
      session.status !== found.status ||
      spec.roundKey(session) !== spec.roundKey(found)
    ) {
      await spec.release(sessionId, leaseUntil);
      console.warn(`${tag} 선점 후 회차 불일치 — session=${sessionId} skip`);
      return "skipped";
    }

    const failures: DeliveryFailure[] = [];
    const skipReason = spec.skipReason(session, deps.now());
    const recipients = skipReason ? [] : spec.recipients(session);
    if (skipReason) {
      console.log(`${tag} DM 없이 완료 처리 — session=${sessionId} (${skipReason})`);
    } else if (recipients.length === 0) {
      console.log(`${tag} 수신자 없음 — session=${sessionId} 완료 처리`);
    } else {
      const outcome = await deliver(sessionId, session, recipients, failures);
      if (outcome === "aborted") {
        await spec.release(sessionId, leaseUntil);
        return "aborted";
      }
    }

    if (deps.isShuttingDown()) {
      await spec.release(sessionId, leaseUntil);
      return "aborted";
    }

    const marked = await spec.mark(sessionId, found);
    if (!marked) {
      // 발송 중 재대기·재일정 — 다음 tick 이 최신 회차를 처리하도록 lease 만 해제.
      await spec.release(sessionId, leaseUntil);
      console.warn(`${tag} 완료 표시 회차 불일치 — session=${sessionId} lease 해제`);
    }

    if (failures.length > 0) {
      await notifyOperator({
        key: `trpg-scheduler:${spec.name}:delivery-failed`,
        title: `${label} 알림 일부 발송 실패`,
        description: `${label} 알림을 일부 참가자에게 보내지 못했습니다. DM 차단 여부와 폴백 채널 설정을 확인해 주세요.`,
        severity: "warning",
        context: {
          세션: sessionId,
          제목: session.title,
          실패: failures.length,
          첫오류: failures[0]?.error,
        },
      });
    }
    return "processed";
  };

  let inFlight: Promise<void> | null = null;

  const run = async (): Promise<void> => {
    // 종료 중에는 새 폴링을 시작하지 않는다 — 닫히는 DB 를 쳐 가짜 장애 알림을 내지 않게.
    if (deps.isShuttingDown()) return;

    let processed = 0;
    const sessionErrors: string[] = [];
    try {
      const sessions = await spec.find(deps.now());
      for (const session of sessions) {
        if (deps.isShuttingDown()) break;
        try {
          const outcome = await processSession(session);
          if (outcome === "processed") processed += 1;
          if (outcome === "aborted") break;
        } catch (err) {
          // 한 세션 처리 실패가 다른 세션에 영향 없도록 격리.
          sessionErrors.push(errorMessage(err));
          console.error(`${tag} 세션 처리 실패:`, session._id?.toString(), err);
        }
      }
      deps.recordTaskRun(`scheduler:${spec.name}`, {
        ok: sessionErrors.length === 0,
        processed,
        ...(sessionErrors.length > 0 ? { error: sessionErrors[0] } : {}),
      });
      if (sessionErrors.length > 0) {
        await notifyOperator({
          key: `trpg-scheduler:${spec.name}:session-error`,
          title: `${label} 알림 세션 처리 실패`,
          description: `${label} 알림을 처리하던 중 일부 세션에서 예외가 발생했습니다. 해당 세션은 다음 폴링에서 다시 시도합니다.`,
          severity: "warning",
          context: {
            실패세션: sessionErrors.length,
            첫오류: sessionErrors[0],
          },
        });
      }
    } catch (err) {
      console.error(`${tag} tick 실패:`, err);
      deps.recordTaskRun(`scheduler:${spec.name}`, {
        ok: false,
        processed,
        error: err,
      });
      await notifyOperator({
        key: `trpg-scheduler:${spec.name}:tick`,
        title: `${label} 알림 폴링 실패`,
        description: `${label} 알림 스케줄러의 폴링이 실패했습니다. DB 연결 상태를 확인해 주세요.`,
        severity: "critical",
        error: err,
        cooldownMs: TICK_FAILURE_ALERT_COOLDOWN_MS,
      });
    }
  };

  // tick 재진입 가드: DB/네트워크 지연으로 tick 이 interval 보다 오래 걸리면
  // 동시 실행될 수 있다. 진행 중 Promise 를 들고 있어 stop 이 기다릴 수 있게 한다.
  const tick = async (): Promise<void> => {
    if (inFlight) return;
    inFlight = run().finally(() => {
      inFlight = null;
    });
    await inFlight;
  };

  const start = (): (() => Promise<void>) => {
    // 즉시 한 번 실행 (기동 직후 미발송 세션 처리)
    void tick();
    const handle = setInterval(() => {
      void tick();
    }, spec.intervalMs);

    return async () => {
      clearInterval(handle);
      if (inFlight) await inFlight;
    };
  };

  return { tick, start };
}
