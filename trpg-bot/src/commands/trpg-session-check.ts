/**
 * `/세션확인` 슬래시 핸들러와 응답 컴포넌트(월 이동 버튼·세션 선택 메뉴)
 *
 * 선택한 달의 trpg_sessions 를 PNG 캘린더 + 상세 embed 로 렌더하고, 조회한 달로
 * 바로 열리는 trpg-web 캘린더 버튼을 첨부해 응답한다(기본 공개, `비공개` 옵션 지원).
 * PNG 가 꺼져 있거나 실패·타임아웃이어도 텍스트 embed 로 응답한다.
 *
 * - `내세션:true` 면 내가 참가하거나 진행하는 세션만 표시한다.
 * - 이전·다음 달 버튼은 공개 메시지를 바꾸지 않고, 누른 사람에게 그 달을 비공개로 보여준다.
 * - 세션 선택 메뉴는 고른 세션의 참가자 전체와 웹 링크를 누른 사람에게 비공개로 보여준다.
 *
 * @module commands/trpg-session-check
 */

import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
} from "discord.js";
import {
  findTrpgSessionById,
  findTrpgSessionsByMonth,
} from "@stargate/shared-db";

import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  StringSelectMenuInteraction,
} from "discord.js";
import type { TrpgSession } from "@stargate/shared-db";

import { config } from "../config.js";
import { SESSION_CHECK_MINE_OPTION } from "../slash/ko-names.js";
import {
  formatKstMonthDayWeekday,
  kstDateKey,
  kstDateTimeToUnix,
  nowKstYmd,
} from "../utils/kst.js";
import { renderTrpgCalendarPng } from "../utils/trpg-calendar-image.js";

const CALENDAR_EMBED_COLOR = 0xc5a059;
const CALENDAR_FOOTER = "다채로운 TRPG Calendar";
const EMBED_FIELD_NAME_MAX = 256;
const EMBED_FIELD_VALUE_MAX = 1024;
/** Discord embed 하나의 글자 수 총합 상한 (title+description+fields+footer) */
const EMBED_TOTAL_MAX = 6000;
/** 총합 계산에서 빠질 수 있는 여유분 (더 보기 필드, 타임스탬프 표기 차이 등) */
const EMBED_TOTAL_MARGIN = 200;
const MAX_LISTED_SESSIONS = 12;
const MAX_PARTICIPANT_MENTIONS = 16;
/** 선택 메뉴 옵션 상한 (Discord) */
const MAX_SELECT_OPTIONS = 25;
const SELECT_TEXT_MAX = 100;
/** `/세션확인` 연도 옵션과 같은 범위 */
const MIN_YEAR = 2026;
const MAX_YEAR = 2100;

/** 응답 컴포넌트 customId 접두사 (버전을 올리면 옛 메시지의 컴포넌트는 무시된다) */
export const SESSION_CHECK_COMPONENT_PREFIX = "trpg:session-check:v1:";
const DETAIL_SELECT_ID = `${SESSION_CHECK_COMPONENT_PREFIX}detail`;

type SessionCheckMode = "detail" | "summary";
/** `all`: 전체 세션, `mine`: 내가 참가하거나 진행하는 세션만 */
type SessionCheckScope = "all" | "mine";

type EmbedField = { name: string; value: string; inline: false };

type YearMonth = { year: number; month: number };

export type SessionCheckComponentAction =
  | { kind: "month"; year: number; month: number; mode: SessionCheckMode; scope: SessionCheckScope }
  | { kind: "detail" };

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function compareYearMonth(a: YearMonth, b: YearMonth): number {
  return a.year === b.year ? a.month - b.month : a.year - b.year;
}

