import type { ConsumerTickResult } from "../consumers/port.js";
import type { WorkerLogger } from "../logger.js";
import { sendDiscordWebhook } from "./discord-client.js";

const DEFAULT_COOLDOWN_MS = 30 * 60_000;

export interface OperationalIncidentState {
  fingerprint: string;
  severity: "WARNING" | "CRITICAL";
  openedAt: Date;
  lastSentAt: Date;
}

export interface OperationalIncidentStore {
  find(consumer: string): Promise<OperationalIncidentState | null>;
  record(input: {
    consumer: string;
    fingerprint: string;
    severity: "WARNING" | "CRITICAL";
    sentAt: Date;
  }): Promise<void>;
  resolve(input: {
    consumer: string;
    fingerprint: string;
  }): Promise<boolean>;
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
  constructor(
    private readonly webhookUrl: string,
    private readonly logger: WorkerLogger,
    private readonly incidents: OperationalIncidentStore,
    private readonly options: {
      fetchImpl?: typeof fetch;
      cooldownMs?: number;
      now?: () => number;
    } = {},
  ) {}

  async observe(consumer: string, result: ConsumerTickResult): Promise<void> {
    const alert = result.operationalAlert ?? null;
    const previous = await this.incidents.find(consumer);
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
      await this.incidents.resolve({
        consumer,
        fingerprint: previous.fingerprint,
      });
      return;
    }

    const now = (this.options.now ?? Date.now)();
    const cooldownMs = this.options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    if (
      previous &&
      previous.fingerprint === alert.fingerprint &&
      now - previous.lastSentAt.getTime() < cooldownMs
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
    await this.incidents.record({
      consumer,
      fingerprint: alert.fingerprint,
      severity: alert.severity,
      sentAt: new Date(now),
    });
    this.logger.warn("operational_alert_sent", {
      consumer,
      severity: alert.severity,
    });
  }
}
