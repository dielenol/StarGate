/**
 * 레지스트라(REGISTRAR) — NOVUS ORDO 통합 일정 봇 진입점
 *
 * @module index
 */

import {
  ActivityType,
  Client,
  Events,
  GatewayIntentBits,
} from "discord.js";
import { L } from "./constants/registrar-voice.js";
import { config } from "./config.js";
import { connectDb, closeDb } from "./db/client.js";
import { registerCommands } from "./commands/register.js";
import { SCHEDULE_ROOT, Sub } from "./slash/ko-names.js";
import { handleButtonInteraction } from "./handlers/button-handler.js";
import { handleSessionCreate } from "./commands/session-create.js";
import { handleSessionCreateAutocomplete } from "./commands/session-create-autocomplete.js";
import {
  handleSessionList,
  handleSessionOverview,
  handleSessionMonthCalendar,
  handleSessionResult,
  handleSessionParticipationCheck,
  handleSessionClose,
  handleSessionEditClose,
  handleSessionEditDate,
  handleSessionCancel,
} from "./commands/session-manage.js";
import { startCloseChecker } from "./scheduler/close-checker.js";
import {
  startReminderChecker,
  type ReminderCheckerHandle,
} from "./scheduler/reminder-checker.js";
import { closeResultCardBrowser } from "./utils/result-card-image.js";
import { runSafely, safeHandleInteraction } from "./utils/safe-interaction.js";

// Discord 봇 클라이언트 (Guilds: 서버/채널/역할 정보, GuildMembers: 역할 멤버 조회)
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

/** 기동 중인 스케줄러 타이머 핸들 (종료 시 해제용) */
let closeCheckerTimer: NodeJS.Timeout | null = null;
let reminderCheckerHandle: ReminderCheckerHandle | null = null;

/** shutdown 재진입 방지 플래그 (SIGINT + SIGTERM 중복 수신 방어) */
let isShuttingDown = false;

/**
 * GatewayRateLimitError 등이 처리되지 않으면 Client `error`로 전파되어 프로세스가 종료될 수 있음
 */
client.on(Events.Error, (err) => {
  console.error(L.discordErr, err);
});

/** 봇 준비 완료 시: 커맨드 등록 및 스케줄러 시작 */
client.once(Events.ClientReady, (readyClient) => {
  void runSafely(L.readyUnhandled, async () => {
    console.log(L.login(readyClient.user.tag));
    readyClient.user.setActivity("NOVUS ORDO 일정 총괄", {
      type: ActivityType.Watching,
    });

    try {
      await registerCommands();
      console.log(L.slashOk);
    } catch (err) {
      console.error(L.slashFail, err);
    }

    closeCheckerTimer = startCloseChecker(client);
    console.log(L.schedulerClose);
    reminderCheckerHandle = startReminderChecker(client);
    console.log(L.schedulerRemind);
  });
});

/** `/일정` 생성·일정변경·응답마감변경 문자열 옵션 자동완성 */
client.on(Events.InteractionCreate, (interaction) => {
  if (!interaction.isAutocomplete()) return;
  if (interaction.commandName !== SCHEDULE_ROOT) return;

  void safeHandleInteraction(
    "autocomplete",
    interaction,
    handleSessionCreateAutocomplete
  );
});

/** 슬래시 커맨드 실행 시: /일정 … 및 단독 /참여확인 */
client.on(Events.InteractionCreate, (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  void safeHandleInteraction("chat-input", interaction, async (safeInteraction) => {
    if (safeInteraction.commandName === Sub.participationCheck) {
      await handleSessionParticipationCheck(safeInteraction);
      return;
    }

    if (safeInteraction.commandName !== SCHEDULE_ROOT) return;

    const sub = safeInteraction.options.getSubcommand();
    switch (sub) {
      case Sub.create:
        await handleSessionCreate(safeInteraction);
        break;
      case Sub.list:
        await handleSessionList(safeInteraction);
        break;
      case Sub.overview:
        await handleSessionOverview(safeInteraction);
        break;
      case Sub.calendar:
        await handleSessionMonthCalendar(safeInteraction);
        break;
      case Sub.result:
        await handleSessionResult(safeInteraction);
        break;
      case Sub.participationCheck:
        await handleSessionParticipationCheck(safeInteraction);
        break;
      case Sub.close:
        await handleSessionClose(safeInteraction);
        break;
      case Sub.editClose:
        await handleSessionEditClose(safeInteraction);
        break;
      case Sub.editDate:
        await handleSessionEditDate(safeInteraction);
        break;
      case Sub.cancel:
        await handleSessionCancel(safeInteraction);
        break;
      default:
        break;
    }
  });
});

/** 버튼 클릭 시: 가용/불가 응답 처리 */
client.on(Events.InteractionCreate, (interaction) => {
  if (interaction.isButton()) {
    void safeHandleInteraction("button", interaction, handleButtonInteraction);
  }
});

/** 프로세스 종료 시 스케줄러 타이머 해제 + Discord 클라이언트 + 브라우저 + DB 연결 해제 */
async function shutdown(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(L.shutdown);
  if (closeCheckerTimer !== null) {
    clearInterval(closeCheckerTimer);
    closeCheckerTimer = null;
  }
  if (reminderCheckerHandle !== null) {
    reminderCheckerHandle.stop();
    reminderCheckerHandle = null;
  }
  await client.destroy().catch((err) => {
    console.error("[shutdown] client.destroy failed", err);
  });
  await closeResultCardBrowser();
  await closeDb();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});

/** 봇 실행: DB 연결 후 Discord 로그인 */
async function main() {
  await connectDb();
  await client.login(config.discordToken);
}

main().catch((err) => {
  console.error(L.bootFail, err);
  process.exit(1);
});
