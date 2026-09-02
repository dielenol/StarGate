/** 길드별 음성 연결, 재생 대기열과 복구 수명주기를 관리한다. */

import {
  AudioPlayerStatus,
  createAudioPlayer,
  entersState,
  joinVoiceChannel,
  NoSubscriberBehavior,
  VoiceConnectionDisconnectReason,
  VoiceConnectionStatus,
} from "@discordjs/voice";

import type {
  AudioPlayer,
  VoiceConnection,
} from "@discordjs/voice";
import type {
  Client,
  Guild,
  User,
  VoiceBasedChannel,
  VoiceState,
} from "discord.js";

import {
  NOOP_OPERATOR_ALERTS,
  type OperatorAlertEvent,
  type OperatorAlertSink,
} from "../utils/operator-alerts.js";

import {
  createYoutubeAudioResource,
  type AudioResourceRequestOptions,
  type ManagedAudioResource,
} from "./audio-source.js";
import { MusicPanel } from "./music-panel.js";
import {
  MusicRepeatMode,
  MusicOperationAbortedError,
  MusicUserError,
  DEFAULT_VOLUME_PERCENT,
  VOLUME_CLIPPING_THRESHOLD_PERCENT,
  isDefaultVolume,
  isMusicOperationAbortedError,
  normalizeVolumePercent,
  type AudioQualityMode,
  type MusicRepeatMode as MusicRepeatModeValue,
  type MusicTrack,
} from "./types.js";
import {
  MAX_PLAYLIST_TRACKS_PER_REQUEST,
  getPlayerClients,
  getPotProviderBaseUrl,
  inspectMusicRuntime,
  resolveYoutubePlaylist,
  resolveYoutubeTrack,
  YoutubeSourceError,
  type MusicRuntimeInfo,
  type YoutubePlaylistMetadata,
  type YoutubeResolveOptions,
  type YoutubeTrackMetadata,
} from "./youtube-source.js";

const MAX_QUEUED_TRACKS = 100;
const IDLE_DISCONNECT_MS = 5 * 60_000;
const EMPTY_CHANNEL_DISCONNECT_MS = 30_000;
const VOICE_READY_TIMEOUT_MS = 30_000;
const MAX_CONCURRENT_RESOLUTIONS_PER_GUILD = 2;
const PLAYBACK_FAILURE_ALERT_THRESHOLD = 3;
const PLAYBACK_FAILURE_WINDOW_MS = 60 * 60_000;
/** yt-dlp 정수 초 메타데이터와 컨테이너 패딩 차이만 정상 종료로 허용한다. */
const PLAYBACK_END_TOLERANCE_MS = 5_000;

export interface QueueSnapshot {
  current: MusicTrack | null;
  currentQualityMode: AudioQualityMode | null;
  upcoming: readonly MusicTrack[];
  paused: boolean;
  repeatMode: MusicRepeatModeValue;
}

export interface EnqueueResult {
  track: MusicTrack;
  startedImmediately: boolean;
  queuePosition: number;
}

export interface PlaylistEnqueueResult {
  playlistTitle: string;
  addedCount: number;
  omittedCount: number;
  truncated: boolean;
  startedImmediately: boolean;
  firstQueuePosition: number;
}

export interface MusicResetResult {
  removedTracks: number;
  cancelledRequests: number;
}

interface EnqueueRequest {
  guild: Guild;
  voiceChannel: VoiceBasedChannel;
  query: string;
  requestedBy: User;
  requestedByName: string;
}

type TrackResolver = (
  rawInput: string,
  options?: YoutubeResolveOptions,
) => Promise<YoutubeTrackMetadata>;

type PlaylistResolver = (
  rawInput: string,
  options?: YoutubeResolveOptions,
) => Promise<YoutubePlaylistMetadata>;

type SessionConnector = (
  channel: VoiceBasedChannel,
  panel: MusicPanel,
  onDestroyed: (session: GuildMusicSession, notice: string) => void,
  events: GuildMusicSessionEvents,
) => Promise<GuildMusicSession>;

interface PendingMusicSession {
  voiceChannelId: string;
  promise: Promise<GuildMusicSession>;
}

interface TrackRequestReservation {
  signal: AbortSignal;
  finishResolution(): void;
  reserveUpTo(trackCount: number): number;
  release(): void;
}

export interface MusicServiceDependencies {
  panel: MusicPanel;
  operatorAlerts: OperatorAlertSink;
  resolveTrack: TrackResolver;
  resolvePlaylist: PlaylistResolver;
  inspectRuntime: () => Promise<MusicRuntimeInfo>;
  connectSession: SessionConnector;
  maxConcurrentResolutionsPerGuild: number;
}

type AudioResourceFactory = (
  track: MusicTrack,
  options?: AudioResourceRequestOptions,
) => Promise<ManagedAudioResource>;

export type MusicPlaybackFailureStage = "prepare" | "stream" | "transition";

export interface MusicPlaybackSucceededEvent {
  guildId: string;
  voiceChannelId: string;
  track: MusicTrack;
}

export interface MusicPlaybackFailureEvent extends MusicPlaybackSucceededEvent {
  stage: MusicPlaybackFailureStage;
  error: unknown;
}

export interface MusicVoiceConnectionFailureEvent {
  guildId: string;
  voiceChannelId: string;
  reason: string;
  error?: unknown;
}

export interface GuildMusicSessionEvents {
  onPlaybackSucceeded?: (event: MusicPlaybackSucceededEvent) => void;
  onPlaybackFailure?: (event: MusicPlaybackFailureEvent) => void;
  onVoiceConnectionFailure?: (
    event: MusicVoiceConnectionFailureEvent,
  ) => void;
}

export interface GuildMusicSessionDependencies extends GuildMusicSessionEvents {
  createAudioResource: AudioResourceFactory;
  idleDisconnectMs: number;
  emptyChannelDisconnectMs: number;
}

const DEFAULT_SESSION_DEPENDENCIES: GuildMusicSessionDependencies = {
  createAudioResource: createYoutubeAudioResource,
  idleDisconnectMs: IDLE_DISCONNECT_MS,
  emptyChannelDisconnectMs: EMPTY_CHANNEL_DISCONNECT_MS,
};

interface PlaybackFailureState {
  timestamps: number[];
}

function createMusicAudioPlayer(): AudioPlayer {
  return createAudioPlayer({
    behaviors: {
      noSubscriber: NoSubscriberBehavior.Pause,
    },
  });
}

/** `/음악 볼륨` 결과 — 명령 응답 문구를 만들기 위한 정보. */
export interface MusicVolumeChange {
  volumePercent: number;
  previousVolumePercent: number;
  /** 재생 중인 곡을 다시 열어 즉시 반영했는지. */
  appliedToCurrentTrack: boolean;
  /** 이어듣기를 시작한 지점(초). 라이브이거나 즉시 반영이 아니면 null. */
  resumedFromSeconds: number | null;
  track: MusicTrack | null;
}

