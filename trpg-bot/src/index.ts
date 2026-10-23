/**
 * 다채봇(trpg-bot) 진입점
 *
 * 책임:
 *   1. 슬래시 명령 처리 (`/세션확인`, `/roll`, `/r`, `/도움말`, `/음악`)
 *   2. 길드 멤버 동기화 (ClientReady + GuildMember* 이벤트 + 24h 재동기화)
 *   3. trpg_sessions 생성·수정·취소 알림 폴링 + 시작 전 리마인드 폴링
 *   4. YouTube 오디오 검색·재생과 길드별 음성 대기열
 *   5. 운영 장애 알림, 음악 자동 점검, 생존 신호(heartbeat)
 *
 * 세션 생성·수정·취소는 trpg-web 이 담당하고, 봇은 읽기와 알림만 한다.
 *
 * @module index
 */

import {
  ChannelType,
  Client,
  DiscordAPIError,
  Events,
  GatewayIntentBits,
  MessageFlags,
  Partials,
  PermissionFlagsBits,
} from "discord.js";

import type {
  ChatInputCommandInteraction,
  RepliableInteraction,
} from "discord.js";

import { config } from "./config.js";
import { closeDb, connectDb, pingDb } from "./db/client.js";

import { handleDiceRoll, isDiceRollCommandName } from "./commands/dice-roll.js";
import { handleHelpCommand } from "./commands/help.js";
import { handleMusicCommand } from "./commands/music.js";
import { ACTIVE_COMMANDS, registerCommands } from "./commands/register.js";
import { handleTrpgSessionCheck } from "./commands/trpg-session-check.js";
import { startMusicHealthcheck } from "./music/music-healthcheck.js";
import { MusicService } from "./music/music-service.js";
import { startTrpgCancellationNotificationChecker } from "./scheduler/trpg-cancellation-notification-checker.js";
import { startTrpgNotificationChecker } from "./scheduler/trpg-notification-checker.js";
import {
  startTrpgReminder1hChecker,
  startTrpgReminderChecker,
} from "./scheduler/trpg-reminder-checker.js";
import { startTrpgUpdateNotificationChecker } from "./scheduler/trpg-update-notification-checker.js";
import {
  markGuildMemberLeftFromDiscord,
  startGuildMemberDailySync,
  syncAllGuildMembers,
  upsertGuildMemberFromDiscord,
} from "./services/member-sync.js";
import {
  HELP_NAME,
  isMusicCommandName,
  SESSION_CHECK_NAME,
} from "./slash/ko-names.js";
import { startHeartbeat } from "./utils/heartbeat.js";
import {
  OperatorAlertService,
  type OperatorAlertEvent,
} from "./utils/operator-alerts.js";
import { beginShutdown, isShuttingDown } from "./utils/shutdown-state.js";
import { closeTrpgCalendarBrowser } from "./utils/trpg-calendar-image.js";

/** 종료 절차 전체 상한 — Docker stop 기본 유예(10초) 안에 반드시 끝낸다. */
const SHUTDOWN_HARD_LIMIT_MS = 9_000;

/** 사용자에게 다시 알릴 필요가 없는 interaction 오류 코드 */
const IGNORABLE_INTERACTION_ERROR_CODES = new Set([
  10062, // Unknown interaction — 3초 응답 창이 지나 만료됨
  40060, // Interaction has already been acknowledged
]);

const INTERACTION_FAILURE_MESSAGE =
  "명령을 처리하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";

// Guilds: 기본 길드 정보 / GuildMembers: 멤버 fetch + add/remove/update 이벤트
// Partials: GuildMemberRemove 가 cleanup 으로 partial 객체를 전달할 수 있으므로
//   GuildMember/User 를 등록해 이벤트 자체가 누락되지 않도록 한다.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.GuildMember, Partials.User],
});

const operatorAlerts = new OperatorAlertService(client, {
  guildId: config.trpgGuildId,
  userId: config.trpgAlertUserId,
  channelId: config.trpgAlertChannelId,
});

const musicService = new MusicService(
  client,
  config.trpgGuildId,
  config.trpgMusicChannelId,
  { operatorAlerts },
);

