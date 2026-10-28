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
  type DiceComparisonOperator,
  type DiceRollResult,
} from "../utils/dice-roller.js";

/** Discord 메시지 상한(2000자)보다 여유를 둔 기본 본문 예산 */
export const MAX_MESSAGE_LENGTH = 1900;
const MAX_LISTED_ROLLS = 12;
const MAX_COMMENT_LENGTH = 160;

const COMPARISON_SYMBOL: Record<DiceComparisonOperator, string> = {
  ">=": "≥",
  "<=": "≤",
  ">": ">",
  "<": "<",
  "=": "=",
};

export const DICE_HELP_TEXT = [
  "사용: `/roll 식:2d6+3` 또는 `/r 식:4d6 k3`",
  "기본: `XdY`, `d20`, `d%`, `+ - * /`, 괄호, `;` 여러 식",
  "옵션: `e/ie` 폭발, `k/kl/d` keep/drop, `r/ir` 리롤, `t/f/b` 성공/실패",
  "판정: 식 끝에 `>= <= > < =`와 목표치 — `1d100+10 >= 65`, `2d6 <= 7`",
  "플래그: `s` 간단히, `nr` 개별 결과 숨김, `p` 비공개, `ul` 입력 순서 유지",
  "예시: `1d20+5`, `10d6 e6 k8 +4`, `6d10 t7`, `6 4d6 k3`, `+d20`",
].join("\n");

export function isDiceRollCommandName(commandName: string): boolean {
  return commandName === ROLL_NAME || commandName === ROLL_SHORT_NAME;
}

function escapeInlineCode(value: string): string {
  return value.replace(/`/g, "'");
}

/**
 * 사용자 입력을 봇 메시지에 그대로 렌더하지 않도록 마크다운·마스킹 링크
 * (`[글](주소)`)·멘션(`<@…>`) 문법 문자를 이스케이프한다.
 */
export function escapeMarkdownText(value: string): string {
  return value.replace(/([\\*_`~|[\]()<>])/g, "\\$1");
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

export function getInteractionDisplayName(
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

type DiceRoll = DiceRollResult["rolls"][number];

/**
 * 한 Roll 의 계산 과정을 실제 식 모양 그대로 보여준다.
 * 주사위 항 하나뿐이면 결과 목록만(`[3, 5]`), 그 외에는 연산자·상수까지
 * (`1d20 [13] + 5`, `1d20 [6] - 1d4 [4]`) 표시한다.
 */
function formatRollValues(roll: DiceRoll): string {
  const [onlyPart] = roll.parts;
  if (roll.parts.length === 1 && onlyPart.kind === "dice") {
    return formatRollValuesForMessage(onlyPart.values);
  }
  return roll.parts
    .map((part) =>
      part.kind === "text"
        ? part.text
        : `${part.notation} ${formatRollValuesForMessage(part.values)}`,
    )
    .join("");
}

function formatComparison(roll: DiceRoll): string {
  if (!roll.comparison) return "";
  const { operator, target, passed } = roll.comparison;
  return ` ${COMPARISON_SYMBOL[operator]} ${formatDiceTotal(target)} → ${
    passed ? "✅ 성공" : "❌ 실패"
  }`;
}

function formatRollLine({
  roll,
  index,
  totalRolls,
  simplified,
}: {
  roll: DiceRoll;
  index: number;
  totalRolls: number;
  simplified: boolean;
}): string {
  const label = totalRolls === 1 ? "Roll" : `Roll #${index + 1}`;
  const total = `**${formatDiceTotal(roll.total)}**${formatComparison(roll)}`;
  if (simplified) return `${label}: ${total}`;

  return `${label}: ${formatRollValues(roll)} = ${total}`;
}

/**
 * 결과 메시지를 만든다. 길이가 넘쳐도 합계·판정은 잘리지 않게, 개별 결과부터
 * 생략하고(간단 표시) 그래도 넘치는 Roll 은 `외 N개 생략`으로 센다.
 *
 * `maxLength` 는 본문 예산 — 앞에 머리말을 붙여 보내는 호출처(`/비밀굴림`)는
 * `2000 - 머리말 길이` 를 넘긴다.
 */
export function buildDiceRollContent(
  result: DiceRollResult,
  displayName: string,
  maxLength: number = MAX_MESSAGE_LENGTH,
): string {
  const request = inlineCode(truncateText(result.rawInput, 160));
  const name = escapeMarkdownText(truncateText(displayName, 40));
  const head = `🎲 ${name} Request: ${request}`;
  const comment = result.comment
    ? `Note: ${escapeMarkdownText(truncateText(result.comment, MAX_COMMENT_LENGTH))}`
    : null;

  if (result.rolls.length === 1) {
    const roll = result.rolls[0];
    const commentPart = comment ? ` ${comment}` : "";
    const full = formatRollLine({
      roll,
      index: 0,
      totalRolls: 1,
      simplified: result.flags.simplified,
    });
    const content = `${head} ${full}${commentPart}`;
    if (content.length <= maxLength) return content;

    const compact = `Roll: (개별 결과 생략) = **${formatDiceTotal(roll.total)}**${formatComparison(roll)}`;
    return `${head} ${compact}${commentPart}`;
  }

  const compared = result.rolls.filter((roll) => roll.comparison !== null);
  const summary =
    compared.length > 0
      ? `판정: 성공 ${compared.filter((roll) => roll.comparison?.passed).length}/${compared.length}`
      : null;
  // 생략 안내·판정 요약·주석이 들어갈 자리를 먼저 확보한다.
  const reserved =
    32 + (summary ? summary.length + 1 : 0) + (comment ? comment.length + 1 : 0);

  const lines = [head];
  let used = head.length;
  let listedCount = 0;
  for (const [index, roll] of result.rolls.entries()) {
    if (index >= MAX_LISTED_ROLLS) break;
    const lineOptions = {
      roll,
      index,
      totalRolls: result.rolls.length,
      simplified: result.flags.simplified,
    };
    let line = formatRollLine(lineOptions);
    if (used + 1 + line.length + reserved > maxLength) {
      line = formatRollLine({ ...lineOptions, simplified: true });
    }
    if (used + 1 + line.length + reserved > maxLength) break;
    lines.push(line);
    used += 1 + line.length;
    listedCount += 1;
  }

  const rest = result.rolls.length - listedCount;
  if (rest > 0) lines.push(`... 외 ${rest}개 생략`);
  if (summary) lines.push(summary);
  if (comment) lines.push(comment);

  return lines.join("\n");
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
    await replyEphemeral(interaction, DICE_HELP_TEXT);
    return;
  }

  let result: DiceRollResult;
  try {
    result = rollDiceExpression(expression);
  } catch (err) {
    if (err instanceof DiceRollError) {
      await replyEphemeral(interaction, err.message);
      return;
    }
    // 예상하지 못한 파서 오류 — index.ts 공통 경계가 운영 알림과 오류 응답을 맡는다.
    throw err;
  }

  const privateReply =
    (interaction.options.getBoolean("비공개") ?? false) || result.flags.private;
  const reply: InteractionReplyOptions = {
    content: buildDiceRollContent(result, getInteractionDisplayName(interaction)),
    allowedMentions: { parse: [] },
    // 주석에 쓴 링크가 미리보기 임베드로 펼쳐지지 않게 한다.
    flags: privateReply
      ? MessageFlags.Ephemeral | MessageFlags.SuppressEmbeds
      : MessageFlags.SuppressEmbeds,
  };
  await interaction.reply(reply);
}