function shiftMonth({ year, month }: YearMonth, delta: number): YearMonth {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function monthCustomId(
  target: YearMonth,
  mode: SessionCheckMode,
  scope: SessionCheckScope,
): string {
  return `${SESSION_CHECK_COMPONENT_PREFIX}month:${target.year}-${String(target.month).padStart(2, "0")}:${mode}:${scope}`;
}

/** 응답 컴포넌트 customId 를 동작으로 바꾼다. 다른 컴포넌트면 null. */
export function parseSessionCheckCustomId(
  customId: string,
): SessionCheckComponentAction | null {
  if (customId === DETAIL_SELECT_ID) return { kind: "detail" };
  const match = /^trpg:session-check:v1:month:(\d{4})-(\d{2}):(detail|summary):(all|mine)$/.exec(
    customId,
  );
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < MIN_YEAR || year > MAX_YEAR || month < 1 || month > 12) return null;
  return {
    kind: "month",
    year,
    month,
    mode: match[3] as SessionCheckMode,
    scope: match[4] as SessionCheckScope,
  };
}

export function isSessionCheckCustomId(customId: string): boolean {
  return customId.startsWith(SESSION_CHECK_COMPONENT_PREFIX);
}

function isMySession(session: TrpgSession, userId: string): boolean {
  return (
    session.createdByDiscordId === userId ||
    session.participantDiscordIds.includes(userId)
  );
}

function formatParticipantMentions(userIds: string[]): string {
  if (userIds.length === 0) return "0명";

  const listed = userIds.slice(0, MAX_PARTICIPANT_MENTIONS);
  const rest = userIds.length - listed.length;
  const suffix = rest > 0 ? ` 외 ${rest}명` : "";
  return `${userIds.length}명 - ${listed.map((id) => `<@${id}>`).join(" ")}${suffix}`;
}

function formatSessionFieldName(session: TrpgSession, index: number): string {
  const monthDay = session.date.slice(5).replace("-", "/");
  const name = `${String(index + 1).padStart(2, "0")}. ${monthDay} ${session.startTime} · ${session.title}`;
  if (name.length <= EMBED_FIELD_NAME_MAX) return name;
  return `${name.slice(0, EMBED_FIELD_NAME_MAX - 1)}…`;
}

function formatSessionFieldValue(session: TrpgSession): string {
  const unix = kstDateTimeToUnix(session.date, session.startTime);
  const when =
    unix === null
      ? `${session.date} ${session.startTime} (KST)`
      : `<t:${unix}:F> · <t:${unix}:R>`;
  return [
    `\`일시\` ${when}`,
    `\`마스터\` ${session.createdByUsername}`,
    `\`참가\` ${formatParticipantMentions(session.participantDiscordIds)}`,
  ].join("\n");
}

/**
 * 상세 모드 세션 필드. 최대 12건까지, 그리고 embed 총합 예산(`budget`) 안에서만
 * 채우고 나머지는 "더 보기" 필드로 센다 — 참가자가 많은 달에 6000자를 넘겨 응답
 * 전체(PNG·웹 버튼 포함)가 거부되는 것을 막는다.
 */
function buildSessionFields(
  sessions: TrpgSession[],
  budget: number,
): EmbedField[] {
  if (sessions.length === 0) {
    return [
      {
        name: "세션 목록",
        value: "표시할 세션이 없습니다.",
        inline: false,
      },
    ];
  }

  const fields: EmbedField[] = [];
  let used = 0;

  for (const [index, session] of sessions.entries()) {
    if (index >= MAX_LISTED_SESSIONS) break;
    const field: EmbedField = {
      name: formatSessionFieldName(session, index),
      value: formatSessionFieldValue(session),
      inline: false,
    };
    const size = field.name.length + field.value.length;
    if (used + size > budget) break;
    fields.push(field);
    used += size;
  }

  const rest = sessions.length - fields.length;
  if (rest > 0) {
    fields.push({
      name: "더 보기",
      value: `외 ${rest}건은 웹 캘린더에서 확인할 수 있습니다.`,
      inline: false,
    });
  }

  return fields;
}

function buildMonthlySummary(sessions: TrpgSession[], todayKey: string): string {
  const todayCount = sessions.filter((s) => s.date === todayKey).length;
  const upcomingCount = sessions.filter((s) => s.date > todayKey).length;
  const participantTotal = sessions.reduce(
    (sum, s) => sum + s.participantDiscordIds.length,
    0,
  );

  return [
    `표시 세션: **${sessions.length}건**`,
    `오늘 일정: **${todayCount}건**`,
    `이후 일정: **${upcomingCount}건**`,
    `참가 대상 누적: **${participantTotal}명**`,
  ].join("\n");
}