export class GuildMusicSession {
  private readonly dependencies: GuildMusicSessionDependencies;
  private readonly queue: MusicTrack[] = [];
  private current: MusicTrack | null = null;
  private currentQualityMode: AudioQualityMode | null = null;
  private activeResource: ManagedAudioResource | null = null;
  private resourceAbortController: AbortController | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private emptyChannelTimer: NodeJS.Timeout | null = null;
  private startChain: Promise<void> = Promise.resolve();
  private playbackToken = 0;
  private recentError: string | null = null;
  private repeatMode: MusicRepeatModeValue = MusicRepeatMode.off;
  private forceTranscodeTrack: MusicTrack | null = null;
  private currentUsesForcedTranscode = false;
  private volumePercent = DEFAULT_VOLUME_PERCENT;
  /** 현재 곡을 이어서 다시 열 때 다음 resource에 적용할 재생 위치(초). */
  private pendingSeekSeconds = 0;
  /** 현재 resource가 원본 트랙에서 시작한 재생 위치(초). */
  private currentSeekSeconds = 0;
  private destroyed = false;

  constructor(
    readonly guildId: string,
    readonly voiceChannelId: string,
    private readonly connection: VoiceConnection,
    private readonly panel: MusicPanel,
    private readonly onDestroyed: (
      session: GuildMusicSession,
      notice: string,
    ) => void,
    private readonly player: AudioPlayer = createMusicAudioPlayer(),
    dependencies: Partial<GuildMusicSessionDependencies> = {},
  ) {
    this.dependencies = {
      ...DEFAULT_SESSION_DEPENDENCIES,
      ...dependencies,
    };
    this.connection.subscribe(this.player);

    this.player.on("stateChange", (oldState, newState) => {
      const resourcePlaybackDurationMs =
        oldState.status === AudioPlayerStatus.Idle
          ? 0
          : oldState.resource.playbackDuration;
      const playbackPositionMs = this.currentPlaybackPositionMs(
        resourcePlaybackDurationMs,
      );
      console.info(
        `[music] 플레이어 상태 guild=${this.guildId} track=${this.current?.videoId ?? "none"} ` +
          `${oldState.status}->${newState.status} playbackMs=${playbackPositionMs} ` +
          `resourcePlaybackMs=${resourcePlaybackDurationMs} seekSeconds=${this.currentSeekSeconds} ` +
          `quality=${this.currentQualityMode ?? "preparing"}`,
      );
      if (
        oldState.status !== AudioPlayerStatus.Idle &&
        newState.status === AudioPlayerStatus.Idle &&
        this.current
      ) {
        this.handlePlaybackEnded(playbackPositionMs);
      } else if (this.current && oldState.status !== newState.status) {
        this.syncPanel();
      }
    });
    this.player.on("error", (error) => {
      const failedTrack = this.current;
      const playbackPositionMs = this.currentPlaybackPositionMs(
        this.activeResource?.resource.playbackDuration ?? 0,
      );
      console.error(
        `[music] 오디오 플레이어 오류 guild=${this.guildId} track=${failedTrack?.videoId ?? "none"}:`,
        error,
      );
      if (failedTrack) {
        this.reportPlaybackFailure(failedTrack, "stream", error);
        if (
          this.currentQualityMode === "opus-passthrough" &&
          !this.currentUsesForcedTranscode
        ) {
          this.retryCurrentWithForcedTranscode(
            failedTrack,
            "원본 Opus 스트림 오류로 현재 위치부터 FFmpeg 안정 모드에서 한 번 복구합니다.",
            playbackPositionMs,
          );
          return;
        }
        this.recentError = "오디오 스트림이 중단되어 다음 곡으로 넘어갔습니다.";
        this.finishCurrent(false, false);
      }
    });
    this.connection.on("stateChange", (oldState, newState) => {
      const closeCode =
        newState.status === VoiceConnectionStatus.Disconnected &&
        newState.reason === VoiceConnectionDisconnectReason.WebSocketClose
          ? newState.closeCode
          : "none";
      const disconnectDetail =
        newState.status === VoiceConnectionStatus.Disconnected
          ? ` reason=${newState.reason} closeCode=${closeCode}`
          : "";
      console.info(
        `[music] 음성 연결 상태 guild=${this.guildId} channel=${this.voiceChannelId} ` +
          `${oldState.status}->${newState.status}${disconnectDetail}`,
      );
      if (newState.status === VoiceConnectionStatus.Disconnected) {
        void this.recoverConnection();
      } else if (newState.status === VoiceConnectionStatus.Destroyed) {
        if (!this.destroyed) {
          this.reportVoiceConnectionFailure(
            "외부에서 음성 연결이 종료되었습니다.",
          );
        }
        this.dispose(false, "음성 연결이 종료되었습니다.");
      }
    });
    this.syncPanel();
  }

  static async connect(
    channel: VoiceBasedChannel,
    panel: MusicPanel,
    onDestroyed: (session: GuildMusicSession, notice: string) => void,
    events: GuildMusicSessionEvents = {},
  ): Promise<GuildMusicSession> {
    const connection = joinVoiceChannel({
      adapterCreator: channel.guild.voiceAdapterCreator,
      channelId: channel.id,
      guildId: channel.guild.id,
      selfDeaf: true,
      selfMute: false,
    });

    try {
      await entersState(
        connection,
        VoiceConnectionStatus.Ready,
        VOICE_READY_TIMEOUT_MS,
      );
    } catch (error) {
      if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
        connection.destroy();
      }
      try {
        events.onVoiceConnectionFailure?.({
          guildId: channel.guild.id,
          voiceChannelId: channel.id,
          reason: "음성 채널 최초 연결에 실패했습니다.",
          error,
        });
      } catch (callbackError) {
        console.error("[music] 음성 연결 오류 알림 콜백 실패:", callbackError);
      }
      throw new MusicUserError(
        "음성 채널에 연결하지 못했습니다. 봇의 연결·말하기 권한을 확인해 주세요.",
        { cause: error },
      );
    }
    console.info(
      `[music] 음성 연결 준비 완료 guild=${channel.guild.id} channel=${channel.id}`,
    );

