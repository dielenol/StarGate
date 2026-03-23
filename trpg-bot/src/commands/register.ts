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
          description:
            "세션 일시 24h (예: 2026-03-22 20:00=저녁8시). 지금 이후만 가능",
          type: 3,
          required: true,
        },
        {
          name: "close",
          description:
            "응답 마감 24h (예: 15:50=오후3시50분, 03:50=새벽). 지금·세션일시 사이",
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
    {
      name: "list",
      description: "이 서버에서 진행 중(OPEN)인 세션 목록 (서버 관리 권한)",
      type: 1,
      options: [],
    },
    {
      name: "result",
      description: "현재 집계 또는 최종 결과 확인 (서버 관리 권한)",
      type: 1,
      options: [
        {
          name: "session_id",
          description:
            "세션 ID(생성 완료 메시지에 표시). 비우면 이 서버 전체 기준: 최근 진행 중→없으면 최근 마감 (만든 사람 무관)",
          type: 3,
          required: false,
        },
      ],
    },
    {
      name: "close",
      description: "응답 수집을 강제 마감합니다 (관리자)",
      type: 1,
      options: [
        {
          name: "session_id",
          description:
            "세션 ID(생성 완료 메시지 참고). 비우면 이 서버에서 가장 최근 진행 중 세션",
          type: 3,
          required: false,
        },
      ],
    },
    {
      name: "edit_close",
      description: "응답 마감 일시 변경 (진행 중 세션, 서버 관리 권한)",
      type: 1,
      options: [
        {
          name: "new_close",
          description:
            "새 응답 마감 24h. 과거·세션일 이후도 저장 가능(안내 문구 확인)",
          type: 3,
          required: true,
        },
        {
          name: "session_id",
          description:
            "세션 ID(공지 임베드). 비우면 이 서버 가장 최근 진행 중 세션",
          type: 3,
          required: false,
        },
      ],
    },
    {
      name: "edit_date",
      description: "세션 진행 일시 변경 (진행 중 세션, 서버 관리 권한)",
      type: 1,
      options: [
        {
          name: "new_date",
          description:
            "새 세션 일시 24h. 과거 허용. 마감보다 앞이면 마감을 세션 1시간 전으로 자동 조정",
          type: 3,
          required: true,
        },
        {
          name: "session_id",
          description:
            "세션 ID(공지 임베드). 비우면 이 서버 가장 최근 진행 중 세션",
          type: 3,
          required: false,
        },
      ],
    },
    {
      name: "cancel",
      description: "세션을 취소합니다 (집계 메시지 없음, 서버 관리 권한)",
      type: 1,
      options: [
        {
          name: "session_id",
          description:
            "세션 ID(생성 완료 메시지 참고). 비우면 이 서버에서 가장 최근 진행 중 세션",
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
