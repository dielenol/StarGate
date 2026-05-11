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
import { SESSION_CHECK_NAME } from "../slash/ko-names.js";

/** `/세션확인` — 이번 달 TRPG 세션 일정을 PNG + 웹 링크로 응답 */
const SESSION_CHECK_CMD = {
  type: 1 as const,
  name: SESSION_CHECK_NAME,
  description:
    "이번 달 TRPG 세션 일정을 PNG로 보여주고 웹 캘린더 링크를 첨부합니다",
  default_member_permissions: null,
  options: [],
};

/**
 * 슬래시 커맨드를 Discord 에 등록합니다.
 *
 * `config.guildId` 가 설정되어 있으면 길드 단위 등록(개발 즉시 반영), 없으면
 * 전역 등록(반영까지 최대 1시간).
 */
export async function registerCommands(): Promise<void> {
  const rest = new REST().setToken(config.discordToken);
  const body = [SESSION_CHECK_CMD];

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
