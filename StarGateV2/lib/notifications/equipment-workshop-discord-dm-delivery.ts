import {
  claimDueEquipmentWorkshopDiscordDmDelivery,
  completeEquipmentWorkshopDiscordDmEvent,
  releaseEquipmentWorkshopDiscordDmDelivery,
  type EquipmentWorkshopRequestDoc,
} from "@/lib/db/equipment-workshop-requests";
import type { EquipmentWorkshopDiscordDmOutboxEvent } from "@/lib/equipment-shop/workshop-discord-dm-outbox";
import {
  notifyEquipmentWorkshopDiscordDm,
  type EquipmentWorkshopDiscordDmInput,
  type EquipmentWorkshopDiscordDmResult,
} from "@/lib/notifications/equipment-workshop-discord-dm";

const CLAIM_LEASE_MS = 10 * 60 * 1_000;
const RETRY_BACKOFF_MS = 5 * 60 * 1_000;
const MAX_BATCH_SIZE = 50;

interface EquipmentWorkshopDiscordDmDeliveryDependencies {
  botToken?: string | null;
  claim?: typeof claimDueEquipmentWorkshopDiscordDmDelivery;
  complete?: typeof completeEquipmentWorkshopDiscordDmEvent;
  release?: typeof releaseEquipmentWorkshopDiscordDmDelivery;
  notify?: (
    input: EquipmentWorkshopDiscordDmInput,
    botToken: string,
  ) => Promise<EquipmentWorkshopDiscordDmResult>;
  randomUUID?: () => string;
  currentTime?: () => Date;
}

export interface EquipmentWorkshopDiscordDmDeliverySummary {
  configured: boolean;
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
}

function pendingEvents(
  request: EquipmentWorkshopRequestDoc,
  now: Date,
): EquipmentWorkshopDiscordDmOutboxEvent[] {
  return (request.discordDmOutbox ?? []).filter(
    (event) =>
      !event.sentAt &&
      !event.skippedAt &&
      event.availableAt.getTime() <= now.getTime(),
  );
}

function dmInput(
  request: EquipmentWorkshopRequestDoc,
  outboxEvent: EquipmentWorkshopDiscordDmOutboxEvent,
): EquipmentWorkshopDiscordDmInput {
  const payload = outboxEvent.payload;
  return {
    requestId: request._id,
    event: outboxEvent.event,
    userId: request.userId,
    kind: request.kind,
    characterCodename: request.characterCodename,
    ...(payload?.equipmentName || request.quote?.result.name || request.equipmentName
      ? {
          equipmentName:
            payload?.equipmentName ??
            request.quote?.result.name ??
            request.equipmentName,
        }
      : {}),
    ...(payload?.quoteVersion !== undefined
      ? { quoteVersion: payload.quoteVersion }
      : {}),
    ...(payload?.totalCost !== undefined
      ? { totalCost: payload.totalCost }
      : {}),
    ...(payload?.durationMinutes !== undefined
      ? { durationMinutes: payload.durationMinutes }
      : {}),
    ...(payload?.readyAt ? { readyAt: payload.readyAt } : {}),
    ...(payload?.specialistWorkflow
      ? { specialistWorkflow: payload.specialistWorkflow }
      : {}),
    ...(payload?.note ? { note: payload.note } : {}),
  };
}

function isUnreachableDiscordRecipient(error: unknown): boolean {
  return (
    error instanceof Error &&
    /Discord .* 실패 \(403\)/.test(error.message)
  );
}

export async function drainEquipmentWorkshopDiscordDms(
  options: { requestId?: string } = {},
  dependencies: EquipmentWorkshopDiscordDmDeliveryDependencies = {},
): Promise<EquipmentWorkshopDiscordDmDeliverySummary> {
  const botToken =
    dependencies.botToken === undefined
      ? process.env.AMERI_DISCORD_BOT_TOKEN
      : dependencies.botToken;
  const normalizedBotToken = botToken?.trim();
  const summary: EquipmentWorkshopDiscordDmDeliverySummary = {
    configured: Boolean(normalizedBotToken),
    claimed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  };
  if (!normalizedBotToken) return summary;

  const claim =
    dependencies.claim ?? claimDueEquipmentWorkshopDiscordDmDelivery;
  const complete =
    dependencies.complete ?? completeEquipmentWorkshopDiscordDmEvent;
  const release =
    dependencies.release ?? releaseEquipmentWorkshopDiscordDmDelivery;
  const notify =
    dependencies.notify ??
    ((input, token) =>
      notifyEquipmentWorkshopDiscordDm(input, { botToken: token }));
  const randomUUID = dependencies.randomUUID ?? crypto.randomUUID;
  const currentTime = dependencies.currentTime ?? (() => new Date());

  for (let index = 0; index < MAX_BATCH_SIZE; index += 1) {
    const claimedAt = currentTime();
    const leaseToken = randomUUID();
    const request = await claim({
      ...(options.requestId ? { requestId: options.requestId } : {}),
      leaseToken,
      now: claimedAt,
      leaseUntil: new Date(claimedAt.getTime() + CLAIM_LEASE_MS),
    });
    if (!request) break;
    summary.claimed += 1;

    let failed = false;
    for (const event of pendingEvents(request, claimedAt)) {
      try {
        if (event.event === "READY" && request.status !== "IN_PROGRESS") {
          const completed = await complete({
            requestId: request._id,
            leaseToken,
            eventId: event.id,
            completedAt: currentTime(),
            result: "no_longer_ready",
          });
          if (!completed) {
            throw new Error("수령 가능 DM 생략 기록 전에 lease를 상실했습니다.");
          }
          summary.skipped += 1;
          continue;
        }

        const result = await notify(
          dmInput(request, event),
          normalizedBotToken,
        );
        if (result === "skipped_unconfigured") {
          throw new Error("아메리 봇 토큰을 확인할 수 없습니다.");
        }
        const completed = await complete({
          requestId: request._id,
          leaseToken,
          eventId: event.id,
          completedAt: currentTime(),
          result,
        });
        if (!completed) {
          throw new Error("공방 DM 완료 기록 전에 lease를 상실했습니다.");
        }
        if (result === "sent") summary.sent += 1;
        else summary.skipped += 1;
      } catch (error) {
        if (isUnreachableDiscordRecipient(error)) {
          const completed = await complete({
            requestId: request._id,
            leaseToken,
            eventId: event.id,
            completedAt: currentTime(),
            result: "skipped_unreachable",
          });
          if (completed) {
            summary.skipped += 1;
            continue;
          }
        }
        failed = true;
        summary.failed += 1;
        const failedAt = currentTime();
        await release({
          requestId: request._id,
          leaseToken,
          failedAt,
          nextAttemptAt: new Date(failedAt.getTime() + RETRY_BACKOFF_MS),
          error: error instanceof Error ? error.message : String(error),
        }).catch((releaseError) => {
          console.warn(
            "[equipment-workshop] Discord DM lease release failed",
            releaseError,
          );
        });
        break;
      }
    }

    if (!failed) {
      await release({
        requestId: request._id,
        leaseToken,
      });
    }
    if (options.requestId) break;
  }

  return summary;
}
