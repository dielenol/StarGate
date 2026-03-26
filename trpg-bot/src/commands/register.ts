/**
 * 슬래시 커맨드 등록
 *
 * Discord REST API로 `/일정` … 한글 커맨드를 등록합니다.
 * @module commands/register
 */

import { REST, Routes } from "discord.js";
import { config } from "../config.js";
import { Opt, SCHEDULE_ROOT, Sub } from "../slash/ko-names.js";

/** /일정 … 명령어 정의 */
const SCHEDULE_CMD = {
  name: SCHEDULE_ROOT,
  description: "TRPG 세션 일정·참여 체크",
  options: [
    {
      name: Sub.create,
      description: "새 세션을 만들고 참여 체크 공지를 올립니다. (서버 관리)",
      type: 1,
      options: [
        {
          name: Opt.title,
          description: "세션명",
          type: 3,
          required: true,
        },
        {
          name: Opt.date,
          description:
            "세션 일시 24h (예: 2026-03-22 20:00=저녁8시). 지금 이후만 가능",
          type: 3,
          required: true,
        },
        {
          name: Opt.closeTime,
          description:
            "응답 마감 24h (예: 15:50=오후3시50분, 03:50=새벽). 지금·세션일시 사이",
          type: 3,
          required: true,
        },
        {
          name: Opt.role,
          description: "참여 대상 역할 (역할 ID 또는 @멘션)",
          type: 3,
          required: true,
        },
        {
          name: Opt.channel,
          description: "공지 채널 (채널 ID, 비우면 현재 채널)",
          type: 3,
          required: false,
        },
      ],
    },
    {
      name: Sub.list,
      description: "진행 중(OPEN)만 빠른 목록 (서버 관리)",
      type: 1,
      options: [],
    },
    {
      name: Sub.overview,
      description:
        "OPEN·마감 세션을 세션 일시 기준 월별로 정리 (ID·공지 채널, 서버 관리)",
      type: 1,
      options: [],
    },
    {
      name: Sub.calendar,
      description:
        "올해 지정 월의 세션만 월간 캘린더 PNG (격자만, 서버 관리)",
      type: 1,
      options: [
        {
          name: Opt.month,
          description: "월 1~12 (봇 서버 타임존 기준 올해)",
          type: 4,
          required: true,
          min_value: 1,
          max_value: 12,
        },
      ],
    },
    {
      name: Sub.result,
      description: "한 세션 집계·최종 결과 (서버 관리)",
      type: 1,
      options: [
        {
          name: Opt.sessionId,
          description:
            "세션 ID(한눈에·생성 완료 메시지). OPEN이 여러 개면 필수. 비우면 OPEN 1개·없으면 최근 마감",
          type: 3,
          required: false,
        },
        {
          name: Opt.withImage,
          description: "캘린더형 PNG 첨부 (무거움, 필요할 때만)",
          type: 5,
          required: false,
        },
      ],
    },
    {
      name: Sub.close,
      description: "응답 수집을 강제 마감 (서버 관리)",
      type: 1,
      options: [
        {
          name: Opt.sessionId,
          description:
            "세션 ID. 비우면 이 서버에서 가장 최근 진행 중 세션",
          type: 3,
          required: false,
        },
      ],
    },
    {
      name: Sub.editClose,
      description: "응답 마감 일시 변경 (진행 중, 서버 관리)",
      type: 1,
      options: [
        {
          name: Opt.newClose,
          description:
            "새 응답 마감 24h. 과거·세션일 이후도 저장 가능(안내 문구 확인)",
          type: 3,
          required: true,
        },
        {
          name: Opt.sessionId,
          description: "세션 ID. 비우면 가장 최근 진행 중 세션",
          type: 3,
          required: false,
        },
      ],
    },
    {
      name: Sub.editDate,
      description: "세션 진행 일시 변경 (진행 중, 서버 관리)",
      type: 1,
      options: [
        {
          name: Opt.newDate,
          description:
            "새 세션 일시 24h. 과거 허용. 마감보다 앞이면 마감을 세션 1시간 전으로 자동 조정",
          type: 3,
          required: true,
        },
        {
          name: Opt.sessionId,
          description: "세션 ID. 비우면 가장 최근 진행 중 세션",
          type: 3,
          required: false,
        },
      ],
    },
    {
      name: Sub.cancel,
      description: "세션 취소 (집계 메시지 없음, 서버 관리)",
      type: 1,
      options: [
        {
          name: Opt.sessionId,
          description: "세션 ID. 비우면 가장 최근 진행 중 세션",
          type: 3,
          required: false,
        },
      ],
    },
  ],
};

/**
 * 슬래시 커맨드를 Discord에 등록합니다.
 */
export async function registerCommands(): Promise<void> {
  const rest = new REST().setToken(config.discordToken);
  const body = [SCHEDULE_CMD];

  if (config.guildId) {
    await rest.put(
      Routes.applicationGuildCommands(config.discordClientId, config.guildId),
      { body }
    );
  } else {
    await rest.put(Routes.applicationCommands(config.discordClientId), {
      body,
    });
  }
}
