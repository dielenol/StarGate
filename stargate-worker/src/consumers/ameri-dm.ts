import { createHash, randomUUID } from "node:crypto";

import {
  JTEST_DISCORD_DM_MIRROR_RULE,
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

interface WorkshopDmOutboxEvent {
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

function escapeMarkdown(value: string, max: number): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .replace(/[\\`*_{}[\]()#+\-.!|>~]/g, "\\$&");
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

function label(kind: WorkshopRequest["kind"]): string {
  if (kind === "reload") return "재장전";
  return kind === "upgrade" ? "장비 강화" : "신규 제작";
}

function formatDuration(minutes: number): string {
  if (minutes % 1_440 === 0) {
    return `${minutes / 60}시간 · ${minutes / 1_440}일`;
  }
  if (minutes % 60 === 0) return `${minutes / 60}시간`;
  return `${minutes.toLocaleString("ko-KR")}분`;
}

function formatKst(value: Date | string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function content(
  request: WorkshopRequest,
  event: WorkshopDmOutboxEvent,
  baseUrl: string,
): string {
  const payload = event.payload ?? {};
  const requestLabel = label(request.kind);
  const equipmentName =
    payload.equipmentName ??
    request.quote?.result?.name ??
    request.equipmentName;
  const target = [
    escapeMarkdown(request.characterCodename, 100),
    equipmentName ? escapeMarkdown(equipmentName, 180) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const url = `${baseUrl}/erp/equipment-shop/custom`;
  const footer = [`▶ 공방 문서함: ${url}`, "— NOVUS ORDO · AMERI"];
  const lines: string[] = [];

  switch (event.event) {
    case "REQUESTED":
      lines.push(
        `**◆ 공방 ${requestLabel} 요청이 접수되었습니다.**`,
        target,
        "신청 문서를 검토 대기열에 등록했습니다.",
      );
      break;
    case "IN_REVIEW":
      lines.push(
        `**◆ 공방 ${requestLabel} 검토가 시작되었습니다.**`,
        target,
        "담당자가 신청 내용과 보유 장비·재료를 확인하고 있습니다.",
      );
      break;
    case "QUOTED":
      lines.push(
        `**◆ 공방 ${requestLabel} 견적이 도착했습니다.**`,
        target,
      );
      if (payload.totalCost !== undefined) {
        lines.push(
          `총 경제 부담: **${payload.totalCost.toLocaleString("ko-KR")} CR**`,
        );
      }
      if (payload.durationMinutes !== undefined) {
        lines.push(`예상 작업 시간: ${formatDuration(payload.durationMinutes)}`);
      }
      lines.push("견적 내용을 확인한 뒤 수락 또는 거절을 회신하십시오.");
      break;
    case "IN_PROGRESS":
      lines.push(
        `**◆ 공방 ${requestLabel} 작업이 시작되었습니다.**`,
        target,
      );
      if (payload.readyAt) {
        lines.push(`수령 예정: ${formatKst(payload.readyAt)} KST`);
      }
      lines.push("작업 완료 시 수령 가능 통지를 다시 보내드리겠습니다.");
      break;
    case "READY":
      lines.push(
        `**◆ 공방 ${requestLabel} 작업이 완료되었습니다.**`,
        target,
        "공방 문서함에서 결과 장비를 수령할 수 있습니다.",
      );
      break;
    case "DECLINED":
      lines.push(
        `**■ 공방 ${requestLabel} 견적 거절이 접수되었습니다.**`,
        target,
        "해당 견적은 폐기되었으며 비용과 재료는 차감되지 않습니다.",
      );
      break;
    case "REJECTED":
      lines.push(
        `**■ 공방 ${requestLabel} 요청이 반려되었습니다.**`,
        target,
      );
      if (payload.note) {
        lines.push(`반려 사유: ${escapeMarkdown(payload.note, 400)}`);
      }
      break;
    case "CANCELLED":
      lines.push(
        `**■ 공방 ${requestLabel} 작업이 취소되었습니다.**`,
        target,
      );
      if (payload.note) {
        lines.push(`취소 사유: ${escapeMarkdown(payload.note, 400)}`);
      }
      break;
    case "COMPLETED":
      lines.push(
        request.kind === "reload"
          ? "**◆ 공방 재장전 결재가 완료되었습니다.**"
          : `**◆ 공방 ${requestLabel} 결과 수령이 완료되었습니다.**`,
        target,
        request.kind === "reload"
          ? "장비 액션 충전 상태가 복구되었습니다."
          : "결과 장비가 자산 대장에 반영되었습니다.",
      );
      break;
  }
  return [...lines, ...footer].join("\n");
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
      const events = (request.discordDmOutbox ?? [])
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
              { mirror: JTEST_DISCORD_DM_MIRROR_RULE },
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
        await requests.updateOne(
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
      }
    }
    return summary;
  }
}
