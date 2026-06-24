/**
 * `/roll`, `/r` 슬래시 핸들러
 *
 * Dice Maiden 계열의 핵심 주사위 문법을 처리합니다.
 *
 * @module commands/dice-roll
 */

import { EmbedBuilder, MessageFlags } from "discord.js";

import type {
  ChatInputCommandInteraction,
  InteractionReplyOptions,
} from "discord.js";

import { config } from "../config.js";
import { ROLL_NAME, ROLL_SHORT_NAME } from "../slash/ko-names.js";
import {
  DiceRollError,
  formatDiceTotal,
  rollDiceExpression,
  type DiceRollDetail,
  type DiceRollFlags,
  type DiceRollResult,
} from "../utils/dice-roller.js";

const DICE_EMBED_COLOR = 0x7c6f57;
const MAX_FIELD_COUNT = 20;
const EMBED_FIELD_VALUE_MAX = 1024;
const EMBED_FIELD_NAME_MAX = 256;

const HELP_TEXT = [
  "사용: `/roll 식:2d6+3` 또는 `/r 식:4d6 k3`",
  "기본: `XdY`, `d20`, `d%`, `+ - * /`, 괄호, `;` 여러 식",
  "옵션: `e/ie` 폭발, `k/kl/d` keep/drop, `r/ir` 리롤, `t/f/b` 성공/실패",
  "플래그: `s` 간단히, `nr` 개별 결과 숨김, `p` 비공개, `ul` 입력 순서 유지",
  "예시: `1d20+5`, `10d6 e6 k8 +4`, `6d10 t7`, `6 4d6 k3`, `+d20`",
].join("\n");

export function isDiceRollCommandName(commandName: string): boolean {
  return commandName === ROLL_NAME || commandName === ROLL_SHORT_NAME;
}

function escapeInlineCode(value: string): string {
  return value.replace(/`/g, "'");
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function formatDetail(detail: DiceRollDetail): string {
  const label =
    detail.mode === "success"
      ? "성공"
      : detail.mode === "botch"
        ? "봇치"
        : "합계";
  return `\`${escapeInlineCode(detail.notation)}\` ${detail.values} = ${label} ${formatDiceTotal(detail.total)}`;
}

function formatRollFieldValue(
  roll: DiceRollResult["rolls"][number],
  flags: DiceRollFlags,
): string {
  if (flags.simplified) {
    return `총합: **${formatDiceTotal(roll.total)}**`;
  }

  const detailLines = roll.details.map(formatDetail);
  return truncate(
    [...detailLines, `총합: **${formatDiceTotal(roll.total)}**`].join("\n"),
    EMBED_FIELD_VALUE_MAX,
  );
}

function buildDiceRollEmbed(result: DiceRollResult): EmbedBuilder {
  const totals = result.rolls.map((roll, index) => {
    const prefix = result.rolls.length === 1 ? "" : `#${index + 1} `;
    return `${prefix}**${formatDiceTotal(roll.total)}**`;
  });

  const description = [
    `입력: \`${escapeInlineCode(result.rawInput)}\``,
    result.comment ? `메모: ${result.comment}` : null,
    `결과: ${totals.join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");

  const embed = new EmbedBuilder()
    .setColor(DICE_EMBED_COLOR)
    .setTitle("주사위 결과")
    .setDescription(description)
    .setTimestamp();

  const listed = result.rolls.slice(0, MAX_FIELD_COUNT);
  for (const [index, roll] of listed.entries()) {
    const name =
      result.rolls.length === 1
        ? roll.expression
        : `${String(index + 1).padStart(2, "0")}. ${roll.expression}`;
    embed.addFields({
      name: truncate(name, EMBED_FIELD_NAME_MAX),
      value: formatRollFieldValue(roll, result.flags),
      inline: false,
    });
  }

  const rest = result.rolls.length - listed.length;
  if (rest > 0) {
    embed.addFields({
      name: "더 보기",
      value: `외 ${rest}개 결과는 생략했습니다.`,
      inline: false,
    });
  }

  return embed;
}

async function replyEphemeral(
  interaction: ChatInputCommandInteraction,
  content: string,
): Promise<void> {
  await interaction.reply({
    content,
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleDiceRoll(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.inGuild()) {
    await replyEphemeral(interaction, "이 명령어는 길드 채널에서만 사용할 수 있습니다.");
    return;
  }

  if (interaction.guildId !== config.trpgGuildId) {
    await replyEphemeral(interaction, "이 길드에서는 주사위 명령을 사용할 수 없습니다.");
    return;
  }

  const expression = interaction.options.getString("식", true);
  if (expression.trim().toLowerCase() === "help") {
    await replyEphemeral(interaction, HELP_TEXT);
    return;
  }

  try {
    const result = rollDiceExpression(expression);
    const privateReply =
      (interaction.options.getBoolean("비공개") ?? false) || result.flags.private;
    const reply: InteractionReplyOptions = {
      embeds: [buildDiceRollEmbed(result)],
    };
    if (privateReply) {
      reply.flags = MessageFlags.Ephemeral;
    }
    await interaction.reply(reply);
  } catch (err) {
    if (err instanceof DiceRollError) {
      await replyEphemeral(interaction, err.message);
      return;
    }
    console.error("[dice-roll] 처리 실패:", err);
    await replyEphemeral(interaction, "주사위를 굴리는 중 오류가 발생했습니다.");
  }
}
