/** 전용 텍스트 채널의 단일 음악 상태판 메시지를 생성·복구·갱신한다. */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
} from "discord.js";

import type { Client, Message, TextChannel } from "discord.js";

import {
  DEFAULT_VOLUME_PERCENT,
  isDefaultVolume,
  MusicRepeatMode,
  type AudioQualityMode,
  type MusicRepeatMode as MusicRepeatModeValue,
  type MusicTrack,
} from "./types.js";

const PANEL_MARKER = "다채봇 음악 상태판";
const PANEL_HISTORY_LIMIT = 25;
const MAX_VISIBLE_QUEUE_TRACKS = 5;
/** 상태판 편집이 일시적으로 실패했을 때 같은 화면을 다시 시도하는 간격 */
const PANEL_RETRY_DELAYS_MS = [5_000, 15_000, 30_000];
/** 재시도해도 같은 결과인 Discord 오류 — Missing Access, Missing Permissions */
const PERMANENT_PANEL_ERROR_CODES = new Set([50_001, 50_013]);

/** 상태판 버튼 customId 접두사 (버전을 올리면 옛 메시지의 버튼은 무시된다) */
export const MUSIC_BUTTON_PREFIX = "trpg:music:v1:";

export const MusicButtonAction = {
  togglePause: "toggle-pause",
  skip: "skip",
  repeat: "repeat",
  shuffle: "shuffle",
} as const;

export type MusicButtonActionValue =
  (typeof MusicButtonAction)[keyof typeof MusicButtonAction];

/** 상태판 버튼 customId 를 동작으로 바꾼다. 다른 버튼이면 null. */
export function parseMusicButtonAction(
  customId: string,
): MusicButtonActionValue | null {
  if (!customId.startsWith(MUSIC_BUTTON_PREFIX)) return null;
  const action = customId.slice(MUSIC_BUTTON_PREFIX.length);
  return (Object.values(MusicButtonAction) as string[]).includes(action)
    ? (action as MusicButtonActionValue)
    : null;
}

/** 반복 버튼을 누를 때마다 끔 → 현재 곡 → 대기열 전체 → 끔 순서로 바꾼다. */
export function nextMusicRepeatMode(
  mode: MusicRepeatModeValue,
): MusicRepeatModeValue {
  if (mode === MusicRepeatMode.off) return MusicRepeatMode.track;
  if (mode === MusicRepeatMode.track) return MusicRepeatMode.queue;
  return MusicRepeatMode.off;
}

