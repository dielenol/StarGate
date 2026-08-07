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
  createYoutubeAudioResource,
  type AudioResourceRequestOptions,
  type ManagedAudioResource,
} from "./audio-source.js";
import { MusicPanel } from "./music-panel.js";
import {
  MusicOperationAbortedError,
  MusicUserError,
  isMusicOperationAbortedError,
  type AudioQualityMode,
  type MusicTrack,
} from "./types.js";
import {
  inspectMusicRuntime,
  resolveYoutubeTrack,
  YoutubeSourceError,
  type MusicRuntimeInfo,
  type YoutubeResolveOptions,
  type YoutubeTrackMetadata,
} from "./youtube-source.js";

const MAX_QUEUED_TRACKS = 100;
const IDLE_DISCONNECT_MS = 5 * 60_000;
const EMPTY_CHANNEL_DISCONNECT_MS = 30_000;
const VOICE_READY_TIMEOUT_MS = 30_000;
const MAX_CONCURRENT_RESOLUTIONS_PER_GUILD = 2;

export interface QueueSnapshot {
  current: MusicTrack | null;
  currentQualityMode: AudioQualityMode | null;
  upcoming: readonly MusicTrack[];
  paused: boolean;
}

export interface EnqueueResult {
  track: MusicTrack;
  startedImmediately: boolean;
  queuePosition: number;
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

type SessionConnector = (
  channel: VoiceBasedChannel,
  panel: MusicPanel,
  onDestroyed: (session: GuildMusicSession, notice: string) => void,
) => Promise<GuildMusicSession>;

interface PendingMusicSession {
  voiceChannelId: string;
  promise: Promise<GuildMusicSession>;
}

interface TrackRequestReservation {
  signal: AbortSignal;
  finishResolution(): void;
  release(): void;
}

export interface MusicServiceDependencies {
  panel: MusicPanel;
  resolveTrack: TrackResolver;
  inspectRuntime: () => Promise<MusicRuntimeInfo>;
  connectSession: SessionConnector;
  maxConcurrentResolutionsPerGuild: number;
}

type AudioResourceFactory = (
  track: MusicTrack,
  options?: AudioResourceRequestOptions,
) => Promise<ManagedAudioResource>;

export interface GuildMusicSessionDependencies {
  createAudioResource: AudioResourceFactory;
  idleDisconnectMs: number;
  emptyChannelDisconnectMs: number;
}

const DEFAULT_SESSION_DEPENDENCIES: GuildMusicSessionDependencies = {
  createAudioResource: createYoutubeAudioResource,
  idleDisconnectMs: IDLE_DISCONNECT_MS,
  emptyChannelDisconnectMs: EMPTY_CHANNEL_DISCONNECT_MS,
};

function createMusicAudioPlayer(): AudioPlayer {
  return createAudioPlayer({
    behaviors: {
      noSubscriber: NoSubscriberBehavior.Pause,
    },
  });
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
      if (
        oldState.status !== AudioPlayerStatus.Idle &&
        newState.status === AudioPlayerStatus.Idle &&
        this.current
      ) {
        this.finishCurrent();
      } else if (this.current && oldState.status !== newState.status) {
        this.syncPanel();
      }
    });
    this.player.on("error", (error) => {
      const failedTrack = this.current;
      console.error(
        `[music] 오디오 플레이어 오류 guild=${this.guildId} track=${failedTrack?.videoId ?? "none"}:`,
        error,
      );
      if (failedTrack) {
        this.recentError = "오디오 스트림이 중단되어 다음 곡으로 넘어갔습니다.";
        this.finishCurrent(false);
      }
    });
    this.connection.on("stateChange", (_oldState, newState) => {
      if (newState.status === VoiceConnectionStatus.Disconnected) {
        void this.recoverConnection();
      } else if (newState.status === VoiceConnectionStatus.Destroyed) {
        this.dispose(false, "음성 연결이 종료되었습니다.");
      }
    });
    this.syncPanel();
  }

  static async connect(
    channel: VoiceBasedChannel,
    panel: MusicPanel,
    onDestroyed: (session: GuildMusicSession, notice: string) => void,
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
      throw new MusicUserError(
        "음성 채널에 연결하지 못했습니다. 봇의 연결·말하기 권한을 확인해 주세요.",
        { cause: error },
      );
    }

    return new GuildMusicSession(
      channel.guild.id,
      channel.id,
      connection,
      panel,
      onDestroyed,
    );
  }

  get totalTrackCount(): number {
    return this.queue.length + (this.current ? 1 : 0);
  }

  assertCanAcceptTrack(): void {
    if (this.totalTrackCount >= MAX_QUEUED_TRACKS) {
      throw new MusicUserError(
        `대기열은 최대 ${MAX_QUEUED_TRACKS}곡까지 추가할 수 있습니다.`,
      );
    }
  }

  enqueue(track: MusicTrack): EnqueueResult {
    if (this.destroyed) {
      throw new MusicUserError("음성 연결이 종료되었습니다. 다시 시도해 주세요.");
    }
    this.assertCanAcceptTrack();
    this.clearIdleTimer();
    this.recentError = null;
    const startedImmediately = this.current === null && this.queue.length === 0;
    this.queue.push(track);
    const queuePosition = startedImmediately
      ? 0
      : this.queue.length - (this.current ? 0 : 1);
    this.syncPanel();
    this.queueStart();
    return { track, startedImmediately, queuePosition };
  }

  snapshot(): QueueSnapshot {
    return {
      current: this.current,
      currentQualityMode: this.currentQualityMode,
      upcoming: [...this.queue],
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

  skip(): MusicTrack | null {
    const skipped = this.current;
    if (!skipped) return null;
    this.playbackToken += 1;
    this.current = null;
    this.currentQualityMode = null;
    this.recentError = null;
    this.disposeActiveResource();
    this.player.stop(true);
    this.syncPanel();
    this.queueStart();
    return skipped;
  }

  stop(): number {
    const removed = this.totalTrackCount;
    this.playbackToken += 1;
    this.queue.length = 0;
    this.current = null;
    this.currentQualityMode = null;
    this.recentError = null;
    this.disposeActiveResource();
    this.player.stop(true);
    this.syncPanel("재생과 대기열을 정리했습니다. 새 요청을 기다리고 있습니다.");
    this.scheduleIdleDisconnect();
    return removed;
  }

  disconnect(notice = "재생을 종료하고 음성 채널에서 나갔습니다."): void {
    this.dispose(true, notice);
  }

  handleVoiceMembershipChanged(channel: VoiceBasedChannel): void {
    const listenerCount = channel.members.filter((member) => !member.user.bot).size;
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
    this.current = next;
    this.currentQualityMode = null;
    this.clearIdleTimer();
    this.syncPanel();

    const resourceController = new AbortController();
    this.resourceAbortController = resourceController;
    try {
      const managed = await this.dependencies.createAudioResource(next, {
        signal: resourceController.signal,
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
      if (this.playbackToken === token && this.current === next) {
        this.current = null;
        this.currentQualityMode = null;
        this.recentError =
          error instanceof YoutubeSourceError
            ? error.message
            : "오디오 스트림을 준비하지 못했습니다.";
        this.syncPanel();
        this.queueStart();
      }
    }
  }

  private finishCurrent(clearRecentError = true): void {
    if (!this.current) return;
    this.playbackToken += 1;
    this.current = null;
    this.currentQualityMode = null;
    if (clearRecentError) this.recentError = null;
    this.disposeActiveResource();
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
      } catch {
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
    this.destroyed = true;
    this.playbackToken += 1;
    this.queue.length = 0;
    this.current = null;
    this.currentQualityMode = null;
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
      paused:
        this.player.state.status === AudioPlayerStatus.Paused ||
        this.player.state.status === AudioPlayerStatus.AutoPaused,
      recentError: this.recentError,
      notice,
    });
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
  private readonly panel: MusicPanel;
  private readonly resolveTrack: TrackResolver;
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
    this.panel =
      dependencies.panel ?? new MusicPanel(client, guildId, musicChannelId);
    this.resolveTrack = dependencies.resolveTrack ?? resolveYoutubeTrack;
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
      throw error;
    }
  }

  getRuntimeInfo(): MusicRuntimeInfo | null {
    return this.runtimeInfo;
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

  skip(guildId: string, voiceChannelId: string): MusicTrack | null {
    const session = this.requireSession(guildId, voiceChannelId);
    return session.skip();
  }

  stop(guildId: string, voiceChannelId: string): number {
    const session = this.requireSession(guildId, voiceChannelId);
    const cancelledRequests = this.cancelPendingTrackRequests(guildId);
    return session.stop() + cancelledRequests;
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
    );
    this.pendingSessions.set(guild.id, {
      voiceChannelId: channel.id,
      promise: connectionPromise,
    });
    try {
      const session = await connectionPromise;
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
    const finishResolution = (): void => {
      if (!resolving) return;
      resolving = false;
      this.decrementCounter(this.activeResolutions, guildId);
    };
    const release = (): void => {
      if (released) return;
      released = true;
      finishResolution();
      this.decrementCounter(this.reservedTrackSlots, guildId);
      controllers.delete(controller);
      if (controllers.size === 0) {
        this.pendingRequestControllers.delete(guildId);
      }
      if (!this.reservedTrackSlots.has(guildId)) {
        this.reservedVoiceChannelIds.delete(guildId);
      }
    };
    return { signal: controller.signal, finishResolution, release };
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

  private decrementCounter(map: Map<string, number>, guildId: string): void {
    const next = (map.get(guildId) ?? 1) - 1;
    if (next <= 0) map.delete(guildId);
    else map.set(guildId, next);
  }
}
