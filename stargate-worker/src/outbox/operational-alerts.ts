import type { ConsumerTickResult } from "../consumers/port.js";
import type { WorkerLogger } from "../logger.js";
import { sendDiscordWebhook } from "./discord-client.js";

const DEFAULT_COOLDOWN_MS = 30 * 60_000;

interface IncidentState {
  fingerprint: string;
  lastSentAt: number;
}

export interface OperationalAlertReporter {
  observe(consumer: string, result: ConsumerTickResult): Promise<void>;
}

function payload(input: {
  title: string;
  description: string;
  color: number;
  consumer: string;
}) {
  return {
    username: "StarGate Worker Watch",
    allowed_mentions: { parse: [] as string[] },
    embeds: [
      {
        title: input.title,
        description: input.description,
        color: input.color,
        fields: [{ name: "consumer", value: input.consumer }],
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

export class DiscordOperationalAlertReporter implements OperationalAlertReporter {
  readonly #incidents = new Map<string, IncidentState>();

  constructor(
    private readonly webhookUrl: string,
    private readonly logger: WorkerLogger,
    private readonly options: {
      fetchImpl?: typeof fetch;
      cooldownMs?: number;
      now?: () => number;
    } = {},
  ) {}

  async observe(consumer: string, result: ConsumerTickResult): Promise<void> {
    const alert = result.operationalAlert ?? null;
    const previous = this.#incidents.get(consumer);
    if (!alert) {
      if (!previous) return;
      if (result.operationalRecovery !== true) return;
      await sendDiscordWebhook(
        this.webhookUrl,
        payload({
          title: "✅ Discord 연동 복구",
          description: "직전 감지된 연동 오류가 더 이상 관찰되지 않습니다.",
          color: 0x2fbf71,
          consumer,
        }),
        this.options.fetchImpl,
      );
      this.#incidents.delete(consumer);
      return;
    }

    const now = (this.options.now ?? Date.now)();
    const cooldownMs = this.options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    if (
      previous &&
      previous.fingerprint === alert.fingerprint &&
      now - previous.lastSentAt < cooldownMs
    ) {
      return;
    }
    await sendDiscordWebhook(
      this.webhookUrl,
      payload({
        title:
          alert.severity === "CRITICAL"
            ? "🚨 Discord 연동 장애"
            : "⚠️ Discord 연동 지연",
        description: alert.summary,
        color: alert.severity === "CRITICAL" ? 0xd95f5f : 0xc5a059,
        consumer,
      }),
      this.options.fetchImpl,
    );
    this.#incidents.set(consumer, {
      fingerprint: alert.fingerprint,
      lastSentAt: now,
    });
    this.logger.warn("operational_alert_sent", {
      consumer,
      severity: alert.severity,
    });
  }
}
