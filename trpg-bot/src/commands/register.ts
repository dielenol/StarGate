/**
 * 슬래시 커맨드 등록
 *
 * Discord REST API로 `/일정` … 한글 커맨드를 등록합니다.
 * @module commands/register
 */

import { ChannelType, REST, Routes } from "discord.js";
import { config } from "../config.js";
import { Opt, SCHEDULE_ROOT, Sub } from "../slash/ko-names.js";

const PARTICIPATION_DESC =
  "내가 이 서버에서 참석으로 응답한 일정만 (에페메랄). 이번 달 캘린더 PNG는 쿨다운 후에만 첨부";

/** /일정 … 명령어 정의 */
const SCHEDULE_CMD = {
  name: SCHEDULE_ROOT,
  description: "TRPG 세션 일정·참여 체크",
  default_member_permissions: null,
  options: [
    {
      name: Sub.participationCheck,
      description: PARTICIPATION_DESC,
      type: 1,
      options: [],
    },
    {
      name: Sub.create,
      description:
        "새 세션 공지·참여 체크(서버 관리). 제목·일시·마감 자동완성은 참고용 예시이며 직접 입력 가능",
      type: 1,
      options: [
        {
          name: Opt.title,
          description:
            "세션명. 목록은 예시·참고용이며 원하는 문구를 직접 입력해도 됩니다",
          type: 3,
          required: true,
          autocomplete: true,
        },
        {
          name: Opt.date,
          description:
            "세션 일시 24h. 자동완성 시각은 예시·참고, 지금 이후만 (예 20:00=저녁8시)",
          type: 3,
          required: true,
          autocomplete: true,
        },
        {
          name: Opt.closeTime,
          description:
            "응답 마감 24h. 자동완성은 예시·참고, 지금~세션일시 사이 (예 15:50=오후3시50분)",
          type: 3,
          required: true,
          autocomplete: true,
        },
        {
          name: Opt.role,
          description:
            "참여 대상 역할. 자동완성은 길드 역할 검색(예시 목록 아님), ID·@멘션 가능",
          type: 3,
          required: true,
          autocomplete: true,
        },
        {
          name: Opt.channel,
          description:
            "공지를 올릴 채널·스레드 (목록에서 선택, 비우면 명령을 친 채널)",
          type: 7,
          required: false,
          channel_types: [
            ChannelType.GuildText,
            ChannelType.GuildAnnouncement,
            ChannelType.PublicThread,
            ChannelType.PrivateThread,
            ChannelType.AnnouncementThread,
          ],
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
        {
          name: Opt.channel,
          description:
            "달력 PNG를 올릴 채널·스레드 (목록에서 선택, 비우면 명령 채널)",
          type: 7,
          required: false,
          channel_types: [
            ChannelType.GuildText,
            ChannelType.GuildAnnouncement,
            ChannelType.PublicThread,
            ChannelType.PrivateThread,
            ChannelType.AnnouncementThread,
          ],
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
        {
          name: Opt.channel,
          description:
            "집계 임베드·이미지를 올릴 채널·스레드 (비우면 명령 채널)",
          type: 7,
          required: false,
          channel_types: [
            ChannelType.GuildText,
            ChannelType.GuildAnnouncement,
            ChannelType.PublicThread,
            ChannelType.PrivateThread,
            ChannelType.AnnouncementThread,
          ],
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

const PARTICIPATION_ROOT_CMD = {
  type: 1 as const,
  name: Sub.participationCheck,
  description: PARTICIPATION_DESC,
  default_member_permissions: null,
};

/**
 * 슬래시 커맨드를 Discord에 등록합니다.
 */
export async function registerCommands(): Promise<void> {
  const rest = new REST().setToken(config.discordToken);
  const body = [SCHEDULE_CMD, PARTICIPATION_ROOT_CMD];

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
