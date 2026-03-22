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
import { handleButtonInteraction } from "./handlers/button-handler.js";
import { handleSessionCreate } from "./commands/session-create.js";
import { startCloseChecker } from "./scheduler/close-checker.js";

// Discord 봇 클라이언트 (Guilds: 서버/채널/역할 정보, GuildMembers: 역할 멤버 조회)
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
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
});

/** 슬래시 커맨드 실행 시: /session create 처리 */
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "session" && interaction.options.getSubcommand() === "create") {
    await handleSessionCreate(interaction);
  }
});

/** 버튼 클릭 시: 참석/불참/미정 응답 처리 */
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton()) {
    await handleButtonInteraction(interaction);
  }
});

/** 프로세스 종료 시 DB 연결 해제 */
process.on("SIGINT", async () => {
  console.log("[TRPG Bot] 종료 중...");
  await closeDb();
  process.exit(0);
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
