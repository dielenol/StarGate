import { createHash } from "node:crypto";

import type { EquipmentWorkshopSpecialist } from "@/lib/equipment-shop/workshop-request";
import { findUserById } from "@/lib/db/users";
import {
  sendDiscordDirectMessage,
  type DiscordDirectMessageInput,
  type DiscordDirectMessageOptions,
  type DiscordDirectMessageResult,
} from "@/lib/discord/direct-message";

export interface EquipmentWorkshopQuoteDiscordDmInput {
  requestId: string;
  quoteVersion: number;
  userId: string;
  kind: "upgrade" | "custom";
  characterCodename: string;
  resultName: string;
  totalCost: number;
  durationMinutes: number;
  specialistWorkflow: readonly {
    specialistCodename: EquipmentWorkshopSpecialist;
    task: string;
  }[];
}

export type EquipmentWorkshopQuoteDiscordDmResult =
  | "sent"
  | "skipped_unconfigured"
  | "skipped_unlinked"
  | "skipped_inactive";

interface EquipmentWorkshopQuoteDiscordDmDependencies {
  botToken?: string | null;
  siteBaseUrl?: string;
  findUser?: typeof findUserById;
  sendDirectMessage?: (
    input: DiscordDirectMessageInput,
    options?: DiscordDirectMessageOptions,
  ) => Promise<DiscordDirectMessageResult>;
}

const DISCORD_SNOWFLAKE_PATTERN = /^\d{17,20}$/;
const DEFAULT_SITE_BASE_URL = "https://www.ordonet.co.kr";
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
  return `${durationMinutes.toLocaleString()}분`;
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

function buildNonce(requestId: string, quoteVersion: number): string {
  return createHash("sha256")
    .update(`equipment-workshop:${requestId}:quote:${quoteVersion}`)
    .digest("hex")
    .slice(0, 25);
}

export function buildEquipmentWorkshopQuoteDiscordDmContent(
  input: EquipmentWorkshopQuoteDiscordDmInput,
  siteBaseUrl?: string,
): string {
  const kindLabel = input.kind === "upgrade" ? "강화" : "제작";
  const characterCodename = escapeDiscordMarkdown(
    input.characterCodename,
    100,
  );
  const resultName = escapeDiscordMarkdown(input.resultName, 180);
  const specialists = input.specialistWorkflow
    .map((step) => {
      const task = escapeDiscordMarkdown(step.task, 100);
      return task
        ? `${SPECIALIST_LABELS[step.specialistCodename]} · ${task}`
        : SPECIALIST_LABELS[step.specialistCodename];
    })
    .join(" → ");
  const quoteUrl = `${getSiteBaseUrl(siteBaseUrl)}/erp/equipment-shop/custom`;

  return [
    `**공방 ${kindLabel} 견적이 도착했습니다**`,
    `${characterCodename} · ${resultName}`,
    `총 경제 부담: **${input.totalCost.toLocaleString()} CR**`,
    `제작 시간: ${formatDuration(input.durationMinutes)}`,
    `담당: ${specialists}`,
    `견적 확인: ${quoteUrl}`,
  ].join("\n");
}

export async function notifyEquipmentWorkshopQuoteDiscordDm(
  input: EquipmentWorkshopQuoteDiscordDmInput,
  dependencies: EquipmentWorkshopQuoteDiscordDmDependencies = {},
): Promise<EquipmentWorkshopQuoteDiscordDmResult> {
  const botToken =
    dependencies.botToken === undefined
      ? process.env.DISCORD_BOT_TOKEN
      : dependencies.botToken;
  const normalizedBotToken = botToken?.trim();
  if (!normalizedBotToken) return "skipped_unconfigured";

  const user = await (dependencies.findUser ?? findUserById)(input.userId);
  if (!user) return "skipped_unlinked";
  if (user.status !== "ACTIVE") return "skipped_inactive";
  if (
    !user.discordId ||
    !DISCORD_SNOWFLAKE_PATTERN.test(user.discordId)
  ) {
    return "skipped_unlinked";
  }

  await (dependencies.sendDirectMessage ?? sendDiscordDirectMessage)(
    {
      recipientId: user.discordId,
      content: buildEquipmentWorkshopQuoteDiscordDmContent(
        input,
        dependencies.siteBaseUrl,
      ),
      nonce: buildNonce(input.requestId, input.quoteVersion),
    },
    { botToken: normalizedBotToken },
  );
  return "sent";
}
