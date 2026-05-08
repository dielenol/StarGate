/**
 * 슬래시 커맨드 등록
 *
 * Discord REST API로 `/일정` … 한글 커맨드를 등록합니다. (NOVUS ORDO 레지스트라)
 * @module commands/register
 */

import { ChannelType, PermissionFlagsBits, REST, Routes } from "discord.js";
import { Cmd, Help } from "../constants/registrar-voice.js";
import { config } from "../config.js";
import {
  BALANCE_ROOT,
  CREDIT_ROOT,
  CreditOpt,
  CreditSub,
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
 * `/크레딧` — GM 전용 크레딧 운영 (지급·차감·전체지급·작전 풀 입출금·조회).
 *
 * `default_member_permissions` 에 `ManageGuild` 를 지정해 Discord UI 단계에서 일반
 * 사용자에게는 노출 자체를 차단한다. 본인 잔액 조회는 별도 단일 명령 `/잔액` 으로 분리.
 *
 * 핸들러도 추가로 Admin/ManageGuild 게이트를 걸어 직접 호출 시도 (예: 공격자 client)
 * 까지 방어한다 (defense-in-depth).
 */
const CREDIT_CMD = {
  type: 1 as const,
  name: CREDIT_ROOT,
  description:
    "크레딧 운영 — 지급·차감·작전 풀 입출금·조회 (서버 관리권한 전용).",
  default_member_permissions: String(PermissionFlagsBits.ManageGuild),
  dm_permission: false,
  options: [
    {
      type: 1,
      name: CreditSub.grant,
      description:
        "지정 인원의 메인 캐릭에 크레딧을 지급합니다(관리권한). 사유 표기를 권장드립니다.",
      options: [
        {
          type: 6,
          name: CreditOpt.user,
          description: "지급 대상 인원을 선택해주십시오.",
          required: true,
        },
        {
          type: 4,
          name: CreditOpt.amount,
          description: "지급 금액(CR · 양수). 단일 거래 단위로 기재 부탁드립니다.",
          required: true,
          min_value: 1,
        },
        {
          type: 3,
          name: CreditOpt.reason,
          description: "(선택) 사유. 운영 대장과 캐릭터 ledger 에 함께 기록됩니다.",
          required: false,
        },
      ],
    },
    {
      type: 1,
      name: CreditSub.deduct,
      description:
        "지정 인원의 메인 캐릭에서 크레딧을 차감합니다(관리권한). 음수 잔액 진입을 허용합니다.",
      options: [
        {
          type: 6,
          name: CreditOpt.user,
          description: "차감 대상 인원을 선택해주십시오.",
          required: true,
        },
        {
          type: 4,
          name: CreditOpt.amount,
          description: "차감 금액(양수, CR). 부호 없이 기재해주십시오.",
          required: true,
          min_value: 1,
        },
        {
          type: 3,
          name: CreditOpt.reason,
          description: "(선택) 사유. 운영 대장과 캐릭터 ledger 에 함께 기록됩니다.",
          required: false,
        },
      ],
    },
    {
      type: 1,
      name: CreditSub.grantAll,
      description:
        "ledger 보유 운영 캐릭터 전원에게 동일 금액을 일괄 지급합니다(관리권한).",
      options: [
        {
          type: 4,
          name: CreditOpt.amount,
          description: "1인당 지급 금액(CR · 양수).",
          required: true,
          min_value: 1,
        },
        {
          type: 3,
          name: CreditOpt.reason,
          description: "(선택) 사유. 모든 대상 ledger 에 동일 문구로 기록됩니다.",
          required: false,
        },
      ],
    },
    {
      type: 1,
      name: CreditSub.opGrant,
      description: "작전 크레딧 풀에 입금합니다(관리권한). 사용자 ledger 와는 별도입니다.",
      options: [
        {
          type: 4,
          name: CreditOpt.amount,
          description: "입금 금액(CR · 양수).",
          required: true,
          min_value: 1,
        },
        {
          type: 3,
          name: CreditOpt.reason,
          description: "(선택) 사유.",
          required: false,
        },
      ],
    },
    {
      type: 1,
      name: CreditSub.opDeduct,
      description: "작전 크레딧 풀에서 출금합니다(관리권한). 잔액 부족 시 거부됩니다.",
      options: [
        {
          type: 4,
          name: CreditOpt.amount,
          description: "출금 금액(CR · 양수, 풀 잔액 이하).",
          required: true,
          min_value: 1,
        },
        {
          type: 3,
          name: CreditOpt.reason,
          description: "(선택) 사유.",
          required: false,
        },
      ],
    },
    {
      type: 1,
      name: CreditSub.query,
      description:
        "지정 인원의 메인 캐릭 잔액과 최근 거래 5건을 조회합니다(관리권한).",
      options: [
        {
          type: 6,
          name: CreditOpt.user,
          description: "조회 대상 인원을 선택해주십시오.",
          required: true,
        },
      ],
    },
  ],
};

/**
 * `/잔액` — 본인 메인 캐릭의 잔액 + 최근 거래 5건을 비밀 열람으로 조회 (누구나).
 *
 * 단일 명령(서브커맨드 ❌). `/크레딧` 이 GM 전용으로 잠긴 후에도 일반 사용자가
 * 본인 잔액을 조회할 수 있도록 분리된 진입점.
 */
const BALANCE_CMD = {
  type: 1 as const,
  name: BALANCE_ROOT,
  description: "본인의 메인 캐릭 잔액과 최근 거래 5건을 비밀 열람으로 조회합니다.",
  default_member_permissions: null,
  dm_permission: false,
  options: [],
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
    CREDIT_CMD,
    BALANCE_CMD,
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
