/**
 * `/roll`, `/r` 슬래시 핸들러
 *
 * Dice Maiden 계열의 핵심 주사위 문법을 처리합니다.
 *
 * @module commands/dice-roll
 */

import { MessageFlags } from "discord.js";

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
  type DiceRollResult,
} from "../utils/dice-roller.js";

const MAX_MESSAGE_LENGTH = 1900;
const MAX_LISTED_ROLLS = 12;

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

function escapeMarkdownText(value: string): string {
  return value.replace(/([\\*_`~|])/g, "\\$1");
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function inlineCode(value: string): string {
  return `\`${escapeInlineCode(value)}\``;
}

function formatRollValuesForMessage(values: string): string {
  if (values.includes("~~") || values.startsWith("(")) return values;
  return inlineCode(values);
}

function getInteractionDisplayName(
  interaction: ChatInputCommandInteraction,
): string {
  const member = interaction.member;
  if (member && "displayName" in member && typeof member.displayName === "string") {
    return member.displayName;
  }
  if (member && "nick" in member && typeof member.nick === "string" && member.nick) {
    return member.nick;
  }
  return interaction.user.globalName ?? interaction.user.username;
}

function formatRollValues(roll: DiceRollResult["rolls"][number]): string {
  if (roll.details.length === 1) return roll.details[0].values;
  return roll.details
    .map((detail) => `${detail.notation} ${detail.values}`)
    .join(" + ");
}

function formatRollLine({
  roll,
  index,
  totalRolls,
  simplified,
}: {
  roll: DiceRollResult["rolls"][number];
  index: number;
  totalRolls: number;
  simplified: boolean;
}): string {
  const label = totalRolls === 1 ? "Roll" : `Roll #${index + 1}`;
  const total = `**${formatDiceTotal(roll.total)}**`;
  if (simplified) return `${label}: ${total}`;

  const values = formatRollValuesForMessage(formatRollValues(roll));
  return `${label}: ${values} = ${total}`;
}

function buildDiceRollContent(
  result: DiceRollResult,
  displayName: string,
): string {
  const request = inlineCode(truncateText(result.rawInput, 160));
  const name = escapeMarkdownText(truncateText(displayName, 40));
  const head = `🎲 ${name} Request: ${request}`;

  if (result.rolls.length === 1) {
    const line = formatRollLine({
      roll: result.rolls[0],
      index: 0,
      totalRolls: 1,
      simplified: result.flags.simplified,
    });
    const comment = result.comment
      ? ` Note: ${truncateText(result.comment, 160)}`
      : "";
    return truncateText(`${head} ${line}${comment}`, MAX_MESSAGE_LENGTH);
  }

  const lines = [head];
  const listed = result.rolls.slice(0, MAX_LISTED_ROLLS);
  for (const [index, roll] of listed.entries()) {
    lines.push(
      formatRollLine({
        roll,
        index,
        totalRolls: result.rolls.length,
        simplified: result.flags.simplified,
      }),
    );
  }

  const rest = result.rolls.length - listed.length;
  if (rest > 0) {
    lines.push(`... 외 ${rest}개 생략`);
  }
  if (result.comment) {
    lines.push(`Note: ${truncateText(result.comment, 160)}`);
  }

  return truncateText(lines.join("\n"), MAX_MESSAGE_LENGTH);
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
      content: buildDiceRollContent(result, getInteractionDisplayName(interaction)),
      allowedMentions: { parse: [] },
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
