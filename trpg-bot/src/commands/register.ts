/**
 * 슬래시 커맨드 등록
 *
 * Discord REST API를 통해 /session create 명령어를 등록합니다.
 * GUILD_ID가 있으면 해당 길드에만, 없으면 전역 등록합니다.
 * @module commands/register
 */

import { REST, Routes } from "discord.js";
import { config } from "../config.js";

/** /session create 명령어 정의 */
const SESSION_CREATE_CMD = {
  name: "session",
  description: "TRPG 세션 참여 체크 관리",
  options: [
    {
      name: "create",
      description: "새 세션을 생성하고 참여 체크 공지를 올립니다.",
      type: 1, // SUB_COMMAND
      options: [
        {
          name: "title",
          description: "세션명",
          type: 3, // STRING
          required: true,
        },
        {
          name: "date",
          description: "세션 진행 일시 (예: 2026-03-22 20:00)",
          type: 3,
          required: true,
        },
        {
          name: "close",
          description: "응답 마감 일시 (예: 2026-03-20 23:59)",
          type: 3,
          required: true,
        },
        {
          name: "role",
          description: "참여 대상 역할 (역할 ID 또는 @멘션)",
          type: 3,
          required: true,
        },
        {
          name: "channel",
          description: "공지 채널 (채널 ID, 미지정 시 현재 채널)",
          type: 3,
          required: false,
        },
      ],
    },
  ],
};

/**
 * 슬래시 커맨드를 Discord에 등록합니다.
 * 봇 ready 시 한 번 호출합니다.
 */
export async function registerCommands(): Promise<void> {
  const rest = new REST().setToken(config.discordToken);
  const body = [SESSION_CREATE_CMD];

  if (config.guildId) {
    // 개발용: 특정 길드에만 등록 (즉시 반영)
    await rest.put(
      Routes.applicationGuildCommands(config.discordClientId, config.guildId),
      { body }
    );
  } else {
    // 전역 등록 (최대 1시간 캐시)
    await rest.put(Routes.applicationCommands(config.discordClientId), {
      body,
    });
  }
}
