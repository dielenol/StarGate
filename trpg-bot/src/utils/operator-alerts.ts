/** Discord DM과 선택적 로그 채널로 운영 장애를 알린다. */

import { ChannelType, EmbedBuilder } from "discord.js";

import type { Client } from "discord.js";

const DEFAULT_ALERT_COOLDOWN_MS = 10 * 60_000;
const MAX_DESCRIPTION_LENGTH = 1_500;
const MAX_FIELD_VALUE_LENGTH = 1_024;

export type OperatorAlertSeverity = "warning" | "critical";

export interface OperatorAlertEvent {
  /** 같은 장애가 반복될 때 중복 전송을 막는 안정적인 식별자. */
  key: string;
  title: string;
  description: string;
  severity?: OperatorAlertSeverity;
  error?: unknown;
  context?: Readonly<Record<string, string | number | null | undefined>>;
  cooldownMs?: number;
}

export type OperatorAlertDeliveryState = "sent" | "failed" | "disabled";

export interface OperatorAlertDeliveryResult {
  suppressed: boolean;
  dm: OperatorAlertDeliveryState;
  channel: OperatorAlertDeliveryState;
}

export interface OperatorAlertSink {
  notify(event: OperatorAlertEvent): Promise<OperatorAlertDeliveryResult>;
}

interface OperatorAlertOptions {
  guildId: string;
  userId?: string;
  channelId?: string;
  defaultCooldownMs?: number;
}

interface OperatorAlertDependencies {
  now: () => number;
  logError: (message: string) => void;
}

const DEFAULT_DEPENDENCIES: OperatorAlertDependencies = {
  now: Date.now,
  logError: (message) => console.error(message),
};

export const NOOP_OPERATOR_ALERTS: OperatorAlertSink = {
  async notify() {
    return {
      suppressed: false,
      dm: "disabled",
      channel: "disabled",
    };
  },
};

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

/** 토큰·URL·제어문자·스택을 Discord 운영 알림에 그대로 싣지 않는다. */
export function sanitizeOperatorAlertValue(value: unknown): string {
  const source =
    value instanceof Error
      ? `${value.name}: ${value.message}`
      : typeof value === "string"
        ? value
        : String(value);
  return source
    .replace(/\bhttps?:\/\/\S+/giu, "[URL]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\-/]+=*/giu, "Bearer [REDACTED]")
    .replace(
      /\b(token|password|secret|authorization|cookie)\s*[:=]\s*[^\s,;]+/giu,
      "$1=[REDACTED]",
    )
    .replace(/[\u0000-\u001f\u007f]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function buildOperatorAlertEmbed(event: OperatorAlertEvent): EmbedBuilder {
  const severity = event.severity ?? "critical";
  const embed = new EmbedBuilder()
    .setColor(severity === "critical" ? 0xed4245 : 0xfee75c)
    .setAuthor({ name: "다채봇 운영 알림" })
    .setTitle(
      `${severity === "critical" ? "🚨" : "⚠️"} ${truncate(
        sanitizeOperatorAlertValue(event.title),
        240,
      )}`,
    )
    .setDescription(
      truncate(
        sanitizeOperatorAlertValue(event.description),
        MAX_DESCRIPTION_LENGTH,
      ),
    )
    .setFooter({ text: "다채봇 운영 알림 · 동일 장애는 일정 시간 중복 억제" })
    .setTimestamp();

  const contextLines = Object.entries(event.context ?? {})
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 12)
    .map(
      ([label, value]) =>
        `**${truncate(sanitizeOperatorAlertValue(label), 80)}:** ${truncate(
          sanitizeOperatorAlertValue(value),
          220,
        )}`,
    );
  if (contextLines.length > 0) {
    embed.addFields({
      name: "발생 위치",
      value: truncate(contextLines.join("\n"), MAX_FIELD_VALUE_LENGTH),
    });
  }

  if (event.error !== undefined) {
    const errorSummary = sanitizeOperatorAlertValue(event.error);
    if (errorSummary) {
      embed.addFields({
        name: "오류 요약",
        value: truncate(errorSummary, MAX_FIELD_VALUE_LENGTH),
      });
    }
  }
  return embed;
}

/**
 * DM과 채널 로그를 서로 독립적으로 시도한다.
 *
 * 채널 전송은 상태판 편집이 아니라 `channel.send()`로 별도 메시지를 생성한다.
 */
export class OperatorAlertService implements OperatorAlertSink {
  private readonly lastAttempts = new Map<string, number>();
  private readonly dependencies: OperatorAlertDependencies;

  constructor(
    private readonly client: Client,
    private readonly options: OperatorAlertOptions,
    dependencies: Partial<OperatorAlertDependencies> = {},
  ) {
    this.dependencies = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  }

  async notify(
    event: OperatorAlertEvent,
  ): Promise<OperatorAlertDeliveryResult> {
    const hasDmTarget = Boolean(this.options.userId);
    const hasChannelTarget = Boolean(this.options.channelId);
    if (!hasDmTarget && !hasChannelTarget) {
      return {
        suppressed: false,
        dm: "disabled",
        channel: "disabled",
      };
    }

    const now = this.dependencies.now();
    const cooldownMs = Math.max(
      0,
      event.cooldownMs ??
        this.options.defaultCooldownMs ??
        DEFAULT_ALERT_COOLDOWN_MS,
    );
    const lastAttempt = this.lastAttempts.get(event.key);
    if (lastAttempt !== undefined && now - lastAttempt < cooldownMs) {
      return {
        suppressed: true,
        dm: "disabled",
        channel: "disabled",
      };
    }
    // 실제 Discord 요청 전에 기록해 동시에 들어온 같은 장애도 한 건으로 합친다.
    this.lastAttempts.set(event.key, now);

    const payload = {
      embeds: [buildOperatorAlertEmbed(event)],
      allowedMentions: { parse: [] as never[] },
    };
    const [dm, channel] = await Promise.all([
      this.options.userId
        ? this.tryDelivery("DM", () => this.sendDm(this.options.userId!, payload))
        : Promise.resolve<OperatorAlertDeliveryState>("disabled"),
      this.options.channelId
        ? this.tryDelivery("채널", () =>
            this.sendChannel(this.options.channelId!, payload),
          )
        : Promise.resolve<OperatorAlertDeliveryState>("disabled"),
    ]);
    return { suppressed: false, dm, channel };
  }

  private async sendDm(
    userId: string,
    payload: { embeds: EmbedBuilder[]; allowedMentions: { parse: never[] } },
  ): Promise<void> {
    const user = await this.client.users.fetch(userId);
    await user.send(payload);
  }

  private async sendChannel(
    channelId: string,
    payload: { embeds: EmbedBuilder[]; allowedMentions: { parse: never[] } },
  ): Promise<void> {
    const channel = await this.client.channels.fetch(channelId);
    if (
      !channel ||
      channel.type !== ChannelType.GuildText ||
      channel.guildId !== this.options.guildId
    ) {
      throw new Error(
        "TRPG_ALERT_CHANNEL_ID가 운영 길드의 일반 텍스트 채널을 가리키지 않습니다.",
      );
    }
    await channel.send(payload);
  }

  private async tryDelivery(
    route: string,
    send: () => Promise<void>,
  ): Promise<OperatorAlertDeliveryState> {
    try {
      await send();
      return "sent";
    } catch (error) {
      this.dependencies.logError(
        `[operator-alert] ${route} 전송 실패: ${truncate(
          sanitizeOperatorAlertValue(error),
          500,
        )}`,
      );
      return "failed";
    }
  }
}
