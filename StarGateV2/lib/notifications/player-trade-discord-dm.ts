import { createHash } from "node:crypto";

import { buildRegistrarTradeDiscordDmContent } from "@stargate/core/domain/discord-dm-dialogue";
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

const DEFAULT_SITE_BASE_URL = "https://www.ordonet.co.kr";
const DISCORD_SNOWFLAKE_PATTERN = /^\d{17,20}$/;

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
  const tradeUrl = `${getSiteBaseUrl(siteBaseUrl)}/erp/trades`;
  return buildRegistrarTradeDiscordDmContent({
    ...input,
    tradeUrl,
  });
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
