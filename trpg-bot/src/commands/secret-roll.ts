/**
 * `/비밀굴림` 슬래시 핸들러
 *
 * `/roll` 과 같은 주사위 문법으로 굴린 결과를 지정한 대상(보통 마스터)에게만 DM 으로
 * 보낸다. 굴린 사람에게는 전달 여부만(원하면 결과까지) 비공개로 알린다.
 *
 * - 대상이 DM 을 막아 두면 공개 폴백 채널로 보내지 않는다(결과 유출 방지).
 * - 받은 DM 에는 누가(멘션 + 표시 이름)·어느 서버에서 굴렸는지 밝혀, 다른 사람에게
 *   DM 을 보내는 기능이 익명 스팸이나 닉네임 위장으로 쓰이지 않게 한다. 굴린 사람별
 *   쿨다운도 둔다.
 * - DM 전체(머리말 + 결과)는 Discord 메시지 상한 2000자 안에 맞춘다.
 *
 * @module commands/secret-roll
 */

import { MessageFlags } from "discord.js";

import type { ChatInputCommandInteraction, User } from "discord.js";

import { config } from "../config.js";
import {
  SECRET_ROLL_SHOW_ME_OPTION,
  SECRET_ROLL_TARGET_OPTION,
} from "../slash/ko-names.js";
import { DiceRollError, rollDiceExpression } from "../utils/dice-roller.js";
import {
  DISCORD_CANNOT_MESSAGE_USER,
  discordErrorCode,
} from "../utils/dm-with-fallback.js";

import {
  buildDiceRollContent,
  escapeMarkdownText,
  getInteractionDisplayName,
} from "./dice-roll.js";

const SECRET_ROLL_COOLDOWN_MS = 10_000;
const DM_HEAD_NAME_MAX = 40;
/** Discord 메시지 본문 상한 */
const DISCORD_MESSAGE_MAX = 2_000;
/**
 * `나도보기` 응답(`${status}\n\n${rollContent}`)에서 상태 문장이 차지할 최대 길이 —
 * 가장 긴 상태 템플릿("님이 서버 멤버의 DM을 받지 않아 … 공개되지 않았습니다.", 53자)
 * + 이스케이프된 대상 이름 최대 80자(40자 × 마크다운 이스케이프 2배).
 */
const SHOW_ME_STATUS_RESERVE = 53 + DM_HEAD_NAME_MAX * 2;

/** 굴린 사람별 마지막 비밀 굴림 시각 (프로세스 메모리) */
const lastRollAt = new Map<string, number>();

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

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

type SecretRollDmHead = {
  rollerId: string;
  rollerName: string;
  guildName: string;
};

/** DM 머리말 — 굴린 사람을 멘션(위장 불가)과 표시 이름으로, 서버를 이름으로 밝힌다. */
export function buildSecretRollDmHead({
  rollerId,
  rollerName,
  guildName,
}: SecretRollDmHead): string {
  const roller = `<@${rollerId}>(${escapeMarkdownText(truncate(rollerName, DM_HEAD_NAME_MAX))})`;
  return `🔒 **비밀 굴림** — ${roller}님이 ${escapeMarkdownText(truncate(guildName, DM_HEAD_NAME_MAX))}에서 나에게만 보냈습니다.`;
}

/** 머리말을 붙인 뒤 결과에 남는 본문 예산 (줄바꿈 1자 포함) */
export function secretRollContentBudget(head: SecretRollDmHead): number {
  return DISCORD_MESSAGE_MAX - buildSecretRollDmHead(head).length - 1;
}

/** 대상이 받는 DM 본문 — 머리말 + 결과. */
export function buildSecretRollDm({
  rollContent,
  ...head
}: SecretRollDmHead & { rollContent: string }): string {
  return [buildSecretRollDmHead(head), rollContent].join("\n");
}

