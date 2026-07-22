import {
  pruneDiscordWebhookMessages,
  type DiscordWebhookHistoryMessage,
  type DiscordWebhookPruneResult,
} from "@/lib/discord/webhook-message-pruner";

function embedTitles(message: DiscordWebhookHistoryMessage): string[] {
  return (message.embeds ?? [])
    .map((embed) => embed.title)
    .filter((title): title is string => typeof title === "string");
}

export function isDailyShopRestockMessage(
  message: DiscordWebhookHistoryMessage,
): boolean {
  return embedTitles(message).includes("편의점 입고 알림");
}

const SCHEDULED_STOCK_TITLES = new Set([
  "종목별 마감 장부",
  "상승 마감 장부",
  "하락 마감 장부",
  "보합 및 감시실 특이사항",
  "🟢 상승 마감 장부",
  "🔴 하락 마감 장부",
  "🟡 보합 및 감시실 특이사항",
]);

export function isScheduledStockMarketWireMessage(
  message: DiscordWebhookHistoryMessage,
): boolean {
  return (message.embeds ?? []).some((embed) => {
    const title = embed.title ?? "";
    const description = embed.description ?? "";
    const footer = embed.footer?.text ?? "";
    const knownTitle =
      title === "재무기구 정기 시세 공시" ||
      title.startsWith("재무기구 정기 시세 공시 · ") ||
      SCHEDULED_STOCK_TITLES.has(title);
    const automaticMarker =
      description.includes("ORDO-NET MARKET WIRE") ||
      description.includes("가격은 ORDO-NET 거래소 기준") ||
      footer.includes("자동 공시") ||
      footer.includes("상승 장부") ||
      footer.includes("하락 장부") ||
      footer.includes("시장감시실");
    return knownTitle && automaticMarker;
  });
}

export function isEquipmentResearchCardMessage(
  message: DiscordWebhookHistoryMessage,
  projectKey: string,
): boolean {
  const legacyTitles = new Set([
    "팀 연구 기여",
    "팀 연구 시작",
    "팀 연구 가속",
    "팀 연구 자동 적용",
  ]);
  return (message.embeds ?? []).some((embed) => {
    const title = embed.title ?? "";
    if (title.startsWith(`팀 연구 · ${projectKey} —`)) return true;
    return (
      legacyTitles.has(title) &&
      (embed.fields ?? []).some(
        (field) => field.name === "연구" && field.value === projectKey,
      )
    );
  });
}

export async function cleanupDailyShopRestockHistory(
  keepMessageIds: readonly string[],
): Promise<DiscordWebhookPruneResult> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_SHOP_URL;
  if (!webhookUrl) {
    throw new Error("DISCORD_WEBHOOK_SHOP_URL이 설정되지 않았습니다.");
  }
  return pruneDiscordWebhookMessages({
    webhookUrl,
    keepMessageIds,
    matches: isDailyShopRestockMessage,
  });
}

export async function cleanupScheduledStockMarketWireHistory(
  keepMessageIds: readonly string[],
): Promise<DiscordWebhookPruneResult> {
  const webhookUrl =
    process.env.DISCORD_WEBHOOK_STOCK_URL ??
    process.env.DISCORD_STOCK_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new Error("DISCORD_WEBHOOK_STOCK_URL이 설정되지 않았습니다.");
  }
  return pruneDiscordWebhookMessages({
    webhookUrl,
    keepMessageIds,
    matches: isScheduledStockMarketWireMessage,
  });
}

export async function cleanupEquipmentResearchCardHistory(
  projectKey: string,
  keepMessageId: string,
): Promise<DiscordWebhookPruneResult> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_RESEARCH_URL;
  if (!webhookUrl) {
    throw new Error("DISCORD_WEBHOOK_RESEARCH_URL이 설정되지 않았습니다.");
  }
  return pruneDiscordWebhookMessages({
    webhookUrl,
    keepMessageIds: [keepMessageId],
    matches: (message) =>
      isEquipmentResearchCardMessage(message, projectKey),
  });
}