    return new GuildMusicSession(
      channel.guild.id,
      channel.id,
      connection,
      panel,
      onDestroyed,
      undefined,
      events,
    );
  }

  get totalTrackCount(): number {
    return this.queue.length + (this.current ? 1 : 0);
  }

  enqueue(track: MusicTrack): EnqueueResult {
    const result = this.enqueueMany([track]);
    return {
      track,
      startedImmediately: result.startedImmediately,
      queuePosition: result.firstQueuePosition,
    };
  }

  enqueueMany(tracks: readonly MusicTrack[]): {
    startedImmediately: boolean;
    firstQueuePosition: number;
  } {
    if (this.destroyed) {
      throw new MusicUserError("음성 연결이 종료되었습니다. 다시 시도해 주세요.");
    }
    if (tracks.length === 0) {
      throw new MusicUserError("대기열에 추가할 음악이 없습니다.");
    }
    if (this.totalTrackCount + tracks.length > MAX_QUEUED_TRACKS) {
      throw new MusicUserError(
        `대기열은 최대 ${MAX_QUEUED_TRACKS}곡까지 추가할 수 있습니다.`,
      );
    }
    this.clearIdleTimer();
    this.recentError = null;
    const startedImmediately = this.current === null && this.queue.length === 0;
    const firstQueuePosition = startedImmediately
      ? 0
      : this.queue.length + (this.current ? 1 : 0);
    this.queue.push(...tracks);
    this.syncPanel();
    this.queueStart();
    return { startedImmediately, firstQueuePosition };
  }

  snapshot(): QueueSnapshot {
    return {
      current: this.current,
      currentQualityMode: this.currentQualityMode,
      upcoming: [...this.queue],
      repeatMode: this.repeatMode,
      paused:
        this.player.state.status === AudioPlayerStatus.Paused ||
        this.player.state.status === AudioPlayerStatus.AutoPaused,
    };
  }

  pause(): boolean {
    const changed = this.player.pause(true);
    if (changed) this.syncPanel();
    return changed;
  }

  resume(): boolean {
    const changed = this.player.unpause();
    if (changed) this.syncPanel();
    return changed;
  }

  setRepeatMode(mode: MusicRepeatModeValue): MusicRepeatModeValue {
    if (this.destroyed) {
      throw new MusicUserError("음성 연결이 종료되었습니다. 다시 시도해 주세요.");
    }
    this.repeatMode = mode;
    this.syncPanel();
    return mode;
  }

  /**
   * 음량을 바꾸고, 재생 중이면 현재 위치부터 이어서 다시 연다.
   *
   * 무손실 Opus 전달 경로는 음량을 조절할 수 없어 FFmpeg 경로로 갈아타야 하고,
   * 이미 흐르는 스트림에는 필터를 끼울 수 없다. 그래서 같은 곡을 재생 위치부터
   * 다시 여는 방식으로 적용한다. 라이브는 위치 탐색이 불가해 처음부터 다시 연다.
   */
  setVolume(percent: number): MusicVolumeChange {
    if (this.destroyed) {
      throw new MusicUserError("음성 연결이 종료되었습니다. 다시 시도해 주세요.");
    }
    const next = normalizeVolumePercent(percent);
    const previous = this.volumePercent;
    this.volumePercent = next;
    if (previous === next || !this.current) {
      this.syncPanel();
      return {
        volumePercent: next,
        previousVolumePercent: previous,
        appliedToCurrentTrack: false,
        resumedFromSeconds: null,
        track: this.current,
      };
    }

    const track = this.current;
    const playbackPositionMs = this.currentPlaybackPositionMs(
      this.activeResource?.resource.playbackDuration ?? 0,
    );
    const resumeSeconds = track.isLive
      ? 0
      : Math.floor(playbackPositionMs / 1_000);
    this.playbackToken += 1;
    this.current = null;
    this.currentQualityMode = null;
    this.currentUsesForcedTranscode = false;
    this.currentSeekSeconds = 0;
    this.disposeActiveResource();
    // 이전 resource 의 늦은 Idle 전환이 새로 여는 곡을 끝낸 것으로 오인되지 않게
    // 재예약 전에 player 를 확실히 비운다 (조기 종료 재시도 경로와 같은 이유).
    this.player.stop(true);
    this.pendingSeekSeconds = resumeSeconds;
    this.queue.unshift(track);
    this.syncPanel();
    this.queueStart();
    return {
      volumePercent: next,
      previousVolumePercent: previous,
      appliedToCurrentTrack: true,
      resumedFromSeconds: track.isLive ? null : resumeSeconds,
      track,
    };
  }

  getVolume(): number {
    return this.volumePercent;
  }

  skip(): MusicTrack | null {
    const skipped = this.current;
    if (!skipped) return null;
    this.playbackToken += 1;
    this.current = null;
    this.currentQualityMode = null;
    this.currentUsesForcedTranscode = false;
    this.currentSeekSeconds = 0;
    this.pendingSeekSeconds = 0;
    this.recentError = null;
    this.disposeActiveResource();
    this.player.stop(true);
    this.syncPanel();
    this.queueStart();
    return skipped;
  }

  reset(): number {
    const removed = this.totalTrackCount;
    this.playbackToken += 1;
    this.queue.length = 0;
    this.current = null;
    this.currentQualityMode = null;
    this.currentUsesForcedTranscode = false;
    this.forceTranscodeTrack = null;
    this.pendingSeekSeconds = 0;
    this.currentSeekSeconds = 0;
    this.recentError = null;
    this.repeatMode = MusicRepeatMode.off;
    this.disposeActiveResource();
    this.player.stop(true);
    this.syncPanel(
      "현재 곡·예약곡·반복 설정을 초기화했습니다. 새 요청을 기다리고 있습니다.",
    );
    this.scheduleIdleDisconnect();
    return removed;
  }

  disconnect(notice = "재생을 종료하고 음성 채널에서 나갔습니다."): void {
    this.dispose(true, notice);
  }

  handleVoiceMembershipChanged(channel: VoiceBasedChannel): void {
    const listenerCount = channel.members.filter((member) => !member.user.bot).size;
    console.info(
      `[music] 청취자 상태 guild=${this.guildId} channel=${this.voiceChannelId} ` +
        `listeners=${listenerCount}`,
    );
    if (listenerCount > 0) {
      this.clearEmptyChannelTimer();
      return;
    }
    if (this.emptyChannelTimer || this.destroyed) return;
    this.emptyChannelTimer = setTimeout(() => {
      this.emptyChannelTimer = null;
      const refreshed = channel.guild.channels.cache.get(this.voiceChannelId);
      if (
        refreshed?.isVoiceBased() &&
        refreshed.members.filter((member) => !member.user.bot).size === 0
      ) {
        this.dispose(true, "청취자가 없어 음성 채널에서 자동으로 나갔습니다.");
      }
    }, this.dependencies.emptyChannelDisconnectMs);
    this.emptyChannelTimer.unref();
  }

  private queueStart(): void {
    this.startChain = this.startChain
      .then(() => this.startNextIfIdle())
      .catch((error) => {
        console.error(`[music] 다음 곡 시작 실패 guild=${this.guildId}:`, error);
        if (this.current) {
          this.reportPlaybackFailure(this.current, "transition", error);
        }
      });
  }

  private async startNextIfIdle(): Promise<void> {
    if (this.destroyed || this.current !== null) return;
    const next = this.queue.shift();
    if (!next) {
      this.scheduleIdleDisconnect();
      return;
    }

    const token = ++this.playbackToken;
    const forceTranscode = this.forceTranscodeTrack === next;
    if (forceTranscode) this.forceTranscodeTrack = null;
    const seekSeconds = next.isLive ? 0 : this.pendingSeekSeconds;
    this.pendingSeekSeconds = 0;
    this.current = next;
    this.currentQualityMode = null;
    this.currentUsesForcedTranscode = forceTranscode;
    this.currentSeekSeconds = seekSeconds;
    this.clearIdleTimer();
    this.syncPanel();

    const resourceController = new AbortController();
    this.resourceAbortController = resourceController;
    try {
      const managed = await this.dependencies.createAudioResource(next, {
        signal: resourceController.signal,
        forceTranscode,
        volumePercent: this.volumePercent,
        seekSeconds,
      });
      if (
        this.destroyed ||
        this.playbackToken !== token ||
        this.current !== next
      ) {
        if (this.resourceAbortController === resourceController) {
          this.resourceAbortController = null;
        }
        if (!resourceController.signal.aborted) {
          resourceController.abort(new MusicOperationAbortedError());
        }
        managed.dispose();
        return;
      }
      this.activeResource = managed;
      this.currentQualityMode = managed.qualityMode;
      this.player.play(managed.resource);
      this.syncPanel();
    } catch (error) {
      const expectedCancellation =
        isMusicOperationAbortedError(error) &&
        (this.destroyed ||
          this.playbackToken !== token ||
          this.current !== next);
      if (this.resourceAbortController === resourceController) {
        this.resourceAbortController = null;
      }
      if (!resourceController.signal.aborted) {
        resourceController.abort(new MusicOperationAbortedError());
      }
      this.activeResource?.dispose();
      this.activeResource = null;
      if (expectedCancellation) return;
      console.error(
        `[music] 트랙 재생 준비 실패 guild=${this.guildId} track=${next.videoId}:`,
        error,
      );
      this.reportPlaybackFailure(next, "prepare", error);
      if (this.playbackToken === token && this.current === next) {
        this.current = null;
        this.currentQualityMode = null;
        this.currentUsesForcedTranscode = false;
        this.currentSeekSeconds = 0;
        this.recentError =
          error instanceof YoutubeSourceError
            ? error.message
            : "오디오 스트림을 준비하지 못했습니다.";
        this.syncPanel();
        this.queueStart();
      }
    }
  }

  private finishCurrent(
    clearRecentError = true,
    allowRepeat = true,
  ): void {
    if (!this.current) return;
    const finished = this.current;
    if (allowRepeat) this.reportPlaybackSucceeded(finished);
    this.playbackToken += 1;
    this.current = null;
    this.currentQualityMode = null;
    this.currentUsesForcedTranscode = false;
    this.currentSeekSeconds = 0;
    this.pendingSeekSeconds = 0;
    if (clearRecentError) this.recentError = null;
    if (allowRepeat && this.repeatMode === MusicRepeatMode.track) {
      this.queue.unshift(finished);
    } else if (allowRepeat && this.repeatMode === MusicRepeatMode.queue) {
      this.queue.push(finished);
    }
    this.disposeActiveResource();
    this.player.stop(true);
    this.syncPanel();
    this.queueStart();
  }

  private currentPlaybackPositionMs(resourcePlaybackDurationMs: number): number {
    const safeResourcePlaybackMs = Number.isFinite(resourcePlaybackDurationMs)
      ? Math.max(0, resourcePlaybackDurationMs)
      : 0;
    const playbackPositionMs =
      this.currentSeekSeconds * 1_000 + safeResourcePlaybackMs;
    const expectedDurationMs =
      this.current?.durationSeconds === null || !this.current
        ? null
        : this.current.durationSeconds * 1_000;
    return expectedDurationMs === null
      ? playbackPositionMs
      : Math.min(playbackPositionMs, expectedDurationMs);
  }

  private handlePlaybackEnded(playbackPositionMs: number): void {
    const track = this.current;
    if (!track) return;
    const expectedDurationMs =
      track.durationSeconds === null ? null : track.durationSeconds * 1_000;
    const endedPrematurely =
      !track.isLive &&
      expectedDurationMs !== null &&
      expectedDurationMs - playbackPositionMs >
        PLAYBACK_END_TOLERANCE_MS;
    if (!endedPrematurely) {
      this.finishCurrent();
      return;
    }

    const error = new YoutubeSourceError(
      `YouTube 오디오 스트림이 ${playbackPositionMs}ms 만에 조기 종료되었습니다 ` +
        `(expected=${expectedDurationMs}ms).`,
    );
    console.warn(
      `[music] 스트림 조기 종료 guild=${this.guildId} track=${track.videoId} ` +
        `playbackMs=${playbackPositionMs} expectedMs=${expectedDurationMs} ` +
        `quality=${this.currentQualityMode ?? "unknown"}`,
    );
    this.reportPlaybackFailure(track, "stream", error);

    if (
      this.currentQualityMode === "opus-passthrough" &&
      !this.currentUsesForcedTranscode
    ) {
      this.retryCurrentWithForcedTranscode(
        track,
        "원본 Opus 스트림이 조기 종료되어 현재 위치부터 FFmpeg 안정 모드로 한 번 복구합니다.",
        playbackPositionMs,
      );
      return;
    }

    this.recentError =
      "안정 모드에서도 오디오 스트림이 조기 종료되어 다음 곡으로 넘어갔습니다.";
    this.finishCurrent(false, false);
  }

  private retryCurrentWithForcedTranscode(
    track: MusicTrack,
    recentError: string,
    playbackPositionMs = 0,
  ): void {
    if (this.current !== track || this.destroyed) return;
    const resumeSeconds = track.isLive
      ? 0
      : Math.floor(Math.max(0, playbackPositionMs) / 1_000);
    this.playbackToken += 1;
    this.current = null;
    this.currentQualityMode = null;
    this.currentUsesForcedTranscode = false;
    this.currentSeekSeconds = 0;
    this.recentError = recentError;
    this.disposeActiveResource();
    // 오류 이벤트 직후 늦게 도착하는 이전 resource의 Idle 전환이 재시도 곡을
    // 종료한 것으로 오인되지 않게, 새 곡을 예약하기 전에 player를 확실히 비운다.
    this.player.stop(true);
    this.forceTranscodeTrack = track;
    this.pendingSeekSeconds = resumeSeconds;
    this.queue.unshift(track);
    this.syncPanel();
    this.queueStart();
  }

  private disposeActiveResource(): void {
    const controller = this.resourceAbortController;
    this.resourceAbortController = null;
    if (controller && !controller.signal.aborted) {
      controller.abort(new MusicOperationAbortedError());
    }
    this.activeResource?.dispose();
    this.activeResource = null;
  }

  private async recoverConnection(): Promise<void> {
    if (
      this.destroyed ||
      this.connection.state.status !== VoiceConnectionStatus.Disconnected
    ) {
      return;
    }

    const disconnectedState = this.connection.state;
    if (
      disconnectedState.reason === VoiceConnectionDisconnectReason.WebSocketClose &&
      disconnectedState.closeCode === 4014
    ) {
      try {
        await Promise.race([
          entersState(
            this.connection,
            VoiceConnectionStatus.Connecting,
            5_000,
          ),
          entersState(
            this.connection,
            VoiceConnectionStatus.Signalling,
            5_000,
          ),
        ]);
        return;
      } catch (error) {
        this.reportVoiceConnectionFailure(
          "서버에서 종료한 음성 연결을 복구하지 못했습니다.",
          error,
        );
        this.dispose(true, "서버에서 음성 연결이 종료되어 자동으로 나갔습니다.");
        return;
      }
    }

    if (this.connection.rejoinAttempts < 5) {
      const delayMs = (this.connection.rejoinAttempts + 1) * 5_000;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, delayMs);
        timer.unref();
      });
      if (this.destroyed) return;
      if (this.connection.state.status !== VoiceConnectionStatus.Disconnected) {
        return;
      }
      if (this.connection.rejoin()) return;
    }
    this.reportVoiceConnectionFailure(
      "음성 연결 재시도 한도를 초과했습니다.",
    );
    this.dispose(true, "음성 연결을 복구하지 못해 자동으로 나갔습니다.");
  }

  private scheduleIdleDisconnect(): void {
    if (this.destroyed || this.idleTimer || this.current || this.queue.length > 0) {
      return;
    }
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (!this.current && this.queue.length === 0) {
        this.dispose(true, "대기열이 5분간 비어 있어 자동으로 나갔습니다.");
      }
    }, this.dependencies.idleDisconnectMs);
    this.idleTimer.unref();
  }

  private clearIdleTimer(): void {
    if (!this.idleTimer) return;
    clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private clearEmptyChannelTimer(): void {
    if (!this.emptyChannelTimer) return;
    clearTimeout(this.emptyChannelTimer);
    this.emptyChannelTimer = null;
  }

  private dispose(destroyConnection: boolean, notice: string): void {
    if (this.destroyed) return;
    console.info(
      `[music] 세션 정리 guild=${this.guildId} channel=${this.voiceChannelId} ` +
        `destroyConnection=${destroyConnection} track=${this.current?.videoId ?? "none"} ` +
        `queued=${this.queue.length} reason=${notice}`,
    );
    this.destroyed = true;
    this.playbackToken += 1;
    this.queue.length = 0;
    this.current = null;
    this.currentQualityMode = null;
    this.currentUsesForcedTranscode = false;
    this.forceTranscodeTrack = null;
    this.pendingSeekSeconds = 0;
    this.currentSeekSeconds = 0;
    this.repeatMode = MusicRepeatMode.off;
    this.clearIdleTimer();
    this.clearEmptyChannelTimer();
    this.disposeActiveResource();
    this.player.stop(true);
    if (
      destroyConnection &&
      this.connection.state.status !== VoiceConnectionStatus.Destroyed
    ) {
      this.connection.destroy();
    }
    this.onDestroyed(this, notice);
  }

  private syncPanel(notice: string | null = null): void {
    this.panel.update({
      connected: !this.destroyed,
      voiceChannelId: this.destroyed ? null : this.voiceChannelId,
      current: this.current,
      currentQualityMode: this.currentQualityMode,
      upcoming: this.queue,
      repeatMode: this.repeatMode,
      volumePercent: this.volumePercent,
      paused:
        this.player.state.status === AudioPlayerStatus.Paused ||
        this.player.state.status === AudioPlayerStatus.AutoPaused,
      recentError: this.recentError,
      notice,
    });
  }

  private reportPlaybackSucceeded(track: MusicTrack): void {
    try {
      this.dependencies.onPlaybackSucceeded?.({
        guildId: this.guildId,
        voiceChannelId: this.voiceChannelId,
        track,
      });
    } catch (error) {
      console.error("[music] 재생 완료 알림 콜백 실패:", error);
    }
  }

  private reportPlaybackFailure(
    track: MusicTrack,
    stage: MusicPlaybackFailureStage,
    error: unknown,
  ): void {
    try {
      this.dependencies.onPlaybackFailure?.({
        guildId: this.guildId,
        voiceChannelId: this.voiceChannelId,
        track,
        stage,
        error,
      });
    } catch (callbackError) {
      console.error("[music] 재생 오류 알림 콜백 실패:", callbackError);
    }
  }

  private reportVoiceConnectionFailure(
    reason: string,
    error?: unknown,
  ): void {
    try {
      this.dependencies.onVoiceConnectionFailure?.({
        guildId: this.guildId,
        voiceChannelId: this.voiceChannelId,
        reason,
        error,
      });
    } catch (callbackError) {
      console.error("[music] 음성 연결 오류 알림 콜백 실패:", callbackError);
    }
  }
}

