import {
  RESEARCH_RANKING_STATE_COLLECTION,
  RESEARCH_RANKING_STATE_ID,
} from "@stargate/shared-db";

import type { WorkerConsumerName } from "../config.js";
import { AmeriDmConsumer } from "./ameri-dm.js";
import { DiscordDesiredStateConsumer } from "./discord-desired-state.js";
import type { DueWorkConsumerPort } from "./port.js";
import { ResearchCardConsumer } from "./research-card.js";
import { ResearchLabConsumer } from "./research-lab.js";
import {
  HonorAnalysisActivationGateConsumer,
  HonorAnalysisConsumer,
} from "./honor-analysis.js";
import {
  OllamaHonorAnalyzer,
  honorAnalysisLeaseMs,
} from "../honor-analysis/ollama.js";
import { SharedDbHonorAnalysisStore } from "../honor-analysis/store.js";

/** 코드 배포와 운영 mutation 활성화를 분리하는 명시적 research-lab gate. */
export class ResearchLabActivationGateConsumer implements DueWorkConsumerPort {
  readonly name = "research-lab";

  async tick() {
    return { observedDue: 0 };
  }
}

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

function honorTimeout(env: NodeJS.ProcessEnv): number {
  const raw = env.HALL_OF_FAME_OLLAMA_TIMEOUT_MS?.trim();
  if (!raw) return 60_000;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 5_000 || value > 180_000) {
    throw new DomainConsumerConfigurationError(
      "honor-analysis consumer의 HALL_OF_FAME_OLLAMA_TIMEOUT_MS는 5000 이상 180000 이하 정수여야 합니다.",
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
      case "research-lab":
        return env.RESEARCH_LAB_WORKER_ENABLED?.trim().toLowerCase() === "true"
          ? new ResearchLabConsumer()
          : new ResearchLabActivationGateConsumer();
      case "research-ranking":
        return new DiscordDesiredStateConsumer(name, {
          collectionName: RESEARCH_RANKING_STATE_COLLECTION,
          stateId: RESEARCH_RANKING_STATE_ID,
          webhookUrl: webhook(
            env,
            ["DISCORD_WEBHOOK_RESEARCH_URL"],
            name,
          ),
          quarantineUnknownCreate: true,
        });
      case "honor-analysis":
        if (
          env.HALL_OF_FAME_V2_WRITES_ENABLED?.trim().toLowerCase() !== "true"
        ) {
          return new HonorAnalysisActivationGateConsumer();
        }
        {
          const timeoutMs = honorTimeout(env);
          return new HonorAnalysisConsumer(
            new OllamaHonorAnalyzer({
              apiKey: required(env, "OLLAMA_API_KEY", name),
              apiUrl: env.HALL_OF_FAME_OLLAMA_API_URL?.trim(),
              proposerModel:
                env.HALL_OF_FAME_PROPOSER_MODEL?.trim(),
              criticModel: env.HALL_OF_FAME_CRITIC_MODEL?.trim(),
              timeoutMs,
            }),
            new SharedDbHonorAnalysisStore({
              leaseMs: honorAnalysisLeaseMs(timeoutMs),
            }),
          );
        }
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
            ["DISCORD_WEBHOOK_STOCK_URL"],
            name,
          ),
        });
    }
  });
}
