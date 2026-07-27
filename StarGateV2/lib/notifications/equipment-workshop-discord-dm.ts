import { createHash } from "node:crypto";

import {
  JTEST_DISCORD_DM_MIRROR_RULE,
  resolveDiscordDmRecipients,
  type DiscordDmRecipientKind,
} from "@stargate/shared-db";

import type {
  EquipmentWorkshopRequestKind,
  EquipmentWorkshopSpecialist,
} from "@/lib/equipment-shop/workshop-request";
import type { EquipmentWorkshopDiscordDmEvent } from "@/lib/equipment-shop/workshop-discord-dm-outbox";
import {
  sendDiscordDirectMessage,
  type DiscordDirectMessageInput,
  type DiscordDirectMessageOptions,
  type DiscordDirectMessageResult,
} from "@/lib/discord/direct-message";

export interface EquipmentWorkshopDiscordDmInput {
  requestId: string;
  event: EquipmentWorkshopDiscordDmEvent;
  userId: string;
  kind: EquipmentWorkshopRequestKind;
  characterCodename: string;
  equipmentName?: string;
  quoteVersion?: number;
  totalCost?: number;
  durationMinutes?: number;
  readyAt?: Date | string;
  specialistWorkflow?: readonly {
    specialistCodename: EquipmentWorkshopSpecialist;
    task: string;
  }[];
  note?: string;
}

export type EquipmentWorkshopDiscordDmResult =
  | "sent"
  | "skipped_unconfigured"
  | "skipped_unlinked"
  | "skipped_inactive"
  | "skipped_unreachable";

interface EquipmentWorkshopDiscordDmDependencies {
  botToken?: string | null;
  siteBaseUrl?: string;
  resolveRecipients?: typeof resolveDiscordDmRecipients;
  sendDirectMessage?: (
    input: DiscordDirectMessageInput,
    options?: DiscordDirectMessageOptions,
  ) => Promise<DiscordDirectMessageResult>;
}

const DEFAULT_SITE_BASE_URL = "https://www.ordonet.co.kr";
const AMERI_SIGNATURE = "NOVUS ORDO · AMERI";
const DISCORD_MARKDOWN_CHARACTERS = new Set(
  "\\`*_{}[]()#+-.!|>~".split(""),
);
const SPECIALIST_LABELS: Record<EquipmentWorkshopSpecialist, string> = {
  VERNIER: "에이다 슈라이버 (VERNIER)",
  TEMPER: "브리짓 케인 (TEMPER)",
  TOWASKI: "립 토와스키 (TOWASKI)",
  SUTURE: "이레나 부코비치 (SUTURE)",
  RATCHET: "마테오 리바스 (RATCHET)",
};

function escapeDiscordMarkdown(value: string, maxLength: number): string {
  const normalized = value
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  return Array.from(normalized, (character) =>
    DISCORD_MARKDOWN_CHARACTERS.has(character)
      ? `\\${character}`
      : character,
  ).join("");
}

function formatDuration(durationMinutes: number): string {
  if (durationMinutes % 1_440 === 0) {
    return `${durationMinutes / 60}시간 · ${durationMinutes / 1_440}일`;
  }
  if (durationMinutes % 60 === 0) {
    return `${durationMinutes / 60}시간`;
  }
  return `${durationMinutes.toLocaleString("ko-KR")}분`;
}

function formatKstDateTime(value: Date | string): string {
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

function getSiteBaseUrl(override?: string): string {
  const candidate =
    override ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.AUTH_URL ||
    DEFAULT_SITE_BASE_URL;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return DEFAULT_SITE_BASE_URL;
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    return DEFAULT_SITE_BASE_URL;
  }
}

function buildNonce(
  input: EquipmentWorkshopDiscordDmInput,
  recipientKind: DiscordDmRecipientKind = "primary",
): string {
  return createHash("sha256")
    .update(
      [
        "equipment-workshop",
        input.requestId,
        input.event,
        input.quoteVersion ?? 0,
        ...(recipientKind === "mirror" ? ["mirror"] : []),
      ].join(":"),
    )
    .digest("hex")
    .slice(0, 25);
}

function requestLabel(input: EquipmentWorkshopDiscordDmInput): string {
  if (input.kind === "reload") return "재장전";
  return input.kind === "upgrade" ? "장비 강화" : "신규 제작";
}