export async function handleSecretRoll(
  interaction: ChatInputCommandInteraction,
  now: () => number = Date.now,
): Promise<void> {
  if (!interaction.inGuild() || interaction.guildId !== config.trpgGuildId) {
    await replyPrivate(interaction, "이 서버에서는 `/비밀굴림` 명령을 사용할 수 없습니다.");
    return;
  }

  const target: User = interaction.options.getUser(SECRET_ROLL_TARGET_OPTION, true);
  if (target.bot) {
    await replyPrivate(interaction, "봇에게는 비밀 굴림을 보낼 수 없습니다.");
    return;
  }
  if (target.id === interaction.user.id) {
    await replyPrivate(
      interaction,
      "나에게만 보려면 `/roll 비공개:true`를 사용해 주세요.",
    );
    return;
  }
  if (!interaction.options.getMember(SECRET_ROLL_TARGET_OPTION)) {
    await replyPrivate(interaction, "이 서버의 멤버에게만 비밀 굴림을 보낼 수 있습니다.");
    return;
  }

  const last = lastRollAt.get(interaction.user.id);
  const current = now();
  if (last !== undefined && current - last < SECRET_ROLL_COOLDOWN_MS) {
    const waitSeconds = Math.ceil((SECRET_ROLL_COOLDOWN_MS - (current - last)) / 1_000);
    await replyPrivate(
      interaction,
      `비밀 굴림은 ${waitSeconds}초 뒤에 다시 보낼 수 있습니다.`,
    );
    return;
  }

  const rollerName = getInteractionDisplayName(interaction);
  const head: SecretRollDmHead = {
    rollerId: interaction.user.id,
    rollerName,
    guildName: interaction.guild?.name ?? "TRPG 서버",
  };
  const showMe = interaction.options.getBoolean(SECRET_ROLL_SHOW_ME_OPTION) ?? false;
  // 결과 본문은 DM(머리말 + 본문)과 나도보기 응답(상태 + 빈 줄 + 본문) 둘 다에 들어간다.
  const contentBudget = showMe
    ? Math.min(
        secretRollContentBudget(head),
        DISCORD_MESSAGE_MAX - SHOW_ME_STATUS_RESERVE - 2,
      )
    : secretRollContentBudget(head);

  let rollContent: string;
  try {
    const result = rollDiceExpression(interaction.options.getString("식", true));
    rollContent = buildDiceRollContent(result, rollerName, contentBudget);
  } catch (error) {
    if (error instanceof DiceRollError) {
      await replyPrivate(interaction, error.message);
      return;
    }
    // 예상하지 못한 파서 오류 — index.ts 공통 경계가 운영 알림과 오류 응답을 맡는다.
    throw error;
  }

  lastRollAt.set(interaction.user.id, current);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const targetName = escapeMarkdownText(
    truncate(target.globalName ?? target.username, DM_HEAD_NAME_MAX),
  );
  let status = `🔒 ${targetName}님에게 비밀 굴림 결과를 DM으로 보냈습니다.`;
  try {
    await target.send({
      content: buildSecretRollDm({ ...head, rollContent }),
      allowedMentions: { parse: [] },
      flags: MessageFlags.SuppressEmbeds,
    });
  } catch (error) {
    if (discordErrorCode(error) === DISCORD_CANNOT_MESSAGE_USER) {
      console.warn(`[secret-roll] 대상이 DM 을 받지 않음 target=${target.id}`);
      status = `${targetName}님이 서버 멤버의 DM을 받지 않아 전달하지 못했습니다. 결과는 아무에게도 공개되지 않았습니다.`;
    } else {
      // 네트워크·5xx 등 — 운영 알림 경계로 올리지 않고 굴린 사람에게만 알린다.
      console.error(`[secret-roll] DM 전달 실패 target=${target.id}:`, error);
      status =
        "일시 오류로 전달하지 못했습니다. 결과는 아무에게도 공개되지 않았습니다.";
    }
  }

  await interaction.editReply({
    content: showMe ? `${status}\n\n${rollContent}` : status,
    allowedMentions: { parse: [] },
  });
}