function notifyOperator(event: OperatorAlertEvent): void {
  void operatorAlerts.notify(event).catch((error) => {
    console.error("[TRPG Bot] 운영 알림 처리 실패:", error);
  });
}

/** 종료 직전처럼 기다릴 시간이 정해진 곳에서 쓰는 상한 있는 운영 알림. */
async function notifyOperatorWithin(
  event: OperatorAlertEvent,
  timeoutMs: number,
): Promise<void> {
  await Promise.race([
    operatorAlerts.notify(event).catch((error) => {
      console.error("[TRPG Bot] 운영 알림 처리 실패:", error);
    }),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs).unref()),
  ]);
}

/** 폴링 스케줄러 cleanup 핸들 — shutdown 에서 호출 (진행 중 tick 을 기다릴 수 있음) */
let stopNotificationChecker: (() => void | Promise<void>) | null = null;
let stopUpdateNotificationChecker: (() => void | Promise<void>) | null = null;
let stopCancellationNotificationChecker: (() => void | Promise<void>) | null =
  null;
let stopReminderChecker: (() => void | Promise<void>) | null = null;
let stopReminder1hChecker: (() => void | Promise<void>) | null = null;
let stopDailyMemberSync: (() => void) | null = null;
let stopMusicHealthcheck: (() => void) | null = null;
let stopHeartbeat: (() => void) | null = null;

function reportFallbackChannelProblem(detail: string, error?: unknown): void {
  console.error(`[TRPG Bot] 폴백 채널 점검 실패 — ${detail}`, error ?? "");
  notifyOperator({
    key: "fallback-channel-invalid",
    title: "DM 폴백 채널 설정 오류",
    description:
      "DM을 받을 수 없는 참가자에게 알림을 대신 보낼 채널이 동작하지 않습니다. TRPG_FALLBACK_CHANNEL_ID와 봇 권한을 확인해 주세요.",
    severity: "warning",
    error,
    context: { 채널: config.trpgFallbackChannelId, 원인: detail },
  });
}

/**
 * 폴백 채널이 운영 길드의 송신 가능한 채널이고 봇 권한이 있는지 부팅 시 1회 검증.
 * 잘못된 설정이어도 throw 하지 않고 운영 알림만 보낸다 — 봇 자체는 계속 동작.
 */
async function verifyFallbackChannel(): Promise<void> {
  try {
    const ch = await client.channels.fetch(config.trpgFallbackChannelId);
    if (!ch) {
      reportFallbackChannelProblem("채널을 찾을 수 없습니다");
      return;
    }
    if (ch.isDMBased() || !("guildId" in ch) || ch.guildId !== config.trpgGuildId) {
      const guildPart = "guildId" in ch ? ch.guildId : "DM";
      reportFallbackChannelProblem(
        `운영 길드(${config.trpgGuildId})가 아닌 곳의 채널입니다 (guild=${guildPart})`,
      );
      return;
    }
    if (
      ch.type === ChannelType.GuildCategory ||
      ch.type === ChannelType.GuildForum ||
      !ch.isTextBased()
    ) {
      reportFallbackChannelProblem(
        `메시지를 직접 보낼 수 없는 채널 종류입니다 (type=${ch.type})`,
      );
      return;
    }

    const me = ch.guild.members.me;
    const permissions = me ? ch.permissionsFor(me) : null;
    const required = [
      PermissionFlagsBits.ViewChannel,
      ch.isThread()
        ? PermissionFlagsBits.SendMessagesInThreads
        : PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
    ];
    if (!permissions || !permissions.has(required)) {
      const missing = permissions ? permissions.missing(required) : ["(봇 멤버 정보 없음)"];
      reportFallbackChannelProblem(`봇 권한이 부족합니다: ${missing.join(", ")}`);
    }
  } catch (err) {
    reportFallbackChannelProblem("채널 조회 중 오류가 발생했습니다", err);
  }
}