/**
 * 조회한 달로 바로 열리는 웹 캘린더 링크. trpg-web 은 `?date=YYYY-MM-DD` 로 해당
 * 날짜가 속한 달을 연다 — 이번 달이면 오늘, 아니면 그 달 1일.
 */
export function buildCalendarWebUrl({
  baseUrl,
  year,
  month,
  todayKey,
  isCurrentMonth,
}: {
  baseUrl: string;
  year: number;
  month: number;
  todayKey: string;
  isCurrentMonth: boolean;
}): string {
  const date = isCurrentMonth
    ? todayKey
    : kstDateKey({ year, month, day: 1 });
  return `${baseUrl}/calendar?date=${encodeURIComponent(date)}`;
}

/** 월 이동 버튼 상태 — 지난 달은 항상 비어 있으므로 이번 달에서는 이전 달을 막는다. */
export function buildMonthNavigation({
  year,
  month,
  current,
}: {
  year: number;
  month: number;
  current: YearMonth;
}): { previous: YearMonth | null; next: YearMonth | null } {
  const viewing = { year, month };
  const previous = shiftMonth(viewing, -1);
  const next = shiftMonth(viewing, 1);
  return {
    previous: compareYearMonth(previous, current) >= 0 ? previous : null,
    next: next.year <= MAX_YEAR ? next : null,
  };
}

function buildSessionSelectRow(
  sessions: TrpgSession[],
): ActionRowBuilder<StringSelectMenuBuilder> | null {
  const options = sessions
    .filter((session) => session._id)
    .slice(0, MAX_SELECT_OPTIONS)
    .map((session) => ({
      label: truncate(
        `${formatKstMonthDayWeekday(session.date)} ${session.startTime} · ${session.title}`,
        SELECT_TEXT_MAX,
      ),
      description: truncate(
        `마스터 ${session.createdByUsername} · 참가 ${session.participantDiscordIds.length}명`,
        SELECT_TEXT_MAX,
      ),
      value: String(session._id),
    }));
  if (options.length === 0) return null;
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(DETAIL_SELECT_ID)
      .setPlaceholder("세션을 골라 참가자 전체와 웹 링크 보기 (나에게만 표시)")
      .addOptions(options),
  );
}

export function buildCalendarResponse({
  year,
  month,
  sessions,
  webUrl,
  hasImage,
  todayKey,
  mode,
  scope = "all",
  navigation,
}: {
  year: number;
  month: number;
  sessions: TrpgSession[];
  webUrl: string;
  hasImage: boolean;
  todayKey: string;
  mode: SessionCheckMode;
  scope?: SessionCheckScope;
  navigation?: { previous: YearMonth | null; next: YearMonth | null };
}) {
  const title = `${year}년 ${month}월 TRPG 세션${scope === "mine" ? " · 내 세션" : ""}`;
  const description =
    sessions.length === 0
      ? scope === "mine"
        ? "오늘 이후 내가 참가하거나 진행하는 세션이 없습니다."
        : "오늘 이후 표시할 세션이 없습니다."
      : `오늘 이후 표시되는 세션은 총 ${sessions.length}건입니다.`;
  const summaryField: EmbedField = {
    name: "월간 요약",
    value: buildMonthlySummary(sessions, todayKey),
    inline: false,
  };
  const imageField: EmbedField | null = hasImage
    ? null
    : {
        name: "캘린더 이미지",
        value: "현재 환경에서는 PNG 캘린더를 생성하지 못했습니다.",
        inline: false,
      };

  const embed = new EmbedBuilder()
    .setColor(CALENDAR_EMBED_COLOR)
    .setTitle(title)
    .setDescription(description)
    .addFields(summaryField)
    .setFooter({ text: CALENDAR_FOOTER })
    .setTimestamp();

  if (mode === "detail") {
    const fixedLength =
      title.length +
      description.length +
      CALENDAR_FOOTER.length +
      summaryField.name.length +
      summaryField.value.length +
      (imageField ? imageField.name.length + imageField.value.length : 0);
    const budget = EMBED_TOTAL_MAX - EMBED_TOTAL_MARGIN - fixedLength;
    embed.addFields(...buildSessionFields(sessions, budget));
  }

  if (hasImage) {
    embed.setImage("attachment://trpg-calendar.png");
  } else if (imageField) {
    embed.addFields(imageField);
  }

  const linkRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("웹 캘린더 열기")
      .setStyle(ButtonStyle.Link)
      .setURL(webUrl),
  );
  if (navigation) {
    const current = { year, month };
    linkRow.addComponents(
      new ButtonBuilder()
        .setCustomId(monthCustomId(navigation.previous ?? shiftMonth(current, -1), mode, scope))
        .setStyle(ButtonStyle.Secondary)
        .setLabel("◀ 이전 달")
        .setDisabled(navigation.previous === null),
      new ButtonBuilder()
        .setCustomId(monthCustomId(navigation.next ?? shiftMonth(current, 1), mode, scope))
        .setStyle(ButtonStyle.Secondary)
        .setLabel("다음 달 ▶")
        .setDisabled(navigation.next === null),
    );
  }

  const components: Array<
    ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>
  > = [linkRow];
  const selectRow = mode === "detail" ? buildSessionSelectRow(sessions) : null;
  if (selectRow) components.push(selectRow);

  return { embeds: [embed], components };
}

