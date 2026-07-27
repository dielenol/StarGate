import type { WorkerConsumerName } from "../config.js";
import { AmeriDmConsumer } from "./ameri-dm.js";
import { DiscordDesiredStateConsumer } from "./discord-desired-state.js";
import type { DueWorkConsumerPort } from "./port.js";
import { ResearchCardConsumer } from "./research-card.js";

export class DomainConsumerConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainConsumerConfigurationError";
  }
}

function required(
  env: NodeJS.ProcessEnv,
  name: string,
  consumer: WorkerConsumerName,
): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new DomainConsumerConfigurationError(
      `${consumer} consumer에 ${name} 환경변수가 필요합니다.`,
    );
  }
  return value;
}

function webhook(
  env: NodeJS.ProcessEnv,
  names: readonly string[],
  consumer: WorkerConsumerName,
): string {
  const value = names
    .map((name) => env[name]?.trim())
    .find((candidate): candidate is string => Boolean(candidate));
  if (!value) {
    throw new DomainConsumerConfigurationError(
      `${consumer} consumer에 ${names.join(" 또는 ")} 환경변수가 필요합니다.`,
    );
  }
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new DomainConsumerConfigurationError(
      `${consumer} webhook은 http(s) URL이어야 합니다.`,
    );
  }
  return value;
}

export function createDefaultDomainConsumers(
  names: readonly WorkerConsumerName[],
  env: NodeJS.ProcessEnv = process.env,
): DueWorkConsumerPort[] {
  return names.map((name) => {
    switch (name) {
      case "ameri-dm":
        return new AmeriDmConsumer({
          botToken: required(env, "AMERI_DISCORD_BOT_TOKEN", name),
          siteBaseUrl:
            env.NEXT_PUBLIC_SITE_URL?.trim() ||
            env.SITE_BASE_URL?.trim(),
        });
      case "research-card":
        return new ResearchCardConsumer({
          webhookUrl: webhook(
            env,
            ["DISCORD_WEBHOOK_RESEARCH_URL"],
            name,
          ),
          avatarUrl: env.DISCORD_WEBHOOK_RESEARCH_AVATAR_URL?.trim(),
          siteBaseUrl:
            env.NEXT_PUBLIC_SITE_URL?.trim() ||
            env.SITE_BASE_URL?.trim(),
        });
      case "shop-restock":
        return new DiscordDesiredStateConsumer(name, {
          collectionName: "shop_restock_notifications",
          stateId: "daily-shop-restock",
          webhookUrl: webhook(
            env,
            ["DISCORD_WEBHOOK_SHOP_URL"],
            name,
          ),
        });
      case "stock-market-wire":
        return new DiscordDesiredStateConsumer(name, {
          collectionName: "stock_discord_market_wires",
          stateId: "scheduled",
          webhookUrl: webhook(
            env,
            ["DISCORD_WEBHOOK_STOCK_URL", "DISCORD_STOCK_WEBHOOK_URL"],
            name,
          ),
        });
    }
  });
}
