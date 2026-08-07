/**
 * 슬래시 커맨드 등록
 *
 * Discord REST API 로 슬래시 커맨드를 등록합니다.
 *
 * Phase 2부터 `/일정` 루트와 `/참여확인` 단독 커맨드 등록은 해제되었습니다.
 * 현재는 도움말, 세션 확인, 주사위, YouTube 음악 명령만 등록합니다. 기존
 * 일정 관리 핸들러 코드는 비활성 상태로 보존되어 있습니다 (호출처 없음).
 *
 * @module commands/register
 */

import { REST, Routes } from "discord.js";

import { config } from "../config.js";
import { MusicRepeatMode } from "../music/types.js";
import {
  HELP_NAME,
  HELP_TOPIC_OPTION,
  HelpTopic,
  MUSIC_PLAYLIST_OPTION,
  MUSIC_QUERY_OPTION,
  MUSIC_REPEAT_MODE_OPTION,
  MUSIC_ROOT,
  MusicSubcommand,
  ROLL_NAME,
  ROLL_SHORT_NAME,
  SESSION_CHECK_NAME,
} from "../slash/ko-names.js";

const CURRENT_YEAR = 2026;

/** `/세션확인` — 선택한 달의 TRPG 세션 일정과 캘린더를 응답 */
const SESSION_CHECK_CMD = {
  type: 1 as const,
  name: SESSION_CHECK_NAME,
  description: "선택한 달의 TRPG 세션 일정·월간 캘린더·웹 링크를 확인합니다",
  default_member_permissions: null,
  options: [
    {
      type: 4,
      name: "연도",
      description: "조회할 연도 (미입력 시 현재 연도)",
      min_value: CURRENT_YEAR,
      max_value: 2100,
      required: false,
    },
    {
      type: 4,
      name: "월",
      description: "조회할 월 (미입력 시 현재 월)",
      min_value: 1,
      max_value: 12,
      required: false,
    },
    {
      type: 3,
      name: "모드",
      description: "세션별 상세 목록을 표시할지 선택합니다",
      required: false,
      choices: [
        { name: "상세 보기", value: "detail" },
        { name: "요약만 보기", value: "summary" },
      ],
    },
    {
      type: 5,
      name: "비공개",
      description: "명령 결과를 나에게만 표시합니다",
      required: false,
    },
  ],
};

const DICE_ROLL_OPTIONS = [
  {
    type: 3,
    name: "식",
    description: "굴릴 주사위 식 (예: 2d6+3, 4d6 k3, help)",
    max_length: 500,
    required: true,
  },
  {
    type: 5,
    name: "비공개",
    description: "주사위 결과를 나에게만 표시합니다",
    required: false,
  },
];

/** `/roll` — Dice Maiden 계열 핵심 주사위 문법 처리 */
const ROLL_CMD = {
  type: 1 as const,
  name: ROLL_NAME,
  description: "Dice Maiden 문법으로 TRPG 주사위 식을 굴립니다",
  default_member_permissions: null,
  options: DICE_ROLL_OPTIONS,
};

/** `/r` — `/roll` 단축 명령 */
const ROLL_SHORT_CMD = {
  type: 1 as const,
  name: ROLL_SHORT_NAME,
  description: "빠르게 TRPG 주사위를 굴립니다 (/roll 단축 명령)",
  default_member_permissions: null,
  options: DICE_ROLL_OPTIONS,
};

const HELP_CMD = {
  type: 1 as const,
  name: HELP_NAME,
  description: "다채봇의 세션·주사위·음악 명령 사용법과 실행 예시를 확인합니다",
  default_member_permissions: null,
  options: [
    {
      type: 3 as const,
      name: HELP_TOPIC_OPTION,
      description: "자세히 확인할 기능을 선택합니다 (미입력 시 전체)",
      required: false,
      choices: [
        { name: "전체 명령", value: HelpTopic.all },
        { name: "세션 확인", value: HelpTopic.session },
        { name: "주사위", value: HelpTopic.dice },
        { name: "YouTube 음악", value: HelpTopic.music },
      ],
    },
  ],
} as const;