/** 고른 세션 한 건의 비공개 상세 — 참가자 전체(1024자 한도)와 웹 세션 링크. */
export function buildSessionDetailResponse(
  session: TrpgSession,
  baseUrl: string,
) {
  const unix = kstDateTimeToUnix(session.date, session.startTime);
  const fixed = `${session.date} ${session.startTime} (KST)`;
  const mentions: string[] = [];
  let length = 0;
  for (const id of session.participantDiscordIds) {
    const mention = `<@${id}>`;
    // 끝에 붙일 "외 N명" 자리(약 10자)를 남긴다.
    if (length + mention.length + 1 > EMBED_FIELD_VALUE_MAX - 16) break;
    mentions.push(mention);
    length += mention.length + 1;
  }
  const rest = session.participantDiscordIds.length - mentions.length;
  const participants =
    session.participantDiscordIds.length === 0
      ? "아직 참가자가 없습니다."
      : `${mentions.join(" ")}${rest > 0 ? ` 외 ${rest}명` : ""}`;

  const embed = new EmbedBuilder()
    .setColor(CALENDAR_EMBED_COLOR)
    .setTitle(truncate(session.title, 256))
    .addFields(
      {
        name: "일시",
        value: unix === null ? fixed : `${fixed}\n<t:${unix}:F> · <t:${unix}:R>`,
        inline: false,
      },
      { name: "마스터", value: session.createdByUsername, inline: true },
      {
        name: `참가 ${session.participantDiscordIds.length}명`,
        value: participants,
        inline: false,
      },
    )
    .setFooter({ text: `이 상세는 나에게만 표시됩니다 · ${CALENDAR_FOOTER}` });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("웹에서 세션 보기")
      .setStyle(ButtonStyle.Link)
      .setURL(
        `${baseUrl}/calendar?sessionId=${encodeURIComponent(String(session._id))}`,
      ),
  );
  return { embeds: [embed], components: [row] };
}