export class MusicService {
  private readonly sessions = new Map<string, GuildMusicSession>();
  private readonly pendingSessions = new Map<string, PendingMusicSession>();
  private readonly reservedTrackSlots = new Map<string, number>();
  private readonly activeResolutions = new Map<string, number>();
  private readonly reservedVoiceChannelIds = new Map<string, string>();
  private readonly pendingRequestControllers = new Map<
    string,
    Set<AbortController>
  >();
  private readonly playbackFailures = new Map<string, PlaybackFailureState>();
  private readonly panel: MusicPanel;
  private readonly operatorAlerts: OperatorAlertSink;
  private readonly resolveTrack: TrackResolver;
  private readonly resolvePlaylist: PlaylistResolver;
  private readonly inspectRuntime: () => Promise<MusicRuntimeInfo>;
  private readonly connectSession: SessionConnector;
  private readonly maxConcurrentResolutionsPerGuild: number;
  private runtimeInfo: MusicRuntimeInfo | null = null;
  private runtimeError: string | null = "음악 재생 런타임을 아직 확인하지 않았습니다.";

  constructor(
    client: Client,
    guildId: string,
    musicChannelId: string | undefined,
    dependencies: Partial<MusicServiceDependencies> = {},
  ) {
    this.operatorAlerts =
      dependencies.operatorAlerts ?? NOOP_OPERATOR_ALERTS;
    this.panel =
      dependencies.panel ??
      new MusicPanel(client, guildId, musicChannelId, (error) =>
        this.notifyOperator({
          key: "music-panel-update",
          title: "음악 상태판 갱신 실패",
          description:
            "음악은 계속 재생될 수 있지만 전용 채널의 상태가 최신으로 표시되지 않을 수 있습니다.",
          error,
          context: { 길드: guildId, 채널: musicChannelId },
        }),
      );
    this.resolveTrack = dependencies.resolveTrack ?? resolveYoutubeTrack;
    this.resolvePlaylist =
      dependencies.resolvePlaylist ?? resolveYoutubePlaylist;
    this.inspectRuntime = dependencies.inspectRuntime ?? inspectMusicRuntime;
    this.connectSession =
      dependencies.connectSession ?? GuildMusicSession.connect;
    const resolutionLimit =
      dependencies.maxConcurrentResolutionsPerGuild ??
      MAX_CONCURRENT_RESOLUTIONS_PER_GUILD;
    this.maxConcurrentResolutionsPerGuild = Math.max(
      1,
      Number.isFinite(resolutionLimit)
        ? Math.floor(resolutionLimit)
        : MAX_CONCURRENT_RESOLUTIONS_PER_GUILD,
    );
  }