const MUSIC_COMMAND = {
  type: 1 as const,
  name: MUSIC_ROOT,
  description: "YouTube 음악을 재생하고 대기열과 음성 연결을 제어합니다",
  default_member_permissions: null,
  options: [
    {
      type: 1 as const,
      name: MusicSubcommand.play,
      description: "YouTube 링크나 검색어를 재생하거나 대기열에 추가합니다",
      options: [
        {
          type: 3 as const,
          name: MUSIC_QUERY_OPTION,
          description: "YouTube 영상 링크 또는 제목·검색어 (항상 한 곡만 추가)",
          min_length: 1,
          max_length: 200,
          required: true,
        },
      ],
    },
    {
      type: 1 as const,
      name: MusicSubcommand.playlist,
      description: "YouTube 재생목록을 순서대로 최대 50곡까지 추가합니다",
      options: [
        {
          type: 3 as const,
          name: MUSIC_PLAYLIST_OPTION,
          description: "list 식별자가 포함된 YouTube 재생목록 링크를 입력합니다",
          min_length: 1,
          max_length: 500,
          required: true,
        },
      ],
    },
    {
      type: 1 as const,
      name: MusicSubcommand.pause,
      description: "현재 재생 중인 음악을 잠시 멈춥니다",
    },
    {
      type: 1 as const,
      name: MusicSubcommand.resume,
      description: "일시정지한 음악을 이어서 재생합니다",
    },
    {
      type: 1 as const,
      name: MusicSubcommand.skip,
      description: "현재 곡을 건너뛰고 다음 곡을 재생합니다",
    },
    {
      type: 1 as const,
      name: MusicSubcommand.repeat,
      description: "반복 재생을 끄거나 현재 곡·대기열 전체 반복을 선택합니다",
      options: [
        {
          type: 3 as const,
          name: MUSIC_REPEAT_MODE_OPTION,
          description: "현재 음악 세션에 적용할 반복 재생 방식을 선택합니다",
          required: true,
          choices: [
            { name: "끔", value: MusicRepeatMode.off },
            { name: "현재 곡", value: MusicRepeatMode.track },
            { name: "대기열 전체", value: MusicRepeatMode.queue },
          ],
        },
      ],
    },
    {
      type: 1 as const,
      name: MusicSubcommand.reset,
      description: "현재 곡·예약곡·처리 중 요청·반복 설정을 모두 초기화합니다",
    },
    {
      type: 1 as const,
      name: MusicSubcommand.queue,
      description: "현재 곡과 다음 재생 목록 및 음질 경로를 확인합니다",
    },
    {
      type: 1 as const,
      name: MusicSubcommand.leave,
      description: "재생과 대기열을 정리하고 음성 채널에서 나갑니다",
    },
  ],
} as const;

/** Discord에 현재 등록하는 전체 명령 payload. */
export const ACTIVE_COMMANDS = [
  SESSION_CHECK_CMD,
  ROLL_CMD,
  ROLL_SHORT_CMD,
  HELP_CMD,
  MUSIC_COMMAND,
] as const;

/**
 * 슬래시 커맨드를 Discord 에 등록합니다.
 *
 * `config.guildId` 가 설정되어 있으면 길드 단위 등록(개발 즉시 반영), 없으면
 * 전역 등록(반영까지 최대 1시간).
 */
export async function registerCommands(): Promise<void> {
  const rest = new REST().setToken(config.discordToken);
  if (config.guildId) {
    await rest.put(
      Routes.applicationGuildCommands(config.discordClientId, config.guildId),
      { body: ACTIVE_COMMANDS },
    );
  } else {
    await rest.put(Routes.applicationCommands(config.discordClientId), {
      body: ACTIVE_COMMANDS,
    });
  }
}
