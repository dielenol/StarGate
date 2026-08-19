/**
 * TRPG 참여 체크 디스코드 봇 진입점 (Phase 2)
 *
 * Phase 2 에서는 일정 슬래시 (`/일정`, `/참여확인`) 와 버튼 응답 흐름 / 마감·
 * 리마인드 스케줄러 호출을 모두 제거하고, 다음 책임만 유지한다:
 *   1. `/세션확인` 슬래시 처리
 *   2. `/도움말`, `/roll`, `/r` 슬래시 처리
 *   3. 길드 멤버 동기화 (ClientReady + GuildMember* 이벤트 + 24h 재동기화)
 *   4. trpg_sessions 생성/수정/취소 알림 폴링 + 24h 리마인드 폴링
 *   5. YouTube 오디오 검색·재생과 길드별 음성 대기열
 *
 * 비활성 파일 (`commands/session-*`, `scheduler/close-checker`, `scheduler/reminder-checker`,
 * `handlers/button-handler`, `utils/result-card-image`) 은 코드만 보존되어 있으며
 * 본 진입점에서 import 되지 않는다.
 *
 * @module index
 */

import { ChannelType, Client, Events, GatewayIntentBits, Partials } from "discord.js";

import { config } from "./config.js";
import { closeDb, connectDb } from "./db/client.js";

import { handleDiceRoll, isDiceRollCommandName } from "./commands/dice-roll.js";
import { handleHelpCommand } from "./commands/help.js";
import { handleMusicCommand } from "./commands/music.js";
import { registerCommands } from "./commands/register.js";
import { handleTrpgSessionCheck } from "./commands/trpg-session-check.js";
import { startMusicHealthcheck } from "./music/music-healthcheck.js";
import { MusicService } from "./music/music-service.js";
import { startTrpgCancellationNotificationChecker } from "./scheduler/trpg-cancellation-notification-checker.js";
import { startTrpgNotificationChecker } from "./scheduler/trpg-notification-checker.js";
import { startTrpgReminderChecker } from "./scheduler/trpg-reminder-checker.js";
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
import {
  OperatorAlertService,
  type OperatorAlertEvent,
} from "./utils/operator-alerts.js";
import { closeTrpgCalendarBrowser } from "./utils/trpg-calendar-image.js";

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

/** 폴링 스케줄러 cleanup 핸들 — shutdown 에서 호출 */
let stopNotificationChecker: (() => void) | null = null;
let stopUpdateNotificationChecker: (() => void) | null = null;
let stopCancellationNotificationChecker: (() => void) | null = null;
let stopReminderChecker: (() => void) | null = null;
let stopDailyMemberSync: (() => void) | null = null;
let stopMusicHealthcheck: (() => void) | null = null;

/**
 * 폴백 채널이 올바른 길드에 속한 송신 가능 채널인지 부팅 시 1회 검증.
 * 잘못된 설정이어도 throw 하지 않고 경고만 출력 — 봇 자체는 계속 동작.
 */
async function verifyFallbackChannel(): Promise<void> {
  try {
    const ch = await client.channels.fetch(config.trpgFallbackChannelId);
    if (!ch) {
      console.error(
        `[TRPG Bot] 폴백 채널을 찾을 수 없습니다: ${config.trpgFallbackChannelId}`,
      );
      return;
    }
    if (ch.isDMBased() || !("guildId" in ch) || ch.guildId !== config.trpgGuildId) {
      const guildPart = "guildId" in ch ? ch.guildId : "DM";
      console.error(
        `[TRPG Bot] 폴백 채널이 운영 길드(${config.trpgGuildId})에 속하지 않습니다: ` +
          `channel=${config.trpgFallbackChannelId}, guild=${guildPart}. ` +
          `운영자가 .env 의 TRPG_FALLBACK_CHANNEL_ID 를 점검해야 합니다.`,
      );
      return;
    }
    if (
      ch.type === ChannelType.GuildCategory ||
      ch.type === ChannelType.GuildForum ||
      !ch.isTextBased()
    ) {
      console.error(
        `[TRPG Bot] 폴백 채널 type=${ch.type} 은 직접 send 가 불가능합니다. ` +
          `텍스트 채널로 교체하세요.`,
      );
    }
  } catch (err) {
    console.error("[TRPG Bot] 폴백 채널 검증 실패:", err);
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
  if (!config.trpgAlertUserId) {
    console.warn(
      "[TRPG Bot] TRPG_ALERT_USER_ID가 없어 운영 장애 DM이 비활성화되어 있습니다.",
    );
  }

  try {
    await registerCommands();
    console.log(
      "[TRPG Bot] 슬래시 커맨드 등록 완료 (/세션확인, /roll, /r, /도움말, /음악)",
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

  // 24h 주기 재동기화 — GuildMemberAdd/Remove 이벤트 누락 보정용 안전망
  stopDailyMemberSync = startGuildMemberDailySync(client, config.trpgGuildId);

  stopNotificationChecker = startTrpgNotificationChecker(client);
  console.log("[TRPG Bot] 세션 생성 알림 폴링 시작");
  stopUpdateNotificationChecker = startTrpgUpdateNotificationChecker(client);
  console.log("[TRPG Bot] 세션 수정 알림 폴링 시작");
  stopCancellationNotificationChecker =
    startTrpgCancellationNotificationChecker(client);
  console.log("[TRPG Bot] 세션 취소 알림 폴링 시작");
  stopReminderChecker = startTrpgReminderChecker(client);
  console.log("[TRPG Bot] 24h 리마인드 폴링 시작");
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === SESSION_CHECK_NAME) {
    await handleTrpgSessionCheck(interaction);
    return;
  }
  if (isDiceRollCommandName(interaction.commandName)) {
    await handleDiceRoll(interaction);
    return;
  }
  if (interaction.commandName === HELP_NAME) {
    await handleHelpCommand(interaction);
    return;
  }
  if (isMusicCommandName(interaction.commandName)) {
    await handleMusicCommand(interaction, musicService);
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

/**
 * 프로세스 종료 시 정리.
 *
 * 순서:
 *   1. 인터벌(폴링/일일동기화) 정리 — 새 작업 흘러들지 않도록 차단.
 *   2. 음악 스트림·FFmpeg·음성 연결 정리.
 *   3. Discord client.destroy() — 게이트웨이 cut-off, 이후 이벤트 차단.
 *   4. 짧은 대기 — 진행 중인 마이크로태스크가 정리될 시간.
 *   5. 외부 자원 정리 (Puppeteer browser, MongoDB connection).
 */
async function shutdown(signal: string): Promise<void> {
  console.log(`[TRPG Bot] 종료 중... (${signal})`);

  // 1) 새 이벤트 차단: 인터벌 먼저 정리
  if (stopNotificationChecker) stopNotificationChecker();
  if (stopUpdateNotificationChecker) stopUpdateNotificationChecker();
  if (stopCancellationNotificationChecker) stopCancellationNotificationChecker();
  if (stopReminderChecker) stopReminderChecker();
  if (stopDailyMemberSync) stopDailyMemberSync();
  if (stopMusicHealthcheck) stopMusicHealthcheck();

  // 2) 음악 스트림과 음성 연결 종료
  await musicService.destroyAll();

  // 3) Discord 클라이언트 종료 (게이트웨이 cut-off)
  try {
    await client.destroy();
  } catch {
    /* ignore */
  }

  // 4) 잔여 마이크로태스크 처리 대기 (best-effort)
  await new Promise((r) => setTimeout(r, 1000));

  // 5) 외부 자원 정리
  await closeTrpgCalendarBrowser();
  await closeDb();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
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