  async initialize(): Promise<MusicRuntimeInfo> {
    let panelReady = false;
    try {
      await this.panel.initialize();
      panelReady = true;
      this.runtimeInfo = await this.inspectRuntime();
      this.runtimeError = null;
      return this.runtimeInfo;
    } catch (error) {
      this.runtimeInfo = null;
      this.runtimeError =
        error instanceof Error
          ? error.message
          : "음악 재생 런타임 확인에 실패했습니다.";
      if (panelReady) {
        this.panel.updateIdle(
          "음악 기능을 준비하지 못했습니다. 운영자가 재생 런타임을 확인해야 합니다.",
        );
        await this.panel.flush();
      }
      await this.notifyOperator({
        key: "music-runtime-initialize",
        title: "음악 재생 런타임 준비 실패",
        description:
          "yt-dlp·FFmpeg 또는 음악 상태판을 준비하지 못해 음악 명령이 비활성화되었습니다.",
        error,
      });
      throw error;
    }
  }

  getRuntimeInfo(): MusicRuntimeInfo | null {
    return this.runtimeInfo;
  }

  /** 사용자 입력 오류가 아닌 음악 명령 예외를 운영자에게 알린다. */
  async reportUnexpectedCommandFailure(
    error: unknown,
    context: {
      commandName: string;
      guildId?: string | null;
      channelId?: string | null;
      userId?: string;
    },
  ): Promise<void> {
    await this.notifyOperator({
      key: `music-command-${context.commandName}`,
      title: "음악 명령 처리 실패",
      description:
        "사용자 오류로 분류되지 않은 예외가 발생했습니다. 실행 로그와 Discord 권한을 확인해 주세요.",
      error,
      context: {
        명령: context.commandName,
        길드: context.guildId,
        텍스트채널: context.channelId,
        요청자: context.userId,
      },
    });
  }

