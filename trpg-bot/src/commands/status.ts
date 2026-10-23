/**
 * `/상태` 슬래시 핸들러 — 운영자용 봇 진단
 *
 * 서버 관리(Manage Guild) 권한자에게만 비공개로 보여준다. 프로세스 가동 시간,
 * 게이트웨이·DB 응답, 알림 스케줄러·멤버 동기화·음악 점검의 마지막 실행 결과와
 * 음악 런타임 상태를 한 화면에 모아, 서버 로그 없이도 장애 위치를 좁히게 한다.
 * 실행 기록은 메모리에만 있어 재시작 직후에는 "이력 없음"으로 표시된다.
 *
 * @module commands/status
 */

import { EmbedBuilder, MessageFlags } from "discord.js";

import type { ChatInputCommandInteraction } from "discord.js";
import type { MusicRuntimeInfo } from "../music/youtube-source.js";

import { config } from "../config.js";
import { sanitizeOperatorAlertValue } from "../utils/operator-alerts.js";
import { requireManageGuild } from "../utils/require-manage-guild.js";
import {
  getProcessStartedAt,
  listTaskRuns,
  type TaskRunRecord,
} from "../utils/runtime-status.js";

const STATUS_COLOR_OK = 0x57f287;
const STATUS_COLOR_WARN = 0xfee75c;
const DB_PING_TIMEOUT_MS = 3_000;
const FIELD_VALUE_MAX = 1_024;

/** 작업 이름을 사람이 읽을 이름으로 */
const TASK_LABELS: Record<string, string> = {
  "scheduler:creation": "생성 알림",
  "scheduler:update": "수정 알림",
  "scheduler:cancellation": "취소 알림",
  "scheduler:reminder24h": "24시간 전 리마인드",
  "scheduler:reminder1h": "1시간 전 리마인드",
  "member-sync": "멤버 동기화",
  "music-healthcheck": "음악 자동 점검",
  heartbeat: "생존 신호",
};

export interface StatusDependencies {
  /** 게이트웨이 평균 응답(ms). 측정 전이면 -1 */
  gatewayPingMs: () => number;
  pingDb: () => Promise<void>;
  music: {
    getRuntimeInfo(): MusicRuntimeInfo | null;
    getRuntimeError(): string | null;
    readonly activeSessionCount: number;
  };
  now?: () => number;
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}일 ${hours}시간`;
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  return `${minutes}분`;
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

async function measureDbPing(pingDb: () => Promise<void>, now: () => number): Promise<string> {
  const startedAt = now();
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      pingDb(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${DB_PING_TIMEOUT_MS}ms 초과`)),
          DB_PING_TIMEOUT_MS,
        );
      }),
    ]);
    return `✅ ${now() - startedAt}ms`;
  } catch (error) {
    return `❌ ${truncate(sanitizeOperatorAlertValue(error), 120)}`;
  } finally {
    clearTimeout(timer);
  }
}

function formatTaskLine(name: string, record: TaskRunRecord, now: number): string {
  const label = TASK_LABELS[name] ?? name;
  const ago = formatDuration(now - record.lastRunAt);
  if (record.ok) {
    const processed = record.processed !== null ? ` · ${record.processed}건` : "";
    const detail = record.detail ? ` · ${record.detail}` : "";
    return `✅ ${label} — ${ago} 전${processed}${detail}`;
  }
  const failures =
    record.consecutiveFailures > 1 ? ` (연속 ${record.consecutiveFailures}회)` : "";
  const reason = record.error
    ? ` · ${truncate(sanitizeOperatorAlertValue(record.error), 90)}`
    : "";
  return `❌ ${label} — ${ago} 전 실패${failures}${reason}`;
}

/** 테스트와 실제 응답이 공유하는 진단 임베드. */
export async function buildStatusEmbed(
  dependencies: StatusDependencies,
): Promise<EmbedBuilder> {
  const now = dependencies.now ?? Date.now;
  const current = now();
  const dbPing = await measureDbPing(dependencies.pingDb, now);
  const gatewayPing = dependencies.gatewayPingMs();
  const runs = listTaskRuns();
  const anyFailure = runs.some(([, record]) => !record.ok) || dbPing.startsWith("❌");

  const runtime = dependencies.music.getRuntimeInfo();
  const runtimeError = dependencies.music.getRuntimeError();
  const musicLine = runtime
    ? `✅ yt-dlp ${runtime.ytDlpVersion} · ${runtime.ffmpegVersion} · 연결 ${dependencies.music.activeSessionCount}곳`
    : `❌ ${truncate(sanitizeOperatorAlertValue(runtimeError ?? "준비되지 않음"), 200)}`;

  const taskLines =
    runs.length === 0
      ? "이력 없음 — 재시작 직후이거나 아직 한 번도 실행되지 않았습니다."
      : runs.map(([name, record]) => formatTaskLine(name, record, current)).join("\n");

  const memoryMb = Math.round(process.memoryUsage().rss / 1_048_576);

  return new EmbedBuilder()
    .setColor(anyFailure ? STATUS_COLOR_WARN : STATUS_COLOR_OK)
    .setAuthor({ name: "다채봇 상태" })
    .setTitle(anyFailure ? "⚠️ 확인이 필요한 항목이 있습니다" : "✅ 모든 점검 항목 정상")
    .addFields(
      {
        name: "프로세스",
        value: [
          `가동 ${formatDuration(current - getProcessStartedAt())} · 메모리 ${memoryMb}MB`,
          `게이트웨이 ${gatewayPing >= 0 ? `${gatewayPing}ms` : "측정 전"} · DB ${dbPing}`,
        ].join("\n"),
        inline: false,
      },
      {
        name: "주기 작업 (마지막 실행)",
        value: truncate(taskLines, FIELD_VALUE_MAX),
        inline: false,
      },
      {
        name: "음악",
        value: truncate(musicLine, FIELD_VALUE_MAX),
        inline: false,
      },
      {
        name: "알림 설정",
        value: [
          `1시간 전 리마인드 ${config.trpgReminder1hEnabled ? "켜짐" : "꺼짐"}`,
          `운영 알림 ${config.trpgAlertUserId ? "DM" : "DM 없음"}${config.trpgAlertChannelId ? " + 채널" : ""}`,
          `외부 생존 신호 ${config.heartbeatPushUrl ? "켜짐" : "꺼짐"}`,
        ].join(" · "),
        inline: false,
      },
    )
    .setFooter({ text: "이 진단은 나에게만 표시됩니다 · 기록은 재시작하면 비워집니다" })
    .setTimestamp(current);
}

export async function handleStatusCommand(
  interaction: ChatInputCommandInteraction,
  dependencies: StatusDependencies,
): Promise<void> {
  if (!interaction.inGuild() || interaction.guildId !== config.trpgGuildId) {
    await interaction.reply({
      content: "이 서버에서는 `/상태` 명령을 사용할 수 없습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!requireManageGuild(interaction)) {
    await interaction.reply({
      content: "`/상태`는 서버 관리 권한이 있는 운영자만 사용할 수 있습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await interaction.editReply({
    embeds: [await buildStatusEmbed(dependencies)],
    allowedMentions: { parse: [] },
  });
}