/** 캘린더 한 달을 조회·렌더해 응답한다. 슬래시 명령과 월 이동 버튼이 함께 쓴다. */
async function respondWithCalendar(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  {
    year,
    month,
    mode,
    scope,
    privateReply,
  }: {
    year: number;
    month: number;
    mode: SessionCheckMode;
    scope: SessionCheckScope;
    privateReply: boolean;
  },
): Promise<void> {
  await interaction.deferReply(
    privateReply ? { flags: MessageFlags.Ephemeral } : {},
  );

  const now = nowKstYmd();
  const todayKey = kstDateKey(now);
  const todayDay = year === now.year && month === now.month ? now.day : null;

  try {
    const monthlySessions = await findTrpgSessionsByMonth(
      config.trpgGuildId,
      year,
      month,
    );
    // date는 YYYY-MM-DD라 문자열 비교로 KST 기준 오늘 이전 일정을 제외할 수 있다.
    const sessions = monthlySessions.filter(
      (session) =>
        session.date >= todayKey &&
        (scope === "all" || isMySession(session, interaction.user.id)),
    );

    const webUrl = buildCalendarWebUrl({
      baseUrl: config.trpgWebBaseUrl,
      year,
      month,
      todayKey,
      isCurrentMonth: todayDay !== null,
    });

    // 실패·타임아웃이면 null — 이미 조회한 세션 목록은 텍스트로라도 보여준다.
    const png = await renderTrpgCalendarPng({
      year,
      month,
      sessions,
      todayDay,
    });

    await interaction.editReply({
      ...buildCalendarResponse({
        year,
        month,
        sessions,
        webUrl,
        hasImage: png !== null,
        todayKey,
        mode,
        scope,
        navigation: buildMonthNavigation({
          year,
          month,
          current: { year: now.year, month: now.month },
        }),
      }),
      files: png ? [new AttachmentBuilder(png, { name: "trpg-calendar.png" })] : [],
    });
  } catch (err) {
    console.error("[trpg-session-check] 처리 실패:", err);
    await interaction
      .editReply({
        content: "세션 일정을 가져오는 중 오류가 발생했습니다.",
      })
      .catch(() => {});
  }
}

async function replyOutsideGuild(
  interaction:
    | ChatInputCommandInteraction
    | ButtonInteraction
    | StringSelectMenuInteraction,
): Promise<boolean> {
  // 길드 외부 호출(DM 등)과 운영 분리 약속에 따른 다른 길드의 호출을 막는다.
  if (interaction.inGuild() && interaction.guildId === config.trpgGuildId) {
    return false;
  }
  await interaction.reply({
    content: "이 서버에서는 `/세션확인` 명령을 사용할 수 없습니다.",
    flags: MessageFlags.Ephemeral,
  });
  return true;
}

export async function handleTrpgSessionCheck(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (await replyOutsideGuild(interaction)) return;

  const now = nowKstYmd();
  await respondWithCalendar(interaction, {
    year: interaction.options.getInteger("연도") ?? now.year,
    month: interaction.options.getInteger("월") ?? now.month,
    mode: interaction.options.getString("모드") === "summary" ? "summary" : "detail",
    scope: interaction.options.getBoolean(SESSION_CHECK_MINE_OPTION) ? "mine" : "all",
    privateReply: interaction.options.getBoolean("비공개") ?? false,
  });
}

/** 월 이동 버튼과 세션 선택 메뉴 처리 — 결과는 누른 사람에게만 보인다. */
export async function handleSessionCheckComponent(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
): Promise<void> {
  if (await replyOutsideGuild(interaction)) return;
  const action = parseSessionCheckCustomId(interaction.customId);

  if (action?.kind === "month" && interaction.isButton()) {
    await respondWithCalendar(interaction, { ...action, privateReply: true });
    return;
  }

  if (action?.kind === "detail" && interaction.isStringSelectMenu()) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const session = await findTrpgSessionById(interaction.values[0] ?? "");
    if (
      !session ||
      session.status !== "open" ||
      session.guildId !== config.trpgGuildId
    ) {
      await interaction.editReply({
        content: "취소되었거나 찾을 수 없는 세션입니다. `/세션확인`을 다시 실행해 주세요.",
      });
      return;
    }
    await interaction.editReply({
      ...buildSessionDetailResponse(session, config.trpgWebBaseUrl),
      allowedMentions: { parse: [] },
    });
    return;
  }

  await interaction.reply({
    content: "더 이상 사용할 수 없는 버튼입니다. `/세션확인`을 다시 실행해 주세요.",
    flags: MessageFlags.Ephemeral,
  });
}