  private assertRuntimeReady(): void {
    if (this.runtimeError) throw new MusicUserError(this.runtimeError);
  }

  async resolveAndEnqueue(request: EnqueueRequest): Promise<EnqueueResult> {
    this.assertRuntimeReady();
    const reservation = this.reserveTrackRequest(
      request.guild.id,
      request.voiceChannel.id,
    );
    try {
      let metadata: YoutubeTrackMetadata;
      try {
        metadata = await this.resolveTrack(request.query, {
          signal: reservation.signal,
        });
      } catch (error) {
        if (isMusicOperationAbortedError(error)) {
          throw new MusicUserError("재생 요청이 취소되었습니다.", {
            cause: error,
          });
        }
        if (error instanceof YoutubeSourceError) {
          throw new MusicUserError(error.message, { cause: error });
        }
        throw error;
      } finally {
        reservation.finishResolution();
      }
      this.assertTrackRequestActive(reservation.signal);

      if (
        request.guild.voiceStates.cache.get(request.requestedBy.id)?.channelId !==
        request.voiceChannel.id
      ) {
        throw new MusicUserError(
          "검색 중 음성 채널에서 나갔습니다. 다시 시도해 주세요.",
        );
      }

      const session = await this.getOrCreateSession(
        request.guild,
        request.voiceChannel,
      );
      this.assertTrackRequestActive(reservation.signal);
      const track: MusicTrack = {
        ...metadata,
        requestedById: request.requestedBy.id,
        requestedByName: request.requestedByName,
      };
      return session.enqueue(track);
    } finally {
      reservation.release();
    }
  }

  async resolveAndEnqueuePlaylist(
    request: EnqueueRequest,
  ): Promise<PlaylistEnqueueResult> {
    this.assertRuntimeReady();
    const reservation = this.reserveTrackRequest(
      request.guild.id,
      request.voiceChannel.id,
    );
    try {
      let playlist: YoutubePlaylistMetadata;
      try {
        playlist = await this.resolvePlaylist(request.query, {
          signal: reservation.signal,
        });
      } catch (error) {
        if (isMusicOperationAbortedError(error)) {
          throw new MusicUserError("재생목록 요청이 취소되었습니다.", {
            cause: error,
          });
        }
        if (error instanceof YoutubeSourceError) {
          throw new MusicUserError(error.message, { cause: error });
        }
        throw error;
      } finally {
        reservation.finishResolution();
      }
      this.assertTrackRequestActive(reservation.signal);

      if (
        request.guild.voiceStates.cache.get(request.requestedBy.id)?.channelId !==
        request.voiceChannel.id
      ) {
        throw new MusicUserError(
          "재생목록을 확인하는 동안 음성 채널에서 나갔습니다. 다시 시도해 주세요.",
        );
      }

      const requestTracks = playlist.tracks.slice(
        0,
        MAX_PLAYLIST_TRACKS_PER_REQUEST,
      );
      const acceptedCount = reservation.reserveUpTo(requestTracks.length);
      const selectedTracks = requestTracks.slice(0, acceptedCount).map(
        (metadata): MusicTrack => ({
          ...metadata,
          requestedById: request.requestedBy.id,
          requestedByName: request.requestedByName,
        }),
      );
      const session = await this.getOrCreateSession(
        request.guild,
        request.voiceChannel,
      );
      this.assertTrackRequestActive(reservation.signal);
      const enqueueResult = session.enqueueMany(selectedTracks);
      const sourceTrackCount =
        playlist.sourceTrackCount ?? playlist.tracks.length;
      return {
        playlistTitle: playlist.title,
        addedCount: selectedTracks.length,
        omittedCount: Math.max(0, sourceTrackCount - selectedTracks.length),
        truncated:
          playlist.truncated ||
          playlist.tracks.length > MAX_PLAYLIST_TRACKS_PER_REQUEST,
        ...enqueueResult,
      };
    } finally {
      reservation.release();
    }
  }

