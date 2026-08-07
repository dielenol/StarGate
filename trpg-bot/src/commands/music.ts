/** `/음악` 한글 서브커맨드의 YouTube 재생·제어 핸들러. */

import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";

import type {
  ChatInputCommandInteraction,
  Guild,
  VoiceBasedChannel,
} from "discord.js";

import { config } from "../config.js";
import {
  MUSIC_PLAYLIST_OPTION,
  MUSIC_QUERY_OPTION,
  MUSIC_REPEAT_MODE_OPTION,
  MusicSubcommand,
  type MusicSubcommandName,
} from "../slash/ko-names.js";
import {
  MusicService,
  type QueueSnapshot,
} from "../music/music-service.js";
import {
  MusicRepeatMode,
  MusicUserError,
  isMusicRepeatMode,
  type MusicRepeatMode as MusicRepeatModeValue,
  type MusicTrack,
} from "../music/types.js";

const MAX_QUEUE_LINES = 10;

function escapeMarkdown(value: string): string {
  return value.replace(/([\\*_`~|\[\]()])/g, "\\$1");
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function formatDuration(track: MusicTrack): string {
  if (track.isLive) return "LIVE";
  if (track.durationSeconds === null) return "?:??";
  const hours = Math.floor(track.durationSeconds / 3600);
  const minutes = Math.floor((track.durationSeconds % 3600) / 60);
  const seconds = track.durationSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function trackLink(track: MusicTrack): string {
  return `[${escapeMarkdown(truncate(track.title, 120))}](${track.url})`;
}

function repeatModeLabel(mode: MusicRepeatModeValue): string {
  if (mode === MusicRepeatMode.track) return "현재 곡";
  if (mode === MusicRepeatMode.queue) return "대기열 전체";
  return "끔";
}

function formatQueue(snapshot: QueueSnapshot): string {
  if (!snapshot.current && snapshot.upcoming.length === 0) {
    return "현재 재생 중인 음악이 없습니다.";
  }
  const lines: string[] = [];
  lines.push(`🔁 **반복:** ${repeatModeLabel(snapshot.repeatMode)}`);
  if (snapshot.current) {
    const state = snapshot.paused ? "⏸️" : "▶️";
    const quality =
      snapshot.currentQualityMode === "opus-passthrough"
        ? "원본 Opus"
        : snapshot.currentQualityMode === "opus-transcode"
          ? "Opus 변환"
          : "준비 중";
    lines.push(
      `${state} **현재:** ${trackLink(snapshot.current)} · ${formatDuration(snapshot.current)} · ${quality}`,
    );
  }
  const visible = snapshot.upcoming.slice(0, MAX_QUEUE_LINES);
  for (const [index, track] of visible.entries()) {
    lines.push(
      `${index + 1}. ${trackLink(track)} · ${formatDuration(track)} · ${escapeMarkdown(track.requestedByName)}`,
    );
  }
  const hidden = snapshot.upcoming.length - visible.length;
  if (hidden > 0) lines.push(`… 외 ${hidden}곡`);
  return truncate(lines.join("\n"), 1_900);
}

async function handlePlaylist(
  interaction: ChatInputCommandInteraction,
  service: MusicService,
  guild: Guild,
): Promise<void> {
  const voiceChannel = await requireUserVoiceChannel(interaction, guild);
  const query = interaction.options.getString(MUSIC_PLAYLIST_OPTION, true);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const result = await service.resolveAndEnqueuePlaylist({
    guild,
    voiceChannel,
    query,
    requestedBy: interaction.user,
    requestedByName: requesterDisplayName(interaction, voiceChannel),
  });

  const lines = [
    `📃 **${escapeMarkdown(truncate(result.playlistTitle, 120))}** 재생목록에서 ${result.addedCount}곡을 추가했습니다.`,
    result.startedImmediately
      ? "첫 곡의 재생을 준비하고 있습니다."
      : `첫 곡은 대기열 ${result.firstQueuePosition}번에 등록됐습니다.`,
  ];
  if (result.omittedCount > 0) {
    lines.push(`요청·대기열 제한 또는 재생 불가 항목 ${result.omittedCount}곡은 제외했습니다.`);
  }
  if (result.truncated) {
    lines.push("한 요청에서는 재생목록 앞부분 최대 50곡까지만 처리합니다.");
  }
  await interaction.editReply({
    content: lines.join("\n"),
    allowedMentions: { parse: [] },
  });
}

async function replyError(
  interaction: ChatInputCommandInteraction,
  message: string,
): Promise<void> {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ content: message, allowedMentions: { parse: [] } });
    return;
  }
  await interaction.reply({
    content: message,
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

function requireGuild(interaction: ChatInputCommandInteraction): Guild {
  if (!interaction.inGuild() || !interaction.guild) {
    throw new MusicUserError("음악 명령은 서버 채널에서만 사용할 수 있습니다.");
  }
  if (interaction.guildId !== config.trpgGuildId) {
    throw new MusicUserError("이 서버에서는 음악 명령을 사용할 수 없습니다.");
  }
  return interaction.guild;
}

function requireMusicCommandChannel(
  interaction: ChatInputCommandInteraction,
): void {
  const channelId = config.trpgMusicChannelId;
  if (!channelId) {
    throw new MusicUserError(
      "음악 전용 채널이 아직 설정되지 않았습니다. 운영자에게 알려 주세요.",
    );
  }
  if (interaction.channelId !== channelId) {
    throw new MusicUserError(
      `음악 명령은 <#${channelId}> 채널에서 사용해 주세요.`,
    );
  }
}

async function requireUserVoiceChannel(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
): Promise<VoiceBasedChannel> {
  const channel = guild.voiceStates.cache.get(interaction.user.id)?.channel;
  if (!channel) {
    throw new MusicUserError("먼저 음성 채널에 들어가 주세요.");
  }
  if (channel.type !== ChannelType.GuildVoice) {
    throw new MusicUserError("일반 음성 채널에서만 음악을 재생할 수 있습니다.");
  }

  const botMember = guild.members.me ?? (await guild.members.fetchMe());
  const permissions = channel.permissionsFor(botMember);
  if (
    !permissions?.has(PermissionFlagsBits.Connect) ||
    !permissions.has(PermissionFlagsBits.Speak)
  ) {
    throw new MusicUserError(
      "이 음성 채널에서 봇의 연결·말하기 권한이 필요합니다.",
    );
  }
  return channel;
}

function requesterDisplayName(
  interaction: ChatInputCommandInteraction,
  channel: VoiceBasedChannel,
): string {
  return (
    channel.members.get(interaction.user.id)?.displayName ??
    interaction.user.globalName ??
    interaction.user.username
  );
}

async function handlePlay(
  interaction: ChatInputCommandInteraction,
  service: MusicService,
  guild: Guild,
): Promise<void> {
  const voiceChannel = await requireUserVoiceChannel(interaction, guild);
  const query = interaction.options.getString(MUSIC_QUERY_OPTION, true);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const result = await service.resolveAndEnqueue({
    guild,
    voiceChannel,
    query,
    requestedBy: interaction.user,
    requestedByName: requesterDisplayName(interaction, voiceChannel),
  });

  const content = result.startedImmediately
    ? `▶️ ${trackLink(result.track)} 재생을 준비합니다.`
    : `➕ ${trackLink(result.track)}을 대기열 ${result.queuePosition}번에 추가했습니다.`;
  await interaction.editReply({ content, allowedMentions: { parse: [] } });
}

async function handleControl(
  interaction: ChatInputCommandInteraction,
  service: MusicService,
  guild: Guild,
  subcommandName: Exclude<
    MusicSubcommandName,
    | typeof MusicSubcommand.play
    | typeof MusicSubcommand.playlist
    | typeof MusicSubcommand.queue
  >,
): Promise<void> {
  const voiceChannel = await requireUserVoiceChannel(interaction, guild);
  if (subcommandName === MusicSubcommand.reset) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }
  let content: string;
  switch (subcommandName) {
    case MusicSubcommand.pause:
      content = service.pause(guild.id, voiceChannel.id)
        ? "⏸️ 재생을 일시정지했습니다."
        : "현재 일시정지할 음악이 없습니다.";
      break;
    case MusicSubcommand.resume:
      content = service.resume(guild.id, voiceChannel.id)
        ? "▶️ 재생을 다시 시작했습니다."
        : "현재 다시 시작할 음악이 없습니다.";
      break;
    case MusicSubcommand.skip: {
      const skipped = service.skip(guild.id, voiceChannel.id);
      content = skipped
        ? `⏭️ ${trackLink(skipped)}을 건너뛰었습니다.`
        : "현재 건너뛸 음악이 없습니다.";
      break;
    }
    case MusicSubcommand.repeat: {
      const mode = interaction.options.getString(
        MUSIC_REPEAT_MODE_OPTION,
        true,
      );
      if (!isMusicRepeatMode(mode)) {
        throw new MusicUserError("올바른 반복 재생 방식을 선택해 주세요.");
      }
      service.setRepeatMode(guild.id, voiceChannel.id, mode);
      content = `🔁 반복 모드를 **${repeatModeLabel(mode)}**으로 설정했습니다.`;
      break;
    }
    case MusicSubcommand.reset: {
      const result = await service.reset(guild.id, voiceChannel.id);
      content = [
        "♻️ 음악 플레이어를 초기화했습니다.",
        `현재 곡·예약곡 ${result.removedTracks}곡 · 처리 중 요청 ${result.cancelledRequests}건 · 반복 설정을 정리했습니다.`,
      ].join("\n");
      break;
    }
    case MusicSubcommand.leave:
      service.leave(guild.id, voiceChannel.id);
      content = "👋 재생을 종료하고 음성 채널에서 나갔습니다.";
      break;
  }
  if (interaction.deferred) {
    await interaction.editReply({
      content,
      allowedMentions: { parse: [] },
    });
  } else {
    await interaction.reply({
      content,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  }
}

export async function handleMusicCommand(
  interaction: ChatInputCommandInteraction,
  service: MusicService,
): Promise<void> {
  try {
    const guild = requireGuild(interaction);
    requireMusicCommandChannel(interaction);
    const subcommandName = interaction.options.getSubcommand(
      true,
    ) as MusicSubcommandName;
    if (subcommandName === MusicSubcommand.play) {
      await handlePlay(interaction, service, guild);
      return;
    }
    if (subcommandName === MusicSubcommand.playlist) {
      await handlePlaylist(interaction, service, guild);
      return;
    }
    if (subcommandName === MusicSubcommand.queue) {
      const snapshot = service.getSnapshot(guild.id);
      await interaction.reply({
        content: snapshot ? formatQueue(snapshot) : "현재 재생 중인 음악이 없습니다.",
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
      return;
    }
    await handleControl(interaction, service, guild, subcommandName);
  } catch (error) {
    if (error instanceof MusicUserError) {
      await replyError(interaction, error.message);
      return;
    }
    console.error(`[music] 명령 처리 실패 command=${interaction.commandName}:`, error);
    void service.reportUnexpectedCommandFailure(error, {
      commandName: interaction.commandName,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user.id,
    });
    await replyError(
      interaction,
      "음악 명령을 처리하는 중 오류가 발생했습니다. 잠시 뒤 다시 시도해 주세요.",
    );
  }
}