export interface MusicPanelView {
  connected: boolean;
  voiceChannelId: string | null;
  current: MusicTrack | null;
  currentQualityMode: AudioQualityMode | null;
  upcoming: readonly MusicTrack[];
  paused: boolean;
  repeatMode: MusicRepeatModeValue;
  volumePercent: number;
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

function repeatModeLabel(mode: MusicRepeatModeValue): string {
  if (mode === MusicRepeatMode.track) return "🔂 현재 곡";
  if (mode === MusicRepeatMode.queue) return "🔁 대기열 전체";
  return "끔";
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
    embed.addFields(
      {
        name: "음성 채널",
        value: `<#${view.voiceChannelId}>`,
        inline: true,
      },
      {
        name: "반복",
        value: repeatModeLabel(view.repeatMode),
        inline: true,
      },
      {
        name: "음량",
        value: isDefaultVolume(view.volumePercent)
          ? `${view.volumePercent}%`
          : `${view.volumePercent}% · FFmpeg 변환`,
        inline: true,
      },
    );
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

function repeatButtonLabel(mode: MusicRepeatModeValue): string {
  if (mode === MusicRepeatMode.track) return "반복: 현재 곡";
  if (mode === MusicRepeatMode.queue) return "반복: 대기열";
  return "반복: 끔";
}

/**
 * 상태판 제어 버튼. 음성 연결이 없으면 버튼을 두지 않는다(빈 배열로 옛 버튼 제거).
 * 오클릭 위험이 큰 초기화·퇴장은 슬래시 명령으로만 제공한다.
 */
export function buildMusicPanelComponents(
  view: MusicPanelView,
): ActionRowBuilder<ButtonBuilder>[] {
  if (!view.connected) return [];
  const hasCurrent = view.current !== null;
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${MUSIC_BUTTON_PREFIX}${MusicButtonAction.togglePause}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(view.paused ? "▶️" : "⏸️")
        .setLabel(view.paused ? "재개" : "일시정지")
        .setDisabled(!hasCurrent),
      new ButtonBuilder()
        .setCustomId(`${MUSIC_BUTTON_PREFIX}${MusicButtonAction.skip}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("⏭️")
        .setLabel("건너뛰기")
        .setDisabled(!hasCurrent),
      new ButtonBuilder()
        .setCustomId(`${MUSIC_BUTTON_PREFIX}${MusicButtonAction.repeat}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🔁")
        .setLabel(repeatButtonLabel(view.repeatMode)),
      new ButtonBuilder()
        .setCustomId(`${MUSIC_BUTTON_PREFIX}${MusicButtonAction.shuffle}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🔀")
        .setLabel("셔플")
        .setDisabled(view.upcoming.length < 2),
    ),
  ];
}

function discordErrorCode(error: unknown): number | null {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "number"
    ? error.code
    : null;
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
    repeatMode: MusicRepeatMode.off,
    volumePercent: DEFAULT_VOLUME_PERCENT,
    recentError: null,
    notice,
  };
}

export class MusicPanel {
  private channel: TextChannel | null = null;
  private message: Message<true> | null = null;
  private pendingView: MusicPanelView | null = null;
  private updateDrain: Promise<void> | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private consecutiveFailures = 0;

  constructor(
    private readonly client: Client,
    private readonly guildId: string,
    readonly channelId: string | undefined,
    private readonly onUpdateError?: (error: unknown) => void | Promise<void>,
    private readonly retryDelaysMs: readonly number[] = PANEL_RETRY_DELAYS_MS,
  ) {}

  async initialize(): Promise<void> {
    await this.upsert(
      idleMusicPanelView(
        "음성 채널에 들어간 뒤 `/음악 재생`으로 YouTube 음악을 요청해 주세요.",
      ),
    );
  }

  update(view: MusicPanelView): void {
    this.pendingView = {
      ...view,
      upcoming: [...view.upcoming],
    };
    this.startUpdateDrain();
  }

  private startUpdateDrain(): void {
    // 재시도 대기 중에는 최신 화면만 pendingView 에 모아 두었다가 타이머가 이어서 보낸다.
    if (this.updateDrain || this.retryTimer) return;
    this.updateDrain = this.drainUpdates()
      .catch((error) => {
        console.error("[music] 상태판 갱신 실패:", error);
        try {
          void Promise.resolve(this.onUpdateError?.(error)).catch(
            (callbackError) => {
              console.error(
                "[music] 상태판 오류 알림 콜백 실패:",
                callbackError,
              );
            },
          );
        } catch (callbackError) {
          console.error("[music] 상태판 오류 알림 콜백 실패:", callbackError);
        }
        this.scheduleRetry(error);
      })
      .finally(() => {
        this.updateDrain = null;
        if (this.pendingView && !this.retryTimer) this.startUpdateDrain();
      });
  }

  /**
   * 일시적 실패(5xx·네트워크)면 실패한 화면을 짧은 백오프 뒤 다시 보낸다 — 상태가
   * 바뀌지 않는 긴 곡 동안 상태판이 "재생 준비 중"에 멈춰 있지 않게 한다. 권한 오류나
   * 재시도 한도를 넘긴 경우는 다음 상태 변화까지 기다린다(뜨거운 재시도 루프 방지).
   */
  private scheduleRetry(error: unknown): void {
    this.consecutiveFailures += 1;
    const code = discordErrorCode(error);
    const permanent =
      error instanceof MusicPanelError ||
      (code !== null && PERMANENT_PANEL_ERROR_CODES.has(code));
    if (permanent || this.consecutiveFailures > this.retryDelaysMs.length) {
      this.consecutiveFailures = 0;
      this.pendingView = null;
      return;
    }
    const delay = this.retryDelaysMs[this.consecutiveFailures - 1];
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.pendingView) this.startUpdateDrain();
    }, delay);
    this.retryTimer.unref();
  }

  private async drainUpdates(): Promise<void> {
    while (this.pendingView) {
      const view = this.pendingView;
      this.pendingView = null;
      try {
        await this.upsert(view);
        this.consecutiveFailures = 0;
      } catch (error) {
        // 편집 중 더 새 화면이 들어오지 않았으면 실패한 화면을 다시 시도 대상으로 남긴다.
        this.pendingView ??= view;
        throw error;
      }
    }
  }

  updateIdle(notice: string | null = null): void {
    this.update(idleMusicPanelView(notice));
  }

  /**
   * 대기 중인 화면을 지금 반영한다. 재시도 백오프 중이면 타이머를 기다리지 않고 바로
   * 한 번 더 시도한다 — 종료·런타임 실패 안내처럼 마지막 화면이 빠지면 안 되는 호출처용.
   */
  async flush(): Promise<void> {
    await this.waitForDrain();
    if (this.retryTimer && this.pendingView) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
      this.startUpdateDrain();
      await this.waitForDrain();
    }
  }

  private async waitForDrain(): Promise<void> {
    while (this.updateDrain) {
      await this.updateDrain;
    }
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
      components: buildMusicPanelComponents(view),
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