client.on(Events.Error, (err) => {
  console.error("[TRPG Bot] Discord 클라이언트 오류:", err);
  notifyOperator({
    key: "discord-client-error",
    title: "Discord 클라이언트 오류",
    description:
      "Discord 게이트웨이 또는 REST 클라이언트에서 오류가 발생했습니다.",
    error: err,
  });
});

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`[TRPG Bot] 로그인: ${readyClient.user.tag}`);
  // 게이트웨이(모든 shard Ready)가 살아 있는 동안만 생존 신호 파일을 갱신한다 (Docker HEALTHCHECK 대상).
  stopHeartbeat = startHeartbeat({
    client,
    filePath: config.heartbeatFilePath,
    pushUrl: config.heartbeatPushUrl,
    pingDb,
  });
  if (!config.trpgAlertUserId) {
    console.warn(
      "[TRPG Bot] TRPG_ALERT_USER_ID가 없어 운영 장애 DM이 비활성화되어 있습니다.",
    );
  }

  try {
    await registerCommands();
    console.log(
      `[TRPG Bot] 슬래시 커맨드 등록 완료 (${ACTIVE_COMMANDS.map((command) => `/${command.name}`).join(", ")})`,
    );
  } catch (err) {
    console.error("[TRPG Bot] 커맨드 등록 실패:", err);
    notifyOperator({
      key: "command-registration",
      title: "슬래시 커맨드 등록 실패",
      description:
        "Discord에 최신 명령어를 등록하지 못했습니다. Application ID와 등록 범위를 확인해 주세요.",
      error: err,
    });
  }

  try {
    const runtime = await musicService.initialize();
    console.log(
      `[TRPG Bot] 음악 런타임 준비 완료 — yt-dlp=${runtime.ytDlpVersion}, ${runtime.ffmpegVersion}`,
    );
    // YouTube 정책 변화는 서버 IP 에서만 재현되므로 점검도 봇 안에서 수행한다.
    if (config.musicHealthcheckEnabled) {
      stopMusicHealthcheck = startMusicHealthcheck({
        videoUrl: config.musicHealthcheckVideoUrl,
        intervalMs: config.musicHealthcheckIntervalMs,
        startDelayMs: config.musicHealthcheckStartDelayMs,
        operatorAlerts,
        ytDlpVersion: runtime.ytDlpVersion,
      });
      console.log(
        `[TRPG Bot] 음악 자동 점검 시작 — 주기=${config.musicHealthcheckIntervalMs}ms`,
      );
    }
  } catch (err) {
    // 음악 기능만 비활성화하고 기존 세션 조회·알림 책임은 계속 수행한다.
    console.error("[TRPG Bot] 음악 런타임 준비 실패:", err);
  }

  // 폴백 채널 사전 검증 (잘못된 설정 조기 알림)
  await verifyFallbackChannel();

  try {
    const result = await syncAllGuildMembers(client, config.trpgGuildId);
    console.log(
      `[TRPG Bot] 멤버 동기화 완료 — upserted=${result.upserted} markedLeft=${result.markedLeft}`,
    );
  } catch (err) {
    console.error("[TRPG Bot] 멤버 동기화 실패:", err);
    notifyOperator({
      key: "member-initial-sync",
      title: "길드 멤버 초기 동기화 실패",
      description:
        "봇 시작 시 운영 길드 멤버 정보를 DB와 동기화하지 못했습니다.",
      error: err,
      context: { 길드: config.trpgGuildId },
    });
  }

  // 위의 긴 await 도중 SIGTERM 이 왔으면 정리되지 않을 인터벌·첫 tick 을 만들지 않는다.
  if (isShuttingDown()) return;

  // 24h 주기 재동기화 — GuildMemberAdd/Remove 이벤트 누락 보정용 안전망
  stopDailyMemberSync = startGuildMemberDailySync(client, config.trpgGuildId, {
    operatorAlerts,
  });

  const schedulerOptions = { operatorAlerts };
  stopNotificationChecker = startTrpgNotificationChecker(client, schedulerOptions);
  console.log("[TRPG Bot] 세션 생성 알림 폴링 시작");
  stopUpdateNotificationChecker = startTrpgUpdateNotificationChecker(
    client,
    schedulerOptions,
  );
  console.log("[TRPG Bot] 세션 수정 알림 폴링 시작");
  stopCancellationNotificationChecker =
    startTrpgCancellationNotificationChecker(client, schedulerOptions);
  console.log("[TRPG Bot] 세션 취소 알림 폴링 시작");
  stopReminderChecker = startTrpgReminderChecker(client, schedulerOptions);
  console.log("[TRPG Bot] 24h 리마인드 폴링 시작");
  stopReminder1hChecker = startTrpgReminder1hChecker(client, schedulerOptions);
  console.log(
    stopReminder1hChecker
      ? "[TRPG Bot] 1h 리마인드 폴링 시작"
      : "[TRPG Bot] 1h 리마인드 비활성 (TRPG_REMINDER_1H)",
  );
});

