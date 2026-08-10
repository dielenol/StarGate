import { createHash, randomUUID } from "node:crypto";

import { buildAmeriWorkshopDiscordDmContent } from "@stargate/core/domain/discord-dm-dialogue";
import {
  JTEST_WORKSHOP_DISCORD_DM_MIRROR_RULE,
  getDb,
  resolveDiscordDmRecipients,
  type DiscordDmRecipientKind,
} from "@stargate/shared-db";

import {
  DiscordDeliveryError,
  sendDiscordDirectMessage,
} from "../outbox/discord-client.js";
import type { DueWorkConsumerPort } from "./port.js";

const LEASE_MS = 10 * 60_000;
const RETRY_DELAY_MS = 5 * 60_000;
const MAX_BATCH_SIZE = 50;

type WorkshopDmEvent =
  | "REQUESTED"
  | "IN_REVIEW"
  | "QUOTED"
  | "IN_PROGRESS"
  | "READY"
  | "DECLINED"
  | "REJECTED"
  | "CANCELLED"
  | "COMPLETED";

export interface WorkshopDmOutboxEvent {
  id: string;
  event: WorkshopDmEvent;
  payload?: {
    equipmentName?: string;
    quoteVersion?: number;
    totalCost?: number;
    durationMinutes?: number;
    readyAt?: Date | string;
    specialistWorkflow?: Array<{
      specialistCodename: string;
      task: string;
    }>;
    note?: string;
  };
  availableAt: Date;
  sentAt?: Date;
  skippedAt?: Date;
  skippedReason?: string;
}

export function planDueAmeriDmEvents(
  events: readonly WorkshopDmOutboxEvent[],
  now: Date,
): {
  superseded: WorkshopDmOutboxEvent[];
  deliver: WorkshopDmOutboxEvent | null;
} {
  const due = events
    .filter(
      (event) =>
        !event.sentAt &&
        !event.skippedAt &&
        new Date(event.availableAt).getTime() <= now.getTime(),
    )
    .sort(
      (left, right) =>
        new Date(left.availableAt).getTime() -
        new Date(right.availableAt).getTime(),
    );
  return {
    superseded: due.slice(0, -1),
    deliver: due.at(-1) ?? null,
  };
}

interface WorkshopRequest {
  _id: string;
  kind: "upgrade" | "custom" | "reload";
  status: string;
  userId: string;
  characterCodename: string;
  equipmentName?: string;
  quote?: {
    result?: { name?: string };
  };
  discordDmOutbox?: WorkshopDmOutboxEvent[];
}

function siteBaseUrl(value?: string): string {
  const candidate = value?.trim() || "https://www.ordonet.co.kr";
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return "https://www.ordonet.co.kr";
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    return "https://www.ordonet.co.kr";
  }
}

function content(
  request: WorkshopRequest,
  event: WorkshopDmOutboxEvent,
  baseUrl: string,
): string {
  const payload = event.payload ?? {};
  const equipmentName =
    payload.equipmentName ??
    request.quote?.result?.name ??
    request.equipmentName;
  return buildAmeriWorkshopDiscordDmContent({
    event: event.event,
    kind: request.kind,
    characterCodename: request.characterCodename,
    ...payload,
    ...(equipmentName ? { equipmentName } : {}),
    workshopUrl: `${baseUrl}/erp/equipment-shop/custom`,
  });
}

