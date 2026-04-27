/**
 * 슬래시 커맨드 등록
 *
 * Discord REST API로 `/일정` … 한글 커맨드를 등록합니다. (NOVUS ORDO 레지스트라)
 * @module commands/register
 */

import { ChannelType, REST, Routes } from "discord.js";
import { Cmd, Help } from "../constants/registrar-voice.js";
import { config } from "../config.js";
import {
  HELP_ROOT_EN,
  HELP_ROOT_KO,
  INFO_ROOT_EN,
  INFO_ROOT_KO,
  Opt,
  SCHEDULE_ROOT,
  Sub,
} from "../slash/ko-names.js";

/** /일정 … 명령어 정의 */
const SCHEDULE_CMD = {
  name: SCHEDULE_ROOT,
  description: Cmd.root,
  default_member_permissions: null,
  options: [
    {
      name: Sub.participationCheck,
      description: Cmd.participation,
      type: 1,
      options: [],
    },
    {
      name: Sub.create,
      description: Cmd.create,
      type: 1,
      options: [
        {
          name: Opt.title,
          description: Cmd.optTitle,
          type: 3,
          required: true,
          autocomplete: true,
        },
        {
          name: Opt.date,
          description: Cmd.optDate,
          type: 3,
          required: true,
          autocomplete: true,
        },
        {
          name: Opt.closeTime,
          description: Cmd.optClose,
          type: 3,
          required: true,
          autocomplete: true,
        },
        {
          name: Opt.role,
          description: Cmd.optRole,
          type: 3,
          required: true,
          autocomplete: true,
        },
        {
          name: Opt.channel,
          description: Cmd.optChannel,
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
      description: Cmd.list,
      type: 1,
      options: [],
    },
    {
      name: Sub.overview,
      description: Cmd.overview,
      type: 1,
      options: [],
    },
    {
      name: Sub.calendar,
      description: Cmd.calendar,
      type: 1,
      options: [
        {
          name: Opt.month,
          description: Cmd.optMonth,
          type: 4,
          required: true,
          min_value: 1,
          max_value: 12,
        },
        {
          name: Opt.channel,
          description: Cmd.optChannel,
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
      description: Cmd.result,
      type: 1,
      options: [
        {
          name: Opt.registrationId,
          description: Cmd.optRegId,
          type: 3,
          required: false,
        },
        {
          name: Opt.withImage,
          description: Cmd.optWithImage,
          type: 5,
          required: false,
        },
        {
          name: Opt.channel,
          description: Cmd.optChannel,
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
      description: Cmd.close,
      type: 1,
      options: [
        {
          name: Opt.registrationId,
          description: Cmd.optRegIdClose,
          type: 3,
          required: false,
        },
      ],
    },
    {
      name: Sub.editClose,
      description: Cmd.editClose,
      type: 1,
      options: [
        {
          name: Opt.newClose,
          description: Cmd.optNewClose,
          type: 3,
          required: true,
          autocomplete: true,
        },
        {
          name: Opt.registrationId,
          description: Cmd.optRegIdClose,
          type: 3,
          required: false,
        },
      ],
    },
    {
      name: Sub.editDate,
      description: Cmd.editDate,
      type: 1,
      options: [
        {
          name: Opt.newDate,
          description: Cmd.optNewDate,
          type: 3,
          required: true,
          autocomplete: true,
        },
        {
          name: Opt.registrationId,
          description: Cmd.optRegIdClose,
          type: 3,
          required: false,
        },
      ],
    },
    {
      name: Sub.cancel,
      description: Cmd.cancel,
      type: 1,
      options: [
        {
          name: Opt.registrationId,
          description: Cmd.optRegIdClose,
          type: 3,
          required: false,
        },
        {
          name: Opt.reason,
          description: Cmd.optCancelReason,
          type: 3,
          required: false,
        },
      ],
    },
  ],
};

/** `/참여확인` 최상위 — `/일정`이 연동 권한으로 가려져도 플레이어가 호출 가능 */
const PARTICIPATION_ROOT_CMD = {
  type: 1 as const,
  name: Sub.participationCheck,
  description: Cmd.participation,
  default_member_permissions: null,
};

/** `/도움말` — 한국어 사용자용 도움말 루트. DM에서는 `/참여확인` 안내가 작동 안 하므로 길드 전용 */
const HELP_KO_CMD = {
  type: 1 as const,
  name: HELP_ROOT_KO,
  description: Help.cmd,
  default_member_permissions: null,
  dm_permission: false,
};

/** `/help` — 영어 alias. `/도움말`과 동일 핸들러 공유 */
const HELP_EN_CMD = {
  type: 1 as const,
  name: HELP_ROOT_EN,
  description: Help.cmd,
  default_member_permissions: null,
  dm_permission: false,
};

/** `/안내` — 운영자 전용. 채널에 봇 사용 안내 임베드를 영구 게시 */
const INFO_KO_CMD = {
  type: 1 as const,
  name: INFO_ROOT_KO,
  description: Cmd.info,
  default_member_permissions: null,
  dm_permission: false,
  options: [
    {
      name: Opt.channel,
      description: Cmd.optInfoChannel,
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
    {
      name: Opt.pin,
      description: Cmd.optPin,
      type: 5,
      required: false,
    },
  ],
};

/** `/info` — 영어 alias. `/안내`와 동일 핸들러 공유 */
const INFO_EN_CMD = {
  type: 1 as const,
  name: INFO_ROOT_EN,
  description: Cmd.info,
  default_member_permissions: null,
  dm_permission: false,
  options: INFO_KO_CMD.options,
};

/**
 * 슬래시 커맨드를 Discord에 등록합니다.
 */
export async function registerCommands(): Promise<void> {
  const rest = new REST().setToken(config.discordToken);
  const body = [
    SCHEDULE_CMD,
    PARTICIPATION_ROOT_CMD,
    HELP_KO_CMD,
    HELP_EN_CMD,
    INFO_KO_CMD,
    INFO_EN_CMD,
  ];

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
