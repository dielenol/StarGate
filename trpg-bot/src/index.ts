/**
 * TRPG 참여 체크 디스코드 봇 진입점
 *
 * Discord Client 초기화, 이벤트 핸들러 등록, DB 연결, 마감 스케줄러 시작을 담당합니다.
 * @module index
 */

import { Client, Events, GatewayIntentBits } from "discord.js";
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
import { startReminderChecker } from "./scheduler/reminder-checker.js";
import { closeResultCardBrowser } from "./utils/result-card-image.js";

// Discord 봇 클라이언트 (Guilds: 서버/채널/역할 정보, GuildMembers: 역할 멤버 조회)
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

/**
 * GatewayRateLimitError 등이 처리되지 않으면 Client `error`로 전파되어 프로세스가 종료될 수 있음
 */
client.on(Events.Error, (err) => {
  console.error("[TRPG Bot] Discord 클라이언트 오류:", err);
});

/** 봇 준비 완료 시: 커맨드 등록 및 스케줄러 시작 */
client.once(Events.ClientReady, async (readyClient) => {
  console.log(`[TRPG Bot] 로그인: ${readyClient.user.tag}`);

  try {
    await registerCommands();
    console.log("[TRPG Bot] 슬래시 커맨드 등록 완료");
  } catch (err) {
    console.error("[TRPG Bot] 커맨드 등록 실패:", err);
  }

  startCloseChecker(client);
  console.log("[TRPG Bot] 마감 스케줄러 시작");
  startReminderChecker(client);
  console.log("[TRPG Bot] 리마인드 스케줄러 시작");
});

/** `/일정 생성` 문자열 옵션 자동완성 */
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isAutocomplete()) return;
  if (interaction.commandName !== SCHEDULE_ROOT) return;
  await handleSessionCreateAutocomplete(interaction);
});

/** 슬래시 커맨드 실행 시: /일정 … 및 단독 /참여확인 */
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === Sub.participationCheck) {
    await handleSessionParticipationCheck(interaction);
    return;
  }

  if (interaction.commandName !== SCHEDULE_ROOT) return;

  const sub = interaction.options.getSubcommand();
  switch (sub) {
    case Sub.create:
      await handleSessionCreate(interaction);
      break;
    case Sub.list:
      await handleSessionList(interaction);
      break;
    case Sub.overview:
      await handleSessionOverview(interaction);
      break;
    case Sub.calendar:
      await handleSessionMonthCalendar(interaction);
      break;
    case Sub.result:
      await handleSessionResult(interaction);
      break;
    case Sub.participationCheck:
      await handleSessionParticipationCheck(interaction);
      break;
    case Sub.close:
      await handleSessionClose(interaction);
      break;
    case Sub.editClose:
      await handleSessionEditClose(interaction);
      break;
    case Sub.editDate:
      await handleSessionEditDate(interaction);
      break;
    case Sub.cancel:
      await handleSessionCancel(interaction);
      break;
    default:
      break;
  }
});

/** 버튼 클릭 시: 참석/불참/미정 응답 처리 */
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton()) {
    await handleButtonInteraction(interaction);
  }
});

/** 프로세스 종료 시 DB 연결 해제 */
async function shutdown(): Promise<void> {
  console.log("[TRPG Bot] 종료 중...");
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
  console.error("[TRPG Bot] 시작 실패:", err);
  process.exit(1);
});
