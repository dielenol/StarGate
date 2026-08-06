/** 전용 텍스트 채널의 단일 음악 상태판 메시지를 생성·복구·갱신한다. */

import { ChannelType, EmbedBuilder } from "discord.js";

import type { Client, Message, TextChannel } from "discord.js";

import type { AudioQualityMode, MusicTrack } from "./types.js";

const PANEL_MARKER = "다채봇 음악 상태판";
const PANEL_HISTORY_LIMIT = 25;
const MAX_VISIBLE_QUEUE_TRACKS = 5;

export interface MusicPanelView {
  connected: boolean;
  voiceChannelId: string | null;
  current: MusicTrack | null;
  currentQualityMode: AudioQualityMode | null;
  upcoming: readonly MusicTrack[];
  paused: boolean;
  recentError: string | null;
  notice: string | null;
}

export class MusicPanelError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "MusicPanelError";
  }
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\*_`~|\[\]()])/g, "\\$1");
}

function formatDuration(track: MusicTrack): string {
  if (track.isLive) return "LIVE";
  if (track.durationSeconds === null) return "길이 미상";
  const hours = Math.floor(track.durationSeconds / 3600);
  const minutes = Math.floor((track.durationSeconds % 3600) / 60);
  const seconds = track.durationSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function qualityLabel(mode: AudioQualityMode | null): string {
  if (mode === "opus-passthrough") return "원본 WebM/Opus · 재인코딩 없음";
  if (mode === "opus-transcode") return "48 kHz stereo Opus 128 kbps VBR · 1회 변환";
  return "오디오 소스 준비 중";
}

function statusFor(view: MusicPanelView): {
  color: number;
  title: string;
  description: string;
} {
  if (!view.connected) {
    return {
      color: 0x747f8d,
      title: "⏹️ 재생 대기 중",
      description:
        view.notice ??
        "음성 채널에 들어간 뒤 `/음악 재생`으로 YouTube 음악을 요청해 주세요.",
    };
  }
  if (!view.current) {
    return {
      color: 0x5865f2,
      title: "⏹️ 재생 대기 중",
      description:
        view.notice ?? "음성 채널에는 연결되어 있으며 새 재생 요청을 기다리고 있습니다.",
    };
  }
  if (view.currentQualityMode === null) {
    return {
      color: 0x5865f2,
      title: "⏳ 재생 준비 중",
      description: "YouTube 오디오 소스를 확인하고 있습니다.",
    };
  }
  if (view.paused) {
    return {
      color: 0xfee75c,
      title: "⏸️ 일시정지",
      description: "현재 곡의 재생을 잠시 멈췄습니다.",
    };
  }
  return {
    color: 0x57f287,
    title: "▶️ 현재 재생 중",
    description: "대기열 순서대로 YouTube 오디오를 재생하고 있습니다.",
  };
}

/** 테스트와 실제 전송이 공유하는 상태판 임베드 렌더러. */
export function buildMusicPanelEmbed(view: MusicPanelView): EmbedBuilder {
  const status = statusFor(view);
  const embed = new EmbedBuilder()
    .setColor(status.color)
    .setAuthor({ name: "다채봇 음악 플레이어" })
    .setTitle(status.title)
    .setDescription(status.description)
    .setFooter({ text: `${PANEL_MARKER} · 이 메시지는 자동으로 갱신됩니다` })
    .setTimestamp();

  if (view.voiceChannelId) {
    embed.addFields({
      name: "음성 채널",
      value: `<#${view.voiceChannelId}>`,
      inline: true,
    });
  }

  if (view.current) {
    embed.addFields(
      {
        name: "현재 곡",
        value: `[${escapeMarkdown(truncate(view.current.title, 180))}](${view.current.url})`,
        inline: false,
      },
      {
        name: "길이",
        value: formatDuration(view.current),
        inline: true,
      },
      {
        name: "요청",
        value: escapeMarkdown(truncate(view.current.requestedByName, 100)),
        inline: true,
      },
      {
        name: "음질 경로",
        value: qualityLabel(view.currentQualityMode),
        inline: false,
      },
    );
    if (view.current.thumbnailUrl) embed.setThumbnail(view.current.thumbnailUrl);
  }

  if (view.upcoming.length > 0) {
    const visible = view.upcoming.slice(0, MAX_VISIBLE_QUEUE_TRACKS);
    const lines = visible.map(
      (track, index) =>
        `${index + 1}. ${escapeMarkdown(truncate(track.title, 120))} · ${formatDuration(track)}`,
    );
    const hidden = view.upcoming.length - visible.length;
    if (hidden > 0) lines.push(`… 외 ${hidden}곡`);
    embed.addFields({
      name: `다음 곡 · 총 ${view.upcoming.length}곡`,
      value: truncate(lines.join("\n"), 1_024),
      inline: false,
    });
  }

  if (view.recentError) {
    embed.addFields({
      name: "최근 재생 오류",
      value: truncate(view.recentError, 1_024),
      inline: false,
    });
  }

  return embed;
}

