import { createHash } from "node:crypto";

import type { PlayerTradeOffer } from "@stargate/shared-db/types";

import { findUserById } from "@/lib/db/users";
import {
  sendDiscordDirectMessage,
  type DiscordDirectMessageInput,
  type DiscordDirectMessageOptions,
  type DiscordDirectMessageResult,
} from "@/lib/discord/direct-message";

export type PlayerTradeDiscordDmEvent =
  | "EXCHANGE_OPENED"
  | "GIFT_RECEIVED"
  | "EXCHANGE_COMPLETED"
  | "EXCHANGE_CANCELLED";

export interface PlayerTradeDiscordDmInput {
  tradeId: string;
  event: PlayerTradeDiscordDmEvent;
  userId: string;
  recipientCodename: string;
  otherCharacterCodename: string;
  offer?: PlayerTradeOffer;
}

export type PlayerTradeDiscordDmResult =
  | "sent"
  | "skipped_unconfigured"
  | "skipped_unlinked"
  | "skipped_inactive";

interface PlayerTradeDiscordDmDependencies {
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
const REGISTRAR_SIGNATURE = "NOVUS ORDO · REGISTRAR";
const DISCORD_MARKDOWN_CHARACTERS = new Set(
  "\\`*_{}[]()#+-.!|>~".split(""),
);

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

function summarizeOffer(offer: PlayerTradeOffer): string {
  const lines: string[] = [];
  if (offer.credits > 0) {
    lines.push(`${offer.credits.toLocaleString("ko-KR")} CR`);
  }
  lines.push(
    ...offer.items.map(
      (item) =>
        `${escapeDiscordMarkdown(item.itemName, 80)} × ${item.quantity.toLocaleString("ko-KR")}`,
    ),
    ...offer.stocks.map(
      (stock) =>
        `${escapeDiscordMarkdown(stock.ticker, 20)} ${stock.shares.toLocaleString("ko-KR")}주`,
    ),
  );
  if (lines.length === 0) return "제시 자산 없음";

  const shown = lines.slice(0, 6);
  const omitted = lines.length - shown.length;
  return `${shown.join(" · ")}${omitted > 0 ? ` · 외 ${omitted}건` : ""}`;
}

function buildNonce(input: PlayerTradeDiscordDmInput): string {
  return createHash("sha256")
    .update(
      `player-trade:${input.tradeId}:${input.event}:${input.userId}`,
    )
    .digest("hex")
    .slice(0, 25);
}

export function buildPlayerTradeDiscordDmContent(
  input: PlayerTradeDiscordDmInput,
  siteBaseUrl?: string,
): string {
  const recipient = escapeDiscordMarkdown(input.recipientCodename, 100);
  const other = escapeDiscordMarkdown(
    input.otherCharacterCodename,
    100,
  );
  const tradeUrl = `${getSiteBaseUrl(siteBaseUrl)}/erp/trades`;

  switch (input.event) {
    case "EXCHANGE_OPENED":
      return [
        "**◆ 자산 교환 요청이 등재되었습니다.**",
        `${recipient}님, ${other} 측에서 교환 절차를 개시했습니다.`,
        `제시 자산: ${summarizeOffer(input.offer ?? { credits: 0, items: [], stocks: [] })}`,
        "거래 대장에서 구성을 검토한 뒤 확정 여부를 회신하십시오.",
        `▶ 거래 대장: ${tradeUrl}`,
        `— ${REGISTRAR_SIGNATURE}`,
      ].join("\n");
    case "GIFT_RECEIVED":
      return [
        "**◆ 자산 전달 기록이 확정되었습니다.**",
        `${recipient}님, ${other} 측에서 다음 자산을 전달했습니다.`,
        `전달 자산: ${summarizeOffer(input.offer ?? { credits: 0, items: [], stocks: [] })}`,
        "별도 회신은 필요하지 않습니다. 대장 반영 내역을 확인하십시오.",
        `▶ 거래 대장: ${tradeUrl}`,
        `— ${REGISTRAR_SIGNATURE}`,
      ].join("\n");
    case "EXCHANGE_COMPLETED":
      return [
        "**◆ 자산 교환 절차가 확정되었습니다.**",
        `${recipient}님, ${other} 측과의 교환은 양측 확정이 일치하여 체결되었습니다.`,
        "이전 제안은 자산 대장에 반영되었습니다. 최종 내역을 확인하십시오.",
        `▶ 거래 대장: ${tradeUrl}`,
        `— ${REGISTRAR_SIGNATURE}`,
      ].join("\n");
    case "EXCHANGE_CANCELLED":
      return [
        "**■ 자산 교환 요청이 기각되었습니다.**",
        `${recipient}님, ${other} 측과 진행하던 교환 절차가 취소되었습니다.`,
        "미확정 제안은 더 이상 유효하지 않습니다.",
        `▶ 거래 대장: ${tradeUrl}`,
        `— ${REGISTRAR_SIGNATURE}`,
      ].join("\n");
  }
}

export async function notifyPlayerTradeDiscordDm(
  input: PlayerTradeDiscordDmInput,
  dependencies: PlayerTradeDiscordDmDependencies = {},
): Promise<PlayerTradeDiscordDmResult> {
  const botToken =
    dependencies.botToken === undefined
      ? process.env.REGISTRAR_DISCORD_BOT_TOKEN
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
      content: buildPlayerTradeDiscordDmContent(
        input,
        dependencies.siteBaseUrl,
      ),
      nonce: buildNonce(input),
    },
    { botToken: normalizedBotToken },
  );
  return "sent";
}

export async function deliverPlayerTradeDiscordDm(
  input: PlayerTradeDiscordDmInput,
): Promise<void> {
  // ERP 알림을 영속 기록으로 유지하고 Discord DM은 거래 응답과 분리해 최선형으로 전달한다.
  try {
    const result = await notifyPlayerTradeDiscordDm(input);
    if (result === "skipped_unconfigured") {
      console.warn(
        "[trades] Registrar Discord DM skipped: REGISTRAR_DISCORD_BOT_TOKEN is not configured",
      );
    }
  } catch (error) {
    console.warn("[trades] Registrar Discord DM failed", error);
  }
}
