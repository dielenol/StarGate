/**
 * 슬래시 커맨드 등록
 *
 * Discord REST API 로 활성 슬래시 커맨드를 등록합니다. 모든 명령은 운영 길드
 * 전용이라 `contexts: [Guild]` 로 DM·그룹 DM 노출을 막고, 런타임에서도
 * `TRPG_GUILD_ID` 로 한 번 더 확인합니다.
 *
 * @module commands/register
 */

import { PermissionFlagsBits, REST, Routes } from "discord.js";

import { config } from "../config.js";
import {
  DEFAULT_VOLUME_PERCENT,
  MAX_VOLUME_PERCENT,
  MIN_VOLUME_PERCENT,
  MusicRepeatMode,
} from "../music/types.js";
import {
  DEFAULT_POLL_DURATION_HOURS,
  MAX_POLL_DURATION_HOURS,
} from "../services/schedule-poll.js";
import {
  HELP_NAME,
  HELP_TOPIC_OPTION,
  HelpTopic,
  MUSIC_PLAYLIST_OPTION,
  MUSIC_QUERY_OPTION,
  MUSIC_REMOVE_POSITION_OPTION,
  MUSIC_REPEAT_MODE_OPTION,
  MUSIC_VOLUME_OPTION,
  MUSIC_ROOT,
  MusicSubcommand,
  MY_SESSIONS_LIMIT_OPTION,
  MY_SESSIONS_NAME,
  ROLL_NAME,
  ROLL_SHORT_NAME,
  SCHEDULE_POLL_DATE_OPTIONS,
  SCHEDULE_POLL_DURATION_OPTION,
  SCHEDULE_POLL_MULTISELECT_OPTION,
  SCHEDULE_POLL_NAME,
  SCHEDULE_POLL_TIME_OPTION,
  SCHEDULE_POLL_TITLE_OPTION,
  SECRET_ROLL_NAME,
  SECRET_ROLL_SHOW_ME_OPTION,
  SECRET_ROLL_TARGET_OPTION,
  SESSION_CHECK_MINE_OPTION,
  SESSION_CHECK_NAME,
  STATUS_NAME,
} from "../slash/ko-names.js";

const CURRENT_YEAR = 2026;

/** InteractionContextType.Guild — 서버 채널에서만 명령 목록에 노출 */
const GUILD_ONLY_CONTEXTS = [0];

/** `/세션확인` — 선택한 달의 TRPG 세션 일정과 캘린더를 응답 */
const SESSION_CHECK_CMD = {
  type: 1 as const,
  name: SESSION_CHECK_NAME,
  description: "선택한 달의 TRPG 세션 일정·월간 캘린더·웹 링크를 확인합니다",
  default_member_permissions: null,
  contexts: GUILD_ONLY_CONTEXTS,
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
      name: SESSION_CHECK_MINE_OPTION,
      description: "내가 참가하거나 진행하는 세션만 캘린더에 표시합니다",
      required: false,
    },
    {
      type: 5,
      name: "비공개",
      description: "명령 결과를 나에게만 표시합니다",
      required: false,
    },
  ],
};

/** `/내세션` — 내가 참가하거나 진행하는 다가오는 세션 (비공개) */
const MY_SESSIONS_CMD = {
  type: 1 as const,
  name: MY_SESSIONS_NAME,
  description: "내가 참가하거나 진행하는 다가오는 TRPG 세션을 나에게만 보여 줍니다",
  default_member_permissions: null,
  contexts: GUILD_ONLY_CONTEXTS,
  options: [
    {
      type: 4,
      name: MY_SESSIONS_LIMIT_OPTION,
      description: "보여 줄 세션 수 (1-10, 미입력 시 5개)",
      min_value: 1,
      max_value: 10,
      required: false,
    },
  ],
};

