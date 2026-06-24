/**
 * 슬래시 커맨드 등록
 *
 * Discord REST API 로 슬래시 커맨드를 등록합니다.
 *
 * Phase 2 부터 `/일정` 루트와 `/참여확인` 단독 커맨드 등록은 해제되었습니다.
 * 신규 `/세션확인` 1 개만 등록합니다 — 기존 핸들러 코드는 비활성 상태로
 * 코드만 보존되어 있습니다 (호출처 없음).
 *
 * @module commands/register
 */

import { REST, Routes } from "discord.js";

import { config } from "../config.js";
import {
  ROLL_NAME,
  ROLL_SHORT_NAME,
  SESSION_CHECK_NAME,
} from "../slash/ko-names.js";

const CURRENT_YEAR = 2026;

/** `/세션확인` — 이번 달 TRPG 세션 일정을 PNG + 웹 링크로 응답 */
const SESSION_CHECK_CMD = {
  type: 1 as const,
  name: SESSION_CHECK_NAME,
  description:
    "이번 달 TRPG 세션 일정을 PNG로 보여주고 웹 캘린더 링크를 첨부합니다",
  default_member_permissions: null,
  options: [
    {
      type: 4,
      name: "연도",
      description: "조회할 연도",
      min_value: CURRENT_YEAR,
      max_value: 2100,
      required: false,
    },
    {
      type: 4,
      name: "월",
      description: "조회할 월",
      min_value: 1,
      max_value: 12,
      required: false,
    },
    {
      type: 3,
      name: "모드",
      description: "출력 상세도",
      required: false,
      choices: [
        { name: "상세", value: "detail" },
        { name: "간단", value: "summary" },
      ],
    },
    {
      type: 5,
      name: "비공개",
      description: "나에게만 보이도록 응답합니다",
      required: false,
    },
  ],
};

const DICE_ROLL_OPTIONS = [
  {
    type: 3,
    name: "식",
    description: "주사위 식. 예: 2d6+3, 4d6 k3, 6d10 t7",
    max_length: 500,
    required: true,
  },
  {
    type: 5,
    name: "비공개",
    description: "나에게만 보이도록 응답합니다",
    required: false,
  },
];

/** `/roll` — Dice Maiden 계열 핵심 주사위 문법 처리 */
const ROLL_CMD = {
  type: 1 as const,
  name: ROLL_NAME,
  description: "TRPG 주사위를 굴립니다",
  default_member_permissions: null,
  options: DICE_ROLL_OPTIONS,
};

/** `/r` — `/roll` 단축 명령 */
const ROLL_SHORT_CMD = {
  type: 1 as const,
  name: ROLL_SHORT_NAME,
  description: "TRPG 주사위를 굴립니다",
  default_member_permissions: null,
  options: DICE_ROLL_OPTIONS,
};

/**
 * 슬래시 커맨드를 Discord 에 등록합니다.
 *
 * `config.guildId` 가 설정되어 있으면 길드 단위 등록(개발 즉시 반영), 없으면
 * 전역 등록(반영까지 최대 1시간).
 */
export async function registerCommands(): Promise<void> {
  const rest = new REST().setToken(config.discordToken);
  const body = config.diceOnly
    ? [ROLL_CMD, ROLL_SHORT_CMD]
    : [SESSION_CHECK_CMD, ROLL_CMD, ROLL_SHORT_CMD];

  if (config.guildId) {
    await rest.put(
      Routes.applicationGuildCommands(config.discordClientId, config.guildId),
      { body },
    );
  } else {
    await rest.put(Routes.applicationCommands(config.discordClientId), {
      body,
    });
  }
}