  getSnapshot(guildId: string): QueueSnapshot | null {
    return this.sessions.get(guildId)?.snapshot() ?? null;
  }

  pause(guildId: string, voiceChannelId: string): boolean {
    const session = this.requireSession(guildId, voiceChannelId);
    return session.pause();
  }

  resume(guildId: string, voiceChannelId: string): boolean {
    const session = this.requireSession(guildId, voiceChannelId);
    return session.resume();
  }

  setRepeatMode(
    guildId: string,
    voiceChannelId: string,
    mode: MusicRepeatModeValue,
  ): MusicRepeatModeValue {
    const session = this.requireSession(guildId, voiceChannelId);
    return session.setRepeatMode(mode);
  }

  setVolume(
    guildId: string,
    voiceChannelId: string,
    percent: number,
  ): MusicVolumeChange {
    const session = this.requireSession(guildId, voiceChannelId);
    return session.setVolume(percent);
  }

  getVolume(guildId: string, voiceChannelId: string): number {
    const session = this.requireSession(guildId, voiceChannelId);
    return session.getVolume();
  }

  skip(guildId: string, voiceChannelId: string): MusicTrack | null {
    const session = this.requireSession(guildId, voiceChannelId);
    return session.skip();
  }

  async reset(
    guildId: string,
    voiceChannelId: string,
  ): Promise<MusicResetResult> {
    const session = this.sessions.get(guildId);
    const pendingSession = this.pendingSessions.get(guildId);
    const reservedVoiceChannelId = this.reservedVoiceChannelIds.get(guildId);
    const activeVoiceChannelId =
      session?.voiceChannelId ??
      pendingSession?.voiceChannelId ??
      reservedVoiceChannelId;
    if (!activeVoiceChannelId) {
      throw new MusicUserError("현재 초기화할 음악이나 예약 요청이 없습니다.");
    }
    if (activeVoiceChannelId !== voiceChannelId) {
      throw new MusicUserError("봇과 같은 음성 채널에서 명령을 사용해 주세요.");
    }

    const cancelledRequests = this.cancelPendingTrackRequests(guildId);
    if (session) {
      return {
        removedTracks: session.reset(),
        cancelledRequests,
      };
    }

    if (pendingSession) {
      try {
        const connectedSession = await pendingSession.promise;
        return {
          removedTracks: connectedSession.reset(),
          cancelledRequests,
        };
      } catch {
        // 연결 요청 자체가 실패했어도 앞에서 예약 해석 요청은 모두 취소됐다.
      }
    }
    this.panel.updateIdle(
      "현재 곡·예약곡·반복 설정을 초기화했습니다. 새 요청을 기다리고 있습니다.",
    );
    return { removedTracks: 0, cancelledRequests };
  }

  leave(guildId: string, voiceChannelId: string): void {
    const session = this.requireSession(guildId, voiceChannelId);
    this.cancelPendingTrackRequests(guildId);
    session.disconnect();
  }

  handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): void {
    const session = this.sessions.get(oldState.guild.id);
    if (
      !session ||
      (oldState.channelId !== session.voiceChannelId &&
        newState.channelId !== session.voiceChannelId)
    ) {
      return;
    }
    const channel = oldState.guild.channels.cache.get(session.voiceChannelId);
    if (channel?.isVoiceBased()) session.handleVoiceMembershipChanged(channel);
  }

  async destroyAll(): Promise<void> {
    for (const guildId of this.pendingRequestControllers.keys()) {
      this.cancelPendingTrackRequests(guildId);
    }
    for (const session of [...this.sessions.values()]) {
      session.disconnect("봇이 종료되어 음악 재생을 정리했습니다.");
    }
    this.sessions.clear();
    this.playbackFailures.clear();
    await this.panel.flush();
  }

  private async getOrCreateSession(
    guild: Guild,
    channel: VoiceBasedChannel,
  ): Promise<GuildMusicSession> {
    const existing = this.sessions.get(guild.id);
    if (existing) {
      this.assertSameChannel(existing, channel.id);
      return existing;
    }

    const pending = this.pendingSessions.get(guild.id);
    if (pending) {
      if (pending.voiceChannelId !== channel.id) {
        throw new MusicUserError(
          "봇과 같은 음성 채널에서 명령을 사용해 주세요.",
        );
      }
      const session = await pending.promise;
      this.assertSameChannel(session, channel.id);
      return session;
    }

    const connectionPromise = this.connectSession(
      channel,
      this.panel,
      (session, notice) => {
        if (this.sessions.get(session.guildId) === session) {
          this.sessions.delete(session.guildId);
          this.cancelPendingTrackRequests(session.guildId);
          this.panel.updateIdle(notice);
        }
      },
      {
        onPlaybackFailure: (event) => {
          this.recordPlaybackFailure(event);
        },
        onVoiceConnectionFailure: (event) => {
          void this.notifyOperator({
            key: `music-voice-connection-${event.guildId}`,
            title: "음악 음성 연결 실패",
            description: event.reason,
            error: event.error,
            context: {
              길드: event.guildId,
              음성채널: event.voiceChannelId,
            },
          });
        },
      },
    );
    this.pendingSessions.set(guild.id, {
      voiceChannelId: channel.id,
      promise: connectionPromise,
    });
    try {
      let session: GuildMusicSession;
      try {
        session = await connectionPromise;
      } catch (error) {
        await this.notifyOperator({
          key: `music-voice-connection-${guild.id}`,
          title: "음악 음성 연결 실패",
          description:
            "음성 채널에 연결하지 못했습니다. 봇 권한과 Discord 음성 게이트웨이 상태를 확인해 주세요.",
          error,
          context: { 길드: guild.id, 음성채널: channel.id },
        });
        throw error;
      }
      this.sessions.set(guild.id, session);
      // 연결을 만드는 동안 마지막 사용자가 나가 VoiceState 이벤트를 놓친 경우도
      // 여기서 한 번 더 확인해 빈 채널 연결이 계속 남지 않게 한다.
      session.handleVoiceMembershipChanged(channel);
      return session;
    } finally {
      this.pendingSessions.delete(guild.id);
    }
  }

  private requireSession(
    guildId: string,
    voiceChannelId: string,
  ): GuildMusicSession {
    const session = this.sessions.get(guildId);
    if (!session) throw new MusicUserError("현재 재생 중인 음악이 없습니다.");
    this.assertSameChannel(session, voiceChannelId);
    return session;
  }

  private assertSameChannel(
    session: GuildMusicSession,
    voiceChannelId: string,
  ): void {
    if (session.voiceChannelId !== voiceChannelId) {
      throw new MusicUserError("봇과 같은 음성 채널에서 명령을 사용해 주세요.");
    }
  }

  private reserveTrackRequest(
    guildId: string,
    voiceChannelId: string,
  ): TrackRequestReservation {
    const session = this.sessions.get(guildId);
    if (session) this.assertSameChannel(session, voiceChannelId);

    const pendingSession = this.pendingSessions.get(guildId);
    if (
      pendingSession &&
      pendingSession.voiceChannelId !== voiceChannelId
    ) {
      throw new MusicUserError(
        "봇과 같은 음성 채널에서 명령을 사용해 주세요.",
      );
    }

    const reservedVoiceChannelId = this.reservedVoiceChannelIds.get(guildId);
    if (
      reservedVoiceChannelId &&
      reservedVoiceChannelId !== voiceChannelId
    ) {
      throw new MusicUserError(
        "봇과 같은 음성 채널에서 명령을 사용해 주세요.",
      );
    }

    const reservedSlots = this.reservedTrackSlots.get(guildId) ?? 0;
    if ((session?.totalTrackCount ?? 0) + reservedSlots >= MAX_QUEUED_TRACKS) {
      throw new MusicUserError(
        `대기열은 최대 ${MAX_QUEUED_TRACKS}곡까지 추가할 수 있습니다.`,
      );
    }

    const activeResolutions = this.activeResolutions.get(guildId) ?? 0;
    if (activeResolutions >= this.maxConcurrentResolutionsPerGuild) {
      throw new MusicUserError(
        "현재 YouTube 요청을 여러 개 처리 중입니다. 잠시 뒤 다시 시도해 주세요.",
      );
    }

    const controller = new AbortController();
    const controllers =
      this.pendingRequestControllers.get(guildId) ?? new Set<AbortController>();
    controllers.add(controller);
    this.pendingRequestControllers.set(guildId, controllers);
    this.reservedTrackSlots.set(guildId, reservedSlots + 1);
    this.reservedVoiceChannelIds.set(guildId, voiceChannelId);
    this.activeResolutions.set(guildId, activeResolutions + 1);

    let resolving = true;
    let released = false;
    let reservedTrackCount = 1;
    const finishResolution = (): void => {
      if (!resolving) return;
      resolving = false;
      this.decrementCounter(this.activeResolutions, guildId);
    };
    const reserveUpTo = (trackCount: number): number => {
      if (!Number.isInteger(trackCount) || trackCount < 1) {
        throw new MusicUserError("대기열에 추가할 음악이 없습니다.");
      }
      this.assertTrackRequestActive(controller.signal);
      const currentSession = this.sessions.get(guildId);
      const allReservedSlots = this.reservedTrackSlots.get(guildId) ?? 0;
      const otherReservedSlots = Math.max(
        0,
        allReservedSlots - reservedTrackCount,
      );
      const availableForRequest = Math.max(
        0,
        MAX_QUEUED_TRACKS -
          (currentSession?.totalTrackCount ?? 0) -
          otherReservedSlots,
      );
      const acceptedCount = Math.min(trackCount, availableForRequest);
      if (acceptedCount < 1) {
        throw new MusicUserError(
          `대기열은 최대 ${MAX_QUEUED_TRACKS}곡까지 추가할 수 있습니다.`,
        );
      }
      const delta = acceptedCount - reservedTrackCount;
      this.reservedTrackSlots.set(guildId, allReservedSlots + delta);
      reservedTrackCount = acceptedCount;
      return acceptedCount;
    };
    const release = (): void => {
      if (released) return;
      released = true;
      finishResolution();
      this.decrementCounter(
        this.reservedTrackSlots,
        guildId,
        reservedTrackCount,
      );
      controllers.delete(controller);
      if (controllers.size === 0) {
        this.pendingRequestControllers.delete(guildId);
      }
      if (!this.reservedTrackSlots.has(guildId)) {
        this.reservedVoiceChannelIds.delete(guildId);
      }
    };
    return {
      signal: controller.signal,
      finishResolution,
      reserveUpTo,
      release,
    };
  }

  private cancelPendingTrackRequests(guildId: string): number {
    const controllers = this.pendingRequestControllers.get(guildId);
    if (!controllers) return 0;
    let cancelled = 0;
    for (const controller of controllers) {
      if (controller.signal.aborted) continue;
      controller.abort(
        new MusicOperationAbortedError("재생 요청이 취소되었습니다."),
      );
      cancelled += 1;
    }
    return cancelled;
  }

  private assertTrackRequestActive(signal: AbortSignal): void {
    if (!signal.aborted) return;
    throw new MusicUserError("재생 요청이 취소되었습니다.", {
      cause:
        signal.reason instanceof Error
          ? signal.reason
          : new MusicOperationAbortedError(),
    });
  }

  private decrementCounter(
    map: Map<string, number>,
    guildId: string,
    amount = 1,
  ): void {
    const next = (map.get(guildId) ?? amount) - amount;
    if (next <= 0) map.delete(guildId);
    else map.set(guildId, next);
  }

  private recordPlaybackFailure(event: MusicPlaybackFailureEvent): void {
    const now = Date.now();
    const previous = this.playbackFailures.get(event.guildId);
    const next: PlaybackFailureState = {
      timestamps: [...(previous?.timestamps ?? []), now].filter(
        (timestamp) => now - timestamp <= PLAYBACK_FAILURE_WINDOW_MS,
      ),
    };
    this.playbackFailures.set(event.guildId, next);
    if (next.timestamps.length < PLAYBACK_FAILURE_ALERT_THRESHOLD) return;

    void this.notifyOperator({
      key: `music-playback-recurring-${event.guildId}`,
      title: "음악 재생 실패가 반복되고 있습니다",
      description: `최근 1시간 안에 재생 실패가 ${next.timestamps.length}회 발생했습니다. 중간에 복구된 곡도 포함합니다. YouTube 추출 상태와 네트워크·FFmpeg 로그를 확인해 주세요.`,
      error: event.error,
      context: {
        길드: event.guildId,
        음성채널: event.voiceChannelId,
        단계: event.stage,
        영상ID: event.track.videoId,
        곡명: event.track.title,
        // 서버 로그에 접근하지 않고도 원인을 좁힐 수 있게 런타임 구성을 함께 싣는다.
        "yt-dlp": this.runtimeInfo?.ytDlpVersion ?? "unknown",
        playerClient: getPlayerClients(),
        POT: getPotProviderBaseUrl() ?? "미설정",
      },
    });
  }

  private async notifyOperator(event: OperatorAlertEvent): Promise<void> {
    try {
      await this.operatorAlerts.notify(event);
    } catch (error) {
      // 알림 장애가 음악 수명주기를 다시 실패시키거나 재귀 알림을 만들면 안 된다.
      console.error("[music] 운영 알림 처리 실패:", error);
    }
  }
}