/** `/일정투표` — 후보 날짜로 Discord 투표를 열고 마감 뒤 결과를 답장 */
const SCHEDULE_POLL_CMD = {
  type: 1 as const,
  name: SCHEDULE_POLL_NAME,
  description: "후보 날짜로 투표를 열고 마감 뒤 가장 많은 표를 받은 날짜를 알려 줍니다",
  default_member_permissions: null,
  contexts: GUILD_ONLY_CONTEXTS,
  options: [
    // Discord 규칙상 필수 옵션(후보 2개)이 선택 옵션보다 앞에 와야 한다.
    ...SCHEDULE_POLL_DATE_OPTIONS.map((name, index) => ({
      type: 3,
      name,
      description:
        index < 2
          ? "후보 날짜 (예: 2026-11-08, 11-08, 11-08 20:00)"
          : "추가 후보 날짜 (예: 11-15 또는 11-15 20:00)",
      max_length: 16,
      required: index < 2,
    })),
    {
      type: 3,
      name: SCHEDULE_POLL_TIME_OPTION,
      description: "공통 시작 시각 HH:mm — 시각을 적지 않은 후보에 붙입니다",
      max_length: 5,
      required: false,
    },
    {
      type: 3,
      name: SCHEDULE_POLL_TITLE_OPTION,
      description: "투표 질문 (미입력 시 '다음 세션 날짜 투표')",
      max_length: 200,
      required: false,
    },
    {
      type: 4,
      name: SCHEDULE_POLL_DURATION_OPTION,
      description: `투표 기간(시간) 1-${MAX_POLL_DURATION_HOURS}, 미입력 시 ${DEFAULT_POLL_DURATION_HOURS}시간`,
      min_value: 1,
      max_value: MAX_POLL_DURATION_HOURS,
      required: false,
    },
    {
      type: 5,
      name: SCHEDULE_POLL_MULTISELECT_OPTION,
      description: "여러 날짜에 표를 줄 수 있게 합니다 (미입력 시 켜짐)",
      required: false,
    },
  ],
};

/** `/상태` — 운영자용 봇 진단 (서버 관리 권한자에게만 명령 목록에 보임) */
const STATUS_CMD = {
  type: 1 as const,
  name: STATUS_NAME,
  description: "봇 연결·알림 스케줄러·음악 점검 상태를 확인합니다 (서버 관리 권한 필요)",
  default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
  contexts: GUILD_ONLY_CONTEXTS,
  options: [],
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
  contexts: GUILD_ONLY_CONTEXTS,
  options: DICE_ROLL_OPTIONS,
};

/** `/r` — `/roll` 단축 명령 */
const ROLL_SHORT_CMD = {
  type: 1 as const,
  name: ROLL_SHORT_NAME,
  description: "빠르게 TRPG 주사위를 굴립니다 (/roll 단축 명령)",
  default_member_permissions: null,
  contexts: GUILD_ONLY_CONTEXTS,
  options: DICE_ROLL_OPTIONS,
};

/** `/비밀굴림` — 결과를 지정한 사람에게만 DM 으로 */
const SECRET_ROLL_CMD = {
  type: 1 as const,
  name: SECRET_ROLL_NAME,
  description: "주사위 결과를 지정한 사람(예: 마스터)에게만 DM으로 보냅니다",
  default_member_permissions: null,
  contexts: GUILD_ONLY_CONTEXTS,
  options: [
    {
      type: 3,
      name: "식",
      description: "굴릴 주사위 식 (예: 1d100 <= 65, 2d6+3)",
      max_length: 500,
      required: true,
    },
    {
      type: 6,
      name: SECRET_ROLL_TARGET_OPTION,
      description: "결과를 받을 서버 멤버 (보통 이번 세션의 마스터)",
      required: true,
    },
    {
      type: 5,
      name: SECRET_ROLL_SHOW_ME_OPTION,
      description: "보낸 결과를 나에게도 비공개로 보여 줍니다",
      required: false,
    },
  ],
};

const HELP_CMD = {
  type: 1 as const,
  name: HELP_NAME,
  description: "다채봇의 세션·주사위·음악 명령 사용법과 실행 예시를 확인합니다",
  default_member_permissions: null,
  contexts: GUILD_ONLY_CONTEXTS,
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
  contexts: GUILD_ONLY_CONTEXTS,
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
      name: MusicSubcommand.volume,
      description: "재생 음량을 조절합니다 (생략하면 현재 음량을 확인합니다)",
      options: [
        {
          type: 4 as const,
          name: MUSIC_VOLUME_OPTION,
          description: `음량 %. ${MIN_VOLUME_PERCENT}~${MAX_VOLUME_PERCENT}, 기본 ${DEFAULT_VOLUME_PERCENT}`,
          required: false,
          min_value: MIN_VOLUME_PERCENT,
          max_value: MAX_VOLUME_PERCENT,
        },
      ],
    },
    {
      type: 1 as const,
      name: MusicSubcommand.shuffle,
      description: "현재 곡을 뺀 예약곡의 재생 순서를 무작위로 섞습니다",
    },
    {
      type: 1 as const,
      name: MusicSubcommand.remove,
      description: "대기열 번호로 예약곡 하나를 대기열에서 뺍니다",
      options: [
        {
          type: 4 as const,
          name: MUSIC_REMOVE_POSITION_OPTION,
          description: "뺄 예약곡 번호 (/음악 대기열에 표시된 번호)",
          required: true,
          min_value: 1,
          max_value: 100,
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
  MY_SESSIONS_CMD,
  SCHEDULE_POLL_CMD,
  ROLL_CMD,
  ROLL_SHORT_CMD,
  SECRET_ROLL_CMD,
  HELP_CMD,
  MUSIC_COMMAND,
  STATUS_CMD,
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
