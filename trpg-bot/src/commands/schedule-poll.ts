/**
 * `/일정투표` 슬래시 핸들러
 *
 * 후보 날짜 2-10개로 Discord 기본 투표를 열고, 마감되면 가장 많은 표를 받은 날짜와
 * 그 날짜로 열리는 웹 캘린더 링크를 투표에 답장한다. 세션은 만들지 않는다.
 *
 * 권한: 봇은 해당 채널에서 `투표 만들기(Send Polls)` 외에 마감 답장을 위해 채널 보기·
 * 메시지 기록 보기·메시지 보내기(스레드면 스레드에서 메시지 보내기)가 필요하다.
 * 명령을 쓴 멤버에게도 `투표 만들기` 권한이 있어야 한다(봇을 통한 권한 우회 방지).
 *
 * @module commands/schedule-poll
 */

import { MessageFlags, PermissionFlagsBits } from "discord.js";

import type { ChatInputCommandInteraction } from "discord.js";
import type { SchedulePollJob } from "../services/schedule-poll.js";

import { config } from "../config.js";
import {
  DEFAULT_POLL_DURATION_HOURS,
  MAX_POLL_DURATION_HOURS,
  SchedulePollInputError,
  formatScheduleCandidate,
  parseScheduleCandidates,
  scheduleSchedulePollFinalization,
} from "../services/schedule-poll.js";
import {
  SCHEDULE_POLL_DATE_OPTIONS,
  SCHEDULE_POLL_DURATION_OPTION,
  SCHEDULE_POLL_MULTISELECT_OPTION,
  SCHEDULE_POLL_TIME_OPTION,
  SCHEDULE_POLL_TITLE_OPTION,
} from "../slash/ko-names.js";
import { kstDateKey, nowKstYmd } from "../utils/kst.js";

import { escapeMarkdownText, getInteractionDisplayName } from "./dice-roll.js";

const DEFAULT_POLL_TITLE = "다음 세션 날짜 투표";
const POLL_QUESTION_MAX = 300;

async function replyPrivate(
  interaction: ChatInputCommandInteraction,
  content: string,
): Promise<void> {
  await interaction.reply({
    content,
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

export async function handleSchedulePoll(
  interaction: ChatInputCommandInteraction,
  {
    scheduleFinalization = scheduleSchedulePollFinalization,
    now = Date.now,
  }: {
    scheduleFinalization?: typeof scheduleSchedulePollFinalization;
    now?: () => number;
  } = {},
): Promise<void> {
  if (!interaction.inGuild() || interaction.guildId !== config.trpgGuildId) {
    await replyPrivate(interaction, "이 서버에서는 `/일정투표` 명령을 사용할 수 없습니다.");
    return;
  }
  const botRequired = [
    PermissionFlagsBits.SendPolls,
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.ReadMessageHistory,
    interaction.channel?.isThread()
      ? PermissionFlagsBits.SendMessagesInThreads
      : PermissionFlagsBits.SendMessages,
  ];
  if (!interaction.appPermissions?.has(botRequired)) {
    await replyPrivate(
      interaction,
      "이 채널에서 봇에게 `투표 만들기`·`채널 보기`·`메시지 기록 보기`·`메시지 보내기` 권한이 없어 투표를 열 수 없습니다. 운영자에게 권한을 요청해 주세요.",
    );
    return;
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.SendPolls)) {
    await replyPrivate(interaction, "이 채널에서 투표를 만들 권한이 없습니다.");
    return;
  }

  let candidates;
  try {
    candidates = parseScheduleCandidates(
      SCHEDULE_POLL_DATE_OPTIONS.map(
        (name) => interaction.options.getString(name) ?? "",
      ),
      {
        todayKey: kstDateKey(nowKstYmd(new Date(now()))),
        defaultTime: interaction.options.getString(SCHEDULE_POLL_TIME_OPTION),
      },
    );
  } catch (error) {
    if (error instanceof SchedulePollInputError) {
      await replyPrivate(interaction, error.message);
      return;
    }
    throw error;
  }

  const title = (
    interaction.options.getString(SCHEDULE_POLL_TITLE_OPTION)?.trim() ||
    DEFAULT_POLL_TITLE
  ).slice(0, POLL_QUESTION_MAX);
  const durationHours = Math.min(
    MAX_POLL_DURATION_HOURS,
    Math.max(
      1,
      interaction.options.getInteger(SCHEDULE_POLL_DURATION_OPTION) ??
        DEFAULT_POLL_DURATION_HOURS,
    ),
  );
  const allowMultiselect =
    interaction.options.getBoolean(SCHEDULE_POLL_MULTISELECT_OPTION) ?? true;
  const requester = escapeMarkdownText(getInteractionDisplayName(interaction));

  const response = await interaction.reply({
    content: `🗳️ **${requester}**님이 일정 투표를 열었습니다. 마감되면 가장 많은 표를 받은 날짜와 웹 캘린더 링크를 이 투표에 답장으로 알려 드립니다. 그 사이 봇이 재시작되면 결과 답장이 빠질 수 있습니다.`,
    poll: {
      question: { text: title },
      answers: candidates.map((candidate) => ({
        text: formatScheduleCandidate(candidate),
      })),
      duration: durationHours,
      allowMultiselect,
    },
    allowedMentions: { parse: [] },
    withResponse: true,
  });

  const message = response.resource?.message;
  if (!message) return;
  const job: SchedulePollJob = {
    channelId: message.channelId,
    messageId: message.id,
    title: escapeMarkdownText(title),
    candidates,
    expiresAt: message.poll?.expiresTimestamp ?? now() + durationHours * 3_600_000,
  };
  scheduleFinalization(interaction.client, job, {
    baseUrl: config.trpgWebBaseUrl,
    now,
  });
}