function nonce(
  request: WorkshopRequest,
  event: WorkshopDmOutboxEvent,
  recipientKind: DiscordDmRecipientKind = "primary",
): string {
  return createHash("sha256")
    .update(
      [
        "equipment-workshop",
        request._id,
        event.id,
        ...(recipientKind === "mirror" ? ["mirror"] : []),
      ].join(":"),
    )
    .digest("hex")
    .slice(0, 25);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class AmeriDmConsumer implements DueWorkConsumerPort {
  readonly name = "ameri-dm";

  constructor(
    private readonly options: {
      botToken: string;
      siteBaseUrl?: string;
      fetchImpl?: typeof fetch;
      resolveRecipients?: typeof resolveDiscordDmRecipients;
    },
  ) {}

  async tick({ signal }: { signal: AbortSignal }) {
    const summary = {
      observedDue: 0,
      claimed: 0,
      delivered: 0,
      skipped: 0,
      failed: 0,
    };
    const db = await getDb();
    const requests = db.collection<WorkshopRequest>(
      "equipment_workshop_requests",
    );

    for (
      let index = 0;
      index < MAX_BATCH_SIZE && !signal.aborted;
      index += 1
    ) {
      const now = new Date();
      const leaseToken = randomUUID();
      const request = await requests.findOneAndUpdate(
        {
          discordDmOutbox: {
            $elemMatch: {
              availableAt: { $lte: now },
              sentAt: { $exists: false },
              skippedAt: { $exists: false },
            },
          },
          $or: [
            { "discordDmDelivery.leaseUntil": { $exists: false } },
            { "discordDmDelivery.leaseUntil": { $lte: now } },
          ],
          $and: [
            {
              $or: [
                {
                  "discordDmDelivery.nextAttemptAt": {
                    $exists: false,
                  },
                },
                { "discordDmDelivery.nextAttemptAt": { $lte: now } },
              ],
            },
          ],
        },
        {
          $set: {
            "discordDmDelivery.leaseToken": leaseToken,
            "discordDmDelivery.leaseUntil": new Date(
              now.getTime() + LEASE_MS,
            ),
          },
        },
        { sort: { updatedAt: 1 }, returnDocument: "after" },
      );
      if (!request) break;
      summary.observedDue += 1;
      summary.claimed += 1;

      let failed = false;
      const plan = planDueAmeriDmEvents(
        request.discordDmOutbox ?? [],
        now,
      );
      try {
        for (const event of plan.superseded) {
          const skipped = await requests.updateOne(
            {
              _id: request._id,
              "discordDmDelivery.leaseToken": leaseToken,
            },
            {
              $set: {
                "discordDmOutbox.$[event].skippedAt": new Date(),
                "discordDmOutbox.$[event].skippedReason":
                  "superseded_by_newer_due_event",
              },
            },
            {
              arrayFilters: [
                {
                  "event.id": event.id,
                  "event.sentAt": { $exists: false },
                  "event.skippedAt": { $exists: false },
                },
              ],
            },
          );
          if (skipped.modifiedCount !== 1) {
            throw new Error("밀린 아메리 DM 정리 전에 lease를 상실했습니다.");
          }
          summary.skipped += 1;
        }
      } catch (error) {
        failed = true;
        summary.failed += 1;
        const failedAt = new Date();
        await requests.updateOne(
          {
            _id: request._id,
            "discordDmDelivery.leaseToken": leaseToken,
          },
          {
            $set: {
              "discordDmDelivery.failedAt": failedAt,
              "discordDmDelivery.nextAttemptAt": new Date(
                failedAt.getTime() + RETRY_DELAY_MS,
              ),
              "discordDmDelivery.lastError": errorMessage(error).slice(0, 300),
            },
            $unset: {
              "discordDmDelivery.leaseToken": "",
              "discordDmDelivery.leaseUntil": "",
            },
          },
        );
      }
      const events = !failed && plan.deliver ? [plan.deliver] : [];
      for (const event of events) {
        try {
          let result:
            | "sent"
            | "skipped_unlinked"
            | "skipped_inactive"
            | "skipped_unreachable"
            | "no_longer_ready" = "sent";
          if (event.event === "READY" && request.status !== "IN_PROGRESS") {
            result = "no_longer_ready";
          } else {
            const resolution = await (
              this.options.resolveRecipients ?? resolveDiscordDmRecipients
            )(
              request.userId,
              { mirror: JTEST_WORKSHOP_DISCORD_DM_MIRROR_RULE },
            );
            if (resolution.sourceState === "inactive") {
              result = "skipped_inactive";
            } else if (resolution.recipients.length === 0) {
              result = "skipped_unlinked";
            } else {
              const message = content(
                request,
                event,
                siteBaseUrl(this.options.siteBaseUrl),
              );
              const errors: unknown[] = [];
              let sentCount = 0;
              for (const recipient of resolution.recipients) {
                try {
                  await sendDiscordDirectMessage(
                    {
                      recipientId: recipient.discordId,
                      content: message,
                      nonce: nonce(request, event, recipient.kind),
                      botToken: this.options.botToken,
                    },
                    this.options.fetchImpl,
                  );
                  sentCount += 1;
                } catch (error) {
                  errors.push(error);
                }
              }

              const retryableError = errors.find(
                (error) =>
                  !(
                    error instanceof DiscordDeliveryError &&
                    error.status === 403
                  ),
              );
              if (retryableError) throw retryableError;
              result =
                sentCount > 0 ? "sent" : "skipped_unreachable";
            }
          }

          const completion =
            result === "sent"
              ? { "discordDmOutbox.$[event].sentAt": new Date() }
              : {
                  "discordDmOutbox.$[event].skippedAt": new Date(),
                  "discordDmOutbox.$[event].skippedReason": result,
                };
          const completed = await requests.updateOne(
            {
              _id: request._id,
              "discordDmDelivery.leaseToken": leaseToken,
            },
            { $set: completion },
            {
              arrayFilters: [
                {
                  "event.id": event.id,
                  "event.sentAt": { $exists: false },
                  "event.skippedAt": { $exists: false },
                },
              ],
            },
          );
          if (completed.modifiedCount !== 1) {
            throw new Error("아메리 DM 완료 기록 전에 lease를 상실했습니다.");
          }
          if (result === "sent") summary.delivered += 1;
          else summary.skipped += 1;
        } catch (error) {
          failed = true;
          summary.failed += 1;
          const failedAt = new Date();
          await requests.updateOne(
            {
              _id: request._id,
              "discordDmDelivery.leaseToken": leaseToken,
            },
            {
              $set: {
                "discordDmDelivery.failedAt": failedAt,
                "discordDmDelivery.nextAttemptAt": new Date(
                  failedAt.getTime() + RETRY_DELAY_MS,
                ),
                "discordDmDelivery.lastError": errorMessage(error).slice(
                  0,
                  300,
                ),
              },
              $unset: {
                "discordDmDelivery.leaseToken": "",
                "discordDmDelivery.leaseUntil": "",
              },
            },
          );
          break;
        }
      }

      if (!failed) {
        const released = await requests.updateOne(
          {
            _id: request._id,
            "discordDmDelivery.leaseToken": leaseToken,
          },
          {
            $unset: {
              "discordDmDelivery.leaseToken": "",
              "discordDmDelivery.leaseUntil": "",
              "discordDmDelivery.nextAttemptAt": "",
              "discordDmDelivery.failedAt": "",
              "discordDmDelivery.lastError": "",
            },
          },
        );
        if (released.modifiedCount !== 1) {
          throw new Error("아메리 DM lease 해제 전에 소유권을 상실했습니다.");
        }
      }
    }
    return summary;
  }
}