async function routeChatInputCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  switch (interaction.commandName) {
    case SESSION_CHECK_NAME:
      await handleTrpgSessionCheck(interaction);
      return;
    case HELP_NAME:
      await handleHelpCommand(interaction);
      return;
  }
  if (isDiceRollCommandName(interaction.commandName)) {
    await handleDiceRoll(interaction);
    return;
  }
  if (isMusicCommandName(interaction.commandName)) {
    await handleMusicCommand(interaction, musicService);
  }
}

/**
 * 핸들러가 놓친 예외의 공통 경계.
 *
 * 응답 창 만료(10062)·중복 응답(40060)은 로그만 남기고, 그 외에는 명령별 key 로
 * 운영 알림을 보낸 뒤 아직 응답하지 않았으면 비공개 오류 메시지를 best-effort 로 보낸다.
 */
async function handleInteractionFailure(
  interaction: RepliableInteraction,
  label: string,
  error: unknown,
): Promise<void> {
  if (
    error instanceof DiscordAPIError &&
    IGNORABLE_INTERACTION_ERROR_CODES.has(Number(error.code))
  ) {
    console.warn(
      `[TRPG Bot] ${label} 응답 생략 (code=${error.code}): ${error.message}`,
    );
    return;
  }

  console.error(`[TRPG Bot] ${label} 처리 실패:`, error);
  notifyOperator({
    key: `interaction-handler:${label}`,
    title: "명령 처리 오류",
    description: `${label} 처리 중 예상하지 못한 예외가 발생했습니다.`,
    severity: "warning",
    error,
    context: { 명령: label, 채널: interaction.channelId },
  });

  try {
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply({ content: INTERACTION_FAILURE_MESSAGE });
    } else if (!interaction.replied) {
      await interaction.reply({
        content: INTERACTION_FAILURE_MESSAGE,
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch {
    /* 응답 창이 이미 닫혔다 — 운영 알림으로 충분 */
  }
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  try {
    await routeChatInputCommand(interaction);
  } catch (error) {
    await handleInteractionFailure(
      interaction,
      `/${interaction.commandName}`,
      error,
    );
  }
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  musicService.handleVoiceStateUpdate(oldState, newState);
});

client.on(Events.GuildMemberAdd, async (member) => {
  if (member.guild.id !== config.trpgGuildId) return;
  if (member.user.bot) return;
  try {
    await upsertGuildMemberFromDiscord(member);
  } catch (err) {
    console.error("[TRPG Bot] GuildMemberAdd 처리 실패:", err);
  }
});

client.on(Events.GuildMemberUpdate, async (_old, member) => {
  if (member.guild.id !== config.trpgGuildId) return;
  if (member.user.bot) return;
  try {
    await upsertGuildMemberFromDiscord(member);
  } catch (err) {
    console.error("[TRPG Bot] GuildMemberUpdate 처리 실패:", err);
  }
});

client.on(Events.GuildMemberRemove, async (member) => {
  if (member.guild.id !== config.trpgGuildId) return;
  // partial user 의 bot 필드는 undefined 가능 → user 캐시된 경우만 bot 가드 적용.
  // partial 이면 어차피 봇 여부 알 수 없으므로 일단 markLeft 진행 (DB 측이 idempotent).
  if (member.user && !member.user.partial && member.user.bot) return;
  try {
    await markGuildMemberLeftFromDiscord(config.trpgGuildId, member.id);
  } catch (err) {
    console.error("[TRPG Bot] GuildMemberRemove 처리 실패:", err);
  }
});

/** 종료 단계 하나를 상한 시간 안에서 실행한다. 실패·초과는 로그만 남기고 다음 단계로. */
async function runShutdownStep(
  label: string,
  step: () => unknown,
  timeoutMs: number,
): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(step),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${timeoutMs}ms 안에 끝나지 않았습니다`)),
          timeoutMs,
        );
      }),
    ]);
  } catch (error) {
    console.error(`[TRPG Bot] 종료 단계 실패 — ${label}:`, error);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 프로세스 종료 시 정리.
 *
 * 순서:
 *   1. 스케줄러 인터벌 정리 + 진행 중 tick 대기 — 발송 중이던 세션은 완료 표시 없이
 *      멈춰 다음 인스턴스가 남은 수신자를 이어서 처리한다.
 *   2. 음악 스트림·FFmpeg·음성 연결 정리.
 *   3. Discord client.destroy() — 게이트웨이 cut-off, 이후 이벤트 차단.
 *   4. 외부 자원 정리 (Puppeteer browser, MongoDB connection).
 *
 * 두 번째 신호는 무시하고, 어떤 단계가 멈춰도 `SHUTDOWN_HARD_LIMIT_MS` 뒤 강제 종료한다.
 */
async function shutdown(signal: string, exitCode = 0): Promise<void> {
  if (!beginShutdown()) return;
  console.log(`[TRPG Bot] 종료 중... (${signal})`);
  setTimeout(() => {
    console.error("[TRPG Bot] 종료 절차가 제한 시간을 넘어 강제 종료합니다.");
    process.exit(exitCode === 0 ? 1 : exitCode);
  }, SHUTDOWN_HARD_LIMIT_MS).unref();

  // 1) 새 작업 차단: 인터벌 정리 + 진행 중 tick 대기
  stopDailyMemberSync?.();
  stopMusicHealthcheck?.();
  stopHeartbeat?.();
  await runShutdownStep(
    "알림 스케줄러",
    () =>
      Promise.allSettled(
        [
          stopNotificationChecker,
          stopUpdateNotificationChecker,
          stopCancellationNotificationChecker,
          stopReminderChecker,
          stopReminder1hChecker,
        ].map((stop) => stop?.()),
      ),
    3_000,
  );

  // 2) 음악 스트림과 음성 연결 종료
  await runShutdownStep("음악", () => musicService.destroyAll(), 2_000);

  // 3) Discord 클라이언트 종료 (게이트웨이 cut-off)
  await runShutdownStep("Discord 클라이언트", () => client.destroy(), 1_500);

  // 4) 외부 자원 정리
  await runShutdownStep("캘린더 브라우저", closeTrpgCalendarBrowser, 1_000);
  await runShutdownStep("MongoDB", closeDb, 1_000);
  process.exit(exitCode);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

// 어디에서도 처리하지 않은 비동기 오류는 알리고 계속 실행한다 (registra-bot 과 같은 정책).
process.on("unhandledRejection", (reason) => {
  console.error("[TRPG Bot] 처리되지 않은 Promise 거부:", reason);
  notifyOperator({
    key: "unhandled-rejection",
    title: "처리되지 않은 비동기 오류",
    description:
      "어느 곳에서도 처리하지 않은 Promise 거부가 발생했습니다. 봇은 계속 실행됩니다.",
    severity: "warning",
    error: reason,
  });
});

// 동기 예외는 상태를 신뢰할 수 없으므로 알린 뒤 정리하고 종료한다 (재시작 정책이 다시 띄움).
process.on("uncaughtException", (error) => {
  console.error("[TRPG Bot] 처리되지 않은 예외:", error);
  void notifyOperatorWithin(
    {
      key: "uncaught-exception",
      title: "처리되지 않은 예외로 종료",
      description:
        "예상하지 못한 예외로 봇이 종료 절차에 들어갑니다. 컨테이너 재시작 정책이 다시 띄웁니다.",
      error,
    },
    2_000,
  ).finally(() => shutdown("uncaughtException", 1));
});

async function main(): Promise<void> {
  await connectDb();
  await client.login(config.discordToken);
}

main().catch(async (err) => {
  console.error("[TRPG Bot] 시작 실패:", err);
  try {
    await operatorAlerts.notify({
      key: "bot-startup",
      title: "다채봇 시작 실패",
      description:
        "DB 연결 또는 Discord 로그인 단계에서 프로세스가 시작되지 못했습니다.",
      error: err,
    });
  } finally {
    process.exit(1);
  }
});