function requestTarget(input: EquipmentWorkshopDiscordDmInput): string {
  return [
    escapeDiscordMarkdown(input.characterCodename, 100),
    input.equipmentName
      ? escapeDiscordMarkdown(input.equipmentName, 180)
      : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}

function withFooter(lines: string[], workshopUrl: string): string {
  return [
    ...lines,
    `▶ 공방 문서함: ${workshopUrl}`,
    `— ${AMERI_SIGNATURE}`,
  ].join("\n");
}

export function buildEquipmentWorkshopDiscordDmContent(
  input: EquipmentWorkshopDiscordDmInput,
  siteBaseUrl?: string,
): string {
  const label = requestLabel(input);
  const target = requestTarget(input);
  const workshopUrl = `${getSiteBaseUrl(siteBaseUrl)}/erp/equipment-shop/custom`;
  const note = input.note
    ? escapeDiscordMarkdown(input.note, 400)
    : undefined;

  switch (input.event) {
    case "REQUESTED":
      return withFooter(
        [
          `**◆ 공방 ${label} 요청이 접수되었습니다.**`,
          target,
          "신청 문서를 검토 대기열에 등록했습니다. 담당자 확인 후 다음 절차를 통지하겠습니다.",
        ],
        workshopUrl,
      );
    case "IN_REVIEW":
      return withFooter(
        [
          `**◆ 공방 ${label} 검토가 시작되었습니다.**`,
          target,
          "담당자가 신청 내용과 보유 장비·재료를 확인하고 있습니다.",
        ],
        workshopUrl,
      );
    case "QUOTED": {
      const specialists = (input.specialistWorkflow ?? [])
        .map((step) => {
          const task = escapeDiscordMarkdown(step.task, 100);
          return task
            ? `${SPECIALIST_LABELS[step.specialistCodename]} · ${task}`
            : SPECIALIST_LABELS[step.specialistCodename];
        })
        .join(" → ");
      return withFooter(
        [
          `**◆ 공방 ${label} 견적이 도착했습니다.**`,
          target,
          ...(input.totalCost !== undefined
            ? [
                `총 경제 부담: **${input.totalCost.toLocaleString("ko-KR")} CR**`,
              ]
            : []),
          ...(input.durationMinutes !== undefined
            ? [`예상 작업 시간: ${formatDuration(input.durationMinutes)}`]
            : []),
          ...(specialists ? [`담당: ${specialists}`] : []),
          "견적 내용을 확인한 뒤 수락 또는 거절을 회신하십시오.",
        ],
        workshopUrl,
      );
    }
    case "IN_PROGRESS":
      return withFooter(
        [
          `**◆ 공방 ${label} 작업이 시작되었습니다.**`,
          target,
          ...(input.readyAt
            ? [`수령 예정: ${formatKstDateTime(input.readyAt)} KST`]
            : input.durationMinutes !== undefined
              ? [`예상 작업 시간: ${formatDuration(input.durationMinutes)}`]
              : []),
          "작업 완료 시 수령 가능 통지를 다시 보내드리겠습니다.",
        ],
        workshopUrl,
      );
    case "READY":
      return withFooter(
        [
          `**◆ 공방 ${label} 작업이 완료되었습니다.**`,
          target,
          "결과 장비를 수령할 수 있습니다. 공방 문서함에서 수령 절차를 완료하십시오.",
        ],
        workshopUrl,
      );
    case "DECLINED":
      return withFooter(
        [
          `**■ 공방 ${label} 견적 거절이 접수되었습니다.**`,
          target,
          "해당 견적은 폐기되었으며 비용과 재료는 차감되지 않습니다.",
        ],
        workshopUrl,
      );
    case "REJECTED":
      return withFooter(
        [
          `**■ 공방 ${label} 요청이 반려되었습니다.**`,
          target,
          ...(note ? [`반려 사유: ${note}`] : []),
          "문서함에서 반려 내용을 확인하십시오.",
        ],
        workshopUrl,
      );
    case "CANCELLED":
      return withFooter(
        [
          `**■ 공방 ${label} 작업이 취소되었습니다.**`,
          target,
          ...(note ? [`취소 사유: ${note}`] : []),
          "예치된 비용과 물품은 반환 처리되었습니다.",
        ],
        workshopUrl,
      );
    case "COMPLETED":
      return withFooter(
        input.kind === "reload"
          ? [
              "**◆ 공방 재장전 결재가 완료되었습니다.**",
              target,
              "장비 액션 충전 상태가 복구되었습니다.",
            ]
          : [
              `**◆ 공방 ${label} 결과 수령이 완료되었습니다.**`,
              target,
              "결과 장비가 자산 대장에 반영되었습니다.",
            ],
        workshopUrl,
      );
  }
}

export async function notifyEquipmentWorkshopDiscordDm(
  input: EquipmentWorkshopDiscordDmInput,
  dependencies: EquipmentWorkshopDiscordDmDependencies = {},
): Promise<EquipmentWorkshopDiscordDmResult> {
  const botToken =
    dependencies.botToken === undefined
      ? process.env.AMERI_DISCORD_BOT_TOKEN
      : dependencies.botToken;
  const normalizedBotToken = botToken?.trim();
  if (!normalizedBotToken) return "skipped_unconfigured";

  const resolution = await (
    dependencies.resolveRecipients ?? resolveDiscordDmRecipients
  )(
    input.userId,
    { mirror: JTEST_DISCORD_DM_MIRROR_RULE },
  );
  if (resolution.sourceState === "inactive") {
    return "skipped_inactive";
  }
  if (resolution.recipients.length === 0) return "skipped_unlinked";

  const content = buildEquipmentWorkshopDiscordDmContent(
    input,
    dependencies.siteBaseUrl,
  );
  const send = dependencies.sendDirectMessage ?? sendDiscordDirectMessage;
  const errors: unknown[] = [];
  let sentCount = 0;
  for (const recipient of resolution.recipients) {
    try {
      await send(
        {
          recipientId: recipient.discordId,
          content,
          nonce: buildNonce(input, recipient.kind),
        },
        { botToken: normalizedBotToken },
      );
      sentCount += 1;
    } catch (error) {
      errors.push(error);
    }
  }

  const retryableError = errors.find(
    (error) =>
      !(
        error instanceof Error &&
        /Discord .* 실패 \(403\)/.test(error.message)
      ),
  );
  if (retryableError) throw retryableError;
  if (sentCount > 0) return "sent";
  if (errors.length > 0) throw errors[0];
  return "sent";
}