function isPanelMessage(message: Message, botUserId: string): boolean {
  return (
    message.author.id === botUserId &&
    message.embeds.some((embed) => embed.footer?.text.startsWith(PANEL_MARKER))
  );
}

function isUnknownMessageError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 10_008
  );
}

export function idleMusicPanelView(notice: string | null = null): MusicPanelView {
  return {
    connected: false,
    voiceChannelId: null,
    current: null,
    currentQualityMode: null,
    upcoming: [],
    paused: false,
    recentError: null,
    notice,
  };
}

export class MusicPanel {
  private channel: TextChannel | null = null;
  private message: Message<true> | null = null;
  private updateChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly client: Client,
    private readonly guildId: string,
    readonly channelId: string | undefined,
  ) {}

  async initialize(): Promise<void> {
    await this.upsert(
      idleMusicPanelView(
        "음성 채널에 들어간 뒤 `/음악 재생`으로 YouTube 음악을 요청해 주세요.",
      ),
    );
  }

  update(view: MusicPanelView): void {
    const snapshot: MusicPanelView = {
      ...view,
      upcoming: [...view.upcoming],
    };
    this.updateChain = this.updateChain
      .then(() => this.upsert(snapshot))
      .catch((error) => {
        console.error("[music] 상태판 갱신 실패:", error);
      });
  }

  updateIdle(notice: string | null = null): void {
    this.update(idleMusicPanelView(notice));
  }

  async flush(): Promise<void> {
    await this.updateChain;
  }

  private async getChannel(): Promise<TextChannel> {
    if (this.channel) return this.channel;
    if (!this.channelId) {
      throw new MusicPanelError(
        "TRPG_MUSIC_CHANNEL_ID 환경변수가 설정되지 않았습니다.",
      );
    }
    const channel = await this.client.channels.fetch(this.channelId);
    if (
      !channel ||
      channel.type !== ChannelType.GuildText ||
      channel.guildId !== this.guildId
    ) {
      throw new MusicPanelError(
        "TRPG_MUSIC_CHANNEL_ID가 운영 길드의 일반 텍스트 채널을 가리키지 않습니다.",
      );
    }
    this.channel = channel;
    return channel;
  }

  private async upsert(view: MusicPanelView): Promise<void> {
    const payload = {
      embeds: [buildMusicPanelEmbed(view)],
      allowedMentions: { parse: [] as never[] },
    };

    if (this.message) {
      try {
        await this.message.edit(payload);
        return;
      } catch (error) {
        if (!isUnknownMessageError(error)) throw error;
        this.message = null;
      }
    }

    const channel = await this.getChannel();
    const botUserId = this.client.user?.id;
    if (!botUserId) {
      throw new MusicPanelError("Discord 봇 사용자 정보를 확인할 수 없습니다.");
    }
    const recentMessages = await channel.messages.fetch({
      limit: PANEL_HISTORY_LIMIT,
    });
    const recovered = recentMessages.find((message) =>
      isPanelMessage(message, botUserId),
    );
    if (recovered) {
      this.message = recovered;
      await recovered.edit(payload);
      return;
    }
    this.message = await channel.send(payload);
  }
}
