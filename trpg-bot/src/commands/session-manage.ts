/**
 * /일정 목록·한눈에·달력·집계·마감·응답마감변경·일정변경·취소 관리자 핸들러
 *
 * @module commands/session-manage
 */

import {
  type ChatInputCommandInteraction,
  type Client,
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { findBySessionId, countByStatus } from "../db/responses.js";
import {
  findSessionById,
  findSessionByIdInGuild,
  findLatestOpenSessionByGuild,
  findLatestClosedSessionByGuild,
  findOpenSessionsByGuild,
  findOpenAndClosedSessionsByGuildOrderByTarget,
  updateSessionCloseDateTime,
  updateSessionTargetDateTime,
  updateSessionTargetAndCloseDateTime,
} from "../db/sessions.js";
import { appendSessionLog } from "../db/logs.js";
import { buildSessionEmbed, buildResultEmbed } from "../utils/embed.js";
import { getNonResponders } from "../utils/no-response.js";
import { fetchGuildMembersCached } from "../utils/guild-members.js";
import {
  executeSessionClose,
  executeSessionCancel,
} from "../services/session-close.js";
import { isResultCardImageEnabled } from "../config.js";
import {
  buildSessionResultCardBuffer,
  buildGuildMonthCalendarOnlyBuffer,
} from "../utils/build-session-result-card.js";
import { Opt, SCHEDULE_ROOT, Sub } from "../slash/ko-names.js";
import { requireManageGuild } from "../utils/require-manage-guild.js";
import { resolveGuildTextSendChannel } from "../utils/resolve-guild-text-send-channel.js";
import type { Session } from "../types/session.js";

/** 버튼 customId는 button-handler와 동일해야 함 */
const ATTEND_PREFIX = "trpg:attend:";

const LIST_EMBED_COLOR = 0xc5a059;
/** 임베드 description 한도(여유) */
const LIST_DESC_SAFE_MAX = 3900;
/** 한 번에 표시할 최대 세션 수 */
const LIST_MAX_ITEMS = 20;
/** overview: OPEN·CLOSED 세션 일시 순·월별 표에 포함할 최대 건수 */
const OVERVIEW_MAX_SESSIONS = 100;
/** overview: 임베드 description 여유 한도 */
const OVERVIEW_DESC_SAFE_MAX = 3800;
/** overview: 분할 임베드 최대 개수 */
const OVERVIEW_MAX_EMBEDS = 6;
/** result: OPEN 여러 개일 때 자동 선택 대신 안내에 줄 최대 줄 수 */
const RESULT_MULTI_OPEN_PREVIEW = 8;

/**
 * `/일정 목록` — 이 길드의 OPEN 세션 목록 (에페메랄)
 */
export async function handleSessionList(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!requireManageGuild(interaction)) {
    await interaction.reply({
      content: "❌ 이 명령은 **서버 관리** 권한이 있는 사용자만 사용할 수 있습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: "❌ 길드에서만 사용할 수 있습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const sessions = await findOpenSessionsByGuild(guildId);

  if (sessions.length === 0) {
    await interaction.editReply({
      content: "📭 이 서버에 **진행 중(OPEN)** 인 세션이 없습니다.",
    });
    return;
  }

  const total = sessions.length;
  const toShow = sessions.slice(0, LIST_MAX_ITEMS);
  const lines: string[] = [];

  for (let i = 0; i < toShow.length; i++) {
    const s = toShow[i];
    const sid = String(s._id);
    const tClose = Math.floor(s.closeDateTime.getTime() / 1000);
    const tStart = Math.floor(s.targetDateTime.getTime() / 1000);
    const ch = `<#${s.channelId}>`;
    const titleShort =
      s.title.length > 80 ? `${s.title.slice(0, 77)}...` : s.title;
    lines.push(
      `**${i + 1}.** ${titleShort}\n` +
        `sessionId : \`${sid}\` · 공지 ${ch}\n` +
        `· 세션 시작일 : <t:${tStart}:F>\n` +
        `· 투표 마감일 :  <t:${tClose}:F>`
    );
  }

  let description = lines.join("\n\n");
  if (description.length > LIST_DESC_SAFE_MAX) {
    description =
      description.slice(0, LIST_DESC_SAFE_MAX - 30).trimEnd() + "\n… _(일부만 표시)_";
  }

  const embed = new EmbedBuilder()
    .setTitle(`진행 중인 세션 · ${total}건`)
    .setColor(LIST_EMBED_COLOR)
    .setDescription(description)
    .setTimestamp();

  if (total > LIST_MAX_ITEMS) {
    embed.setFooter({
      text: `처음 ${LIST_MAX_ITEMS}건만 표시 (전체 ${total}건) · 마감·월별: /${SCHEDULE_ROOT} ${Sub.overview}`,
    });
  } else {
    embed.setFooter({
      text: `마감 포함·월별 전체: /${SCHEDULE_ROOT} ${Sub.overview}`,
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

/**
 * OPEN 세션 공지 메시지 임베드·버튼을 DB 기준 최신 상태로 다시 그립니다.
 */
async function refreshOpenSessionAnnouncement(
  client: Client,
  session: Session
): Promise<void> {
  if (!session.messageId?.trim()) return;

  const guild = await client.guilds.fetch(session.guildId);
  const channel = await guild.channels.fetch(session.channelId);
  if (!channel?.isTextBased() || !("messages" in channel)) return;

  const sid = String(session._id);
  const counts = await countByStatus(sid);
  const responses = await findBySessionId(sid);
  const yesIds = responses.filter((r) => r.status === "YES").map((r) => r.userId);
  const noIds = responses.filter((r) => r.status === "NO").map((r) => r.userId);

  const embed = buildSessionEmbed(session, counts, yesIds, noIds, sid);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${ATTEND_PREFIX}${sid}:yes`)
      .setLabel("참석")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${ATTEND_PREFIX}${sid}:no`)
      .setLabel("불참")
      .setStyle(ButtonStyle.Danger)
  );

  const msg = await channel.messages.fetch(session.messageId);
  await msg.edit({ embeds: [embed], components: [row] });
}

/** 날짜 문자열을 Date로 파싱 (create와 동일 규칙) */
function parseDateTime(str: string): Date | null {
  const normalized = str.replace(" ", "T");
  const date = new Date(normalized);
  return isNaN(date.getTime()) ? null : date;
}

async function resolveOpenSession(
  guildId: string,
  sessionIdOpt: string | null
): Promise<Session | null> {
  if (sessionIdOpt?.trim()) {
    return findSessionByIdInGuild(sessionIdOpt.trim(), guildId);
  }
  return findLatestOpenSessionByGuild(guildId);
}

async function resolveSessionForResult(
  guildId: string,
  sessionIdOpt: string | null
): Promise<Session | null> {
  if (sessionIdOpt?.trim()) {
    return findSessionByIdInGuild(sessionIdOpt.trim(), guildId);
  }
  const open = await findLatestOpenSessionByGuild(guildId);
  if (open) return open;
  return findLatestClosedSessionByGuild(guildId);
}

/**
 * `/일정 한눈에` — OPEN·마감 전체를 **세션 일시 기준 월별**로 (에페메랄, PNG 없음)
 *
 * 집계·PNG는 `/일정 집계`를 씁니다.
 */
export async function handleSessionOverview(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!requireManageGuild(interaction)) {
    await interaction.reply({
      content: "❌ 이 명령은 **서버 관리** 권한이 있는 사용자만 사용할 수 있습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: "❌ 길드에서만 사용할 수 있습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const raw = await findOpenAndClosedSessionsByGuildOrderByTarget(
    guildId,
    OVERVIEW_MAX_SESSIONS + 1
  );

  if (raw.length === 0) {
    await interaction.editReply({
      content:
        "📭 이 서버에 **진행 중(OPEN)** 또는 **마감(CLOSED)** 세션이 없습니다. (취소 제외)",
    });
    return;
  }

  const hitSessionCap = raw.length > OVERVIEW_MAX_SESSIONS;
  const sessions = raw.slice(0, OVERVIEW_MAX_SESSIONS);

  const monthKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const groups = new Map<string, Session[]>();
  const order: string[] = [];
  for (const s of sessions) {
    const k = monthKey(s.targetDateTime);
    if (!groups.has(k)) {
      groups.set(k, []);
      order.push(k);
    }
    groups.get(k)!.push(s);
  }

  const blocks: string[] = [];
  for (const k of order) {
    const list = groups.get(k)!;
    const d0 = list[0]!.targetDateTime;
    const head = `**${d0.getFullYear()}년 ${d0.getMonth() + 1}월**`;
    const lines = list
      .map((s) => {
        const sid = String(s._id);
        const ts = Math.floor(s.targetDateTime.getTime() / 1000);
        const tc = Math.floor(s.closeDateTime.getTime() / 1000);
        const ch = `<#${s.channelId}>`;
        const st = s.status === "OPEN" ? "진행 중" : "마감";
        const t = s.title.length > 48 ? `${s.title.slice(0, 45)}…` : s.title;
        return `· [${st}] ${t}\n  \`${sid}\` · ${ch} · 세션 <t:${ts}:f> · 마감 <t:${tc}:f>`;
      })
      .join("\n");
    blocks.push(`${head}\n${lines}`);
  }

  const embeds: EmbedBuilder[] = [];
  let chunk = "";
  const pushChunk = (): void => {
    const t = chunk.trim();
    if (!t) return;
    embeds.push(new EmbedBuilder().setColor(LIST_EMBED_COLOR).setDescription(t));
    chunk = "";
  };

  for (const b of blocks) {
    if (embeds.length >= OVERVIEW_MAX_EMBEDS) break;
    const joined = chunk ? `${chunk}\n\n${b}` : b;
    if (joined.length > OVERVIEW_DESC_SAFE_MAX) {
      if (chunk) pushChunk();
      if (embeds.length >= OVERVIEW_MAX_EMBEDS) break;
      if (b.length > OVERVIEW_DESC_SAFE_MAX) {
        embeds.push(
          new EmbedBuilder()
            .setColor(LIST_EMBED_COLOR)
            .setDescription(
              `${b.slice(0, OVERVIEW_DESC_SAFE_MAX - 40).trimEnd()}\n…`
            )
        );
        continue;
      }
      chunk = b;
    } else {
      chunk = joined;
    }
  }

  if (embeds.length < OVERVIEW_MAX_EMBEDS) pushChunk();

  if (embeds.length === 0) {
    await interaction.editReply({ content: "표시할 내용을 만들 수 없습니다." });
    return;
  }

  const omittedTail = chunk.trim().length > 0;
  if (omittedTail) {
    const last = embeds[embeds.length - 1]!;
    last.setDescription(
      `${last.data.description ?? ""}\n\n_이후 월·일정은 표시 한도로 생략됩니다._`
    );
  }

  while (embeds.length > 10) embeds.pop();

  embeds[0]!.setTitle("세션 일정 한눈에 보기 (월별)");
  for (let i = 1; i < embeds.length; i++) {
    embeds[i]!.setTitle(`계속 (${i + 1}/${embeds.length})`);
  }

  const foot: string[] = [];
  if (hitSessionCap) {
    foot.push(`최대 ${OVERVIEW_MAX_SESSIONS}건까지 표시`);
  }
  if (omittedTail || embeds.length >= OVERVIEW_MAX_EMBEDS) {
    foot.push(`분할·길이 한도`);
  }
  foot.push(
    `집계: /${SCHEDULE_ROOT} ${Sub.result} + ${Opt.sessionId} · 달 PNG: ${Opt.withImage} · 월만: /${SCHEDULE_ROOT} ${Sub.calendar}`
  );
  embeds[embeds.length - 1]!.setFooter({ text: foot.join(" · ") });

  await interaction.editReply({ embeds });
}

/**
 * `/일정 달력` — 올해 지정 월의 세션만 월간 캘린더 PNG (격자만, 지정 채널에 공개)
 */
export async function handleSessionMonthCalendar(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!requireManageGuild(interaction)) {
    await interaction.reply({
      content: "❌ 이 명령은 **서버 관리** 권한이 있는 사용자만 사용할 수 있습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guildId = interaction.guildId;
  const guild = interaction.guild;
  if (!guildId || !guild) {
    await interaction.reply({
      content: "❌ 길드에서만 사용할 수 있습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const month = interaction.options.getInteger(Opt.month, true);
  const year = new Date().getFullYear();
  const monthIndex = month - 1;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const resolvedCh = await resolveGuildTextSendChannel(
    guild,
    interaction.options.getChannel(Opt.channel),
    interaction.channelId
  );
  if (!resolvedCh.ok) {
    await interaction.editReply({ content: resolvedCh.message });
    return;
  }
  const textChannel = resolvedCh.channel;

  if (!isResultCardImageEnabled()) {
    await interaction.editReply({
      content:
        "❌ 이미지 렌더링이 꺼져 있습니다. (`RESULT_CARD_IMAGE`를 켜고 Chromium 환경을 확인하세요.)",
    });
    return;
  }

  const buf = await buildGuildMonthCalendarOnlyBuffer(
    guildId,
    year,
    monthIndex
  );
  if (!buf) {
    await interaction.editReply({
      content: "❌ 달력 이미지를 만들지 못했습니다. 잠시 후 다시 시도하세요.",
    });
    return;
  }

  try {
    const msg = await textChannel.send({
      content: `📅 **${year}년 ${month}월** · 세션 일시 기준 OPEN·마감 (취소 제외)`,
      files: [new AttachmentBuilder(buf, { name: "session-calendar.png" })],
    });
    await interaction.editReply({
      content: `✅ 달력을 올렸습니다. [메시지 보기](${msg.url})`,
    });
  } catch (err) {
    console.error("[session calendar]", err);
    const missingAccess =
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: unknown }).code === 50001;
    await interaction.editReply({
      content: missingAccess
        ? "❌ 봇이 **선택한 채널**에 메시지를 보낼 수 없습니다. (Discord `Missing Access`)\n" +
          "· 봇 역할에 **채널 보기**, **메시지 보내기**, **파일 첨부**를 허용했는지 확인하세요.\n" +
          "· **스레드**면 **스레드에서 메시지 보내기**가 필요하고, 비공개 스레드는 봇을 **초대**해야 할 수 있습니다."
        : `❌ 달력을 보내지 못했습니다: ${err instanceof Error ? err.message : "알 수 없는 오류"}`,
    });
  }
}

/**
 * `/일정 집계` — 한 세션 집계·최종 결과 (지정 채널에 공개). 세션 ID는 실행 관리자에게만 에페메랄.
 */
export async function handleSessionResult(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!requireManageGuild(interaction)) {
    await interaction.reply({
      content: "❌ 이 명령은 **서버 관리** 권한이 있는 사용자만 사용할 수 있습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guildId = interaction.guildId;
  const guildBase = interaction.guild;
  if (!guildId || !guildBase) {
    await interaction.reply({
      content: "❌ 길드에서만 사용할 수 있습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const sessionIdOpt = interaction.options.getString(Opt.sessionId);
  const withImage = interaction.options.getBoolean(Opt.withImage) === true;

  if (!sessionIdOpt?.trim()) {
    const openOnly = await findOpenSessionsByGuild(guildId);
    if (openOnly.length > 1) {
      const lines = openOnly
        .slice(0, RESULT_MULTI_OPEN_PREVIEW)
        .map((s, i) => {
          const sid = String(s._id);
          const ts = Math.floor(s.targetDateTime.getTime() / 1000);
          const title =
            s.title.length > 44 ? `${s.title.slice(0, 41)}…` : s.title;
          return `${i + 1}. **${title}** — \`${sid}\` — 세션 <t:${ts}:D>`;
        })
        .join("\n");
      const more =
        openOnly.length > RESULT_MULTI_OPEN_PREVIEW
          ? `\n… 외 ${openOnly.length - RESULT_MULTI_OPEN_PREVIEW}건`
          : "";
      await interaction.editReply({
        content:
          `진행 중(OPEN) 세션이 **${openOnly.length}개**라서, 임의로 하나만 고르지 않습니다.\n` +
          `**${Opt.sessionId}** 옵션으로 지정해 주세요.\n` +
          `_후보 목록·세션 ID는 이 명령을 실행한 관리자에게만 보이는 메시지로 보냅니다._`,
      });
      await interaction.followUp({
        flags: MessageFlags.Ephemeral,
        content:
          `아래 **ID**를 복사해 \`/${SCHEDULE_ROOT} ${Sub.result}\`의 **${Opt.sessionId}**에 넣어 주세요.\n\n` +
          `${lines}${more}\n\n` +
          `— 마감만 보려면 ID를 넣거나, 전체 일정은 \`/${SCHEDULE_ROOT} ${Sub.overview}\` —`,
      });
      return;
    }
  }

  const session = await resolveSessionForResult(guildId, sessionIdOpt);

  if (!session) {
    await interaction.editReply({
      content:
        "❌ 대상 세션을 찾을 수 없습니다.\n" +
        `· ${Opt.sessionId}를 적었다면 ID를 확인하세요.\n` +
        `· 비웠을 때 OPEN이 없으면 **가장 최근 마감(CLOSED)** 만 자동 선택됩니다. 전체는 /${SCHEDULE_ROOT} ${Sub.overview}`,
    });
    return;
  }

  const sid = String(session._id);
  const guild = await interaction.guild!.fetch();
  const members = await fetchGuildMembersCached(guild);
  const responses = await findBySessionId(sid);
  const counts = await countByStatus(sid);
  const yesIds = responses.filter((r) => r.status === "YES").map((r) => r.userId);
  const noIds = responses.filter((r) => r.status === "NO").map((r) => r.userId);

  const pickedAutomatically = !sessionIdOpt?.trim();
  const resultHeaderPublic = (extra: string) =>
    [
      `**${session.title}**${
        pickedAutomatically
          ? " · _자동 선택(서버 최근 OPEN→없으면 CLOSED, 생성자 무관)_"
          : ""
      }`,
      extra,
    ]
      .filter(Boolean)
      .join("\n");

  const sendSessionIdToInvoker = async (): Promise<void> => {
    await interaction.followUp({
      flags: MessageFlags.Ephemeral,
      content: [
        "🔒 **관리자 전용** — 이 집계 대상 세션 ID",
        `\`${sid}\``,
        `※ \`/${SCHEDULE_ROOT}\` 관리 명령의 **${Opt.sessionId}**에 사용할 수 있습니다.`,
      ].join("\n"),
    });
  };

  if (session.status === "CANCELED") {
    await interaction.editReply({
      content: resultHeaderPublic(`❌ 이 세션은 취소되었습니다.`),
    });
    await sendSessionIdToInvoker();
    return;
  }

  const resolvedCh = await resolveGuildTextSendChannel(
    guildBase,
    interaction.options.getChannel(Opt.channel),
    interaction.channelId
  );
  if (!resolvedCh.ok) {
    await interaction.editReply({ content: resolvedCh.message });
    return;
  }
  const textChannel = resolvedCh.channel;

  const replySendError = async (err: unknown, ctx: string): Promise<void> => {
    console.error(ctx, err);
    const missingAccess =
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: unknown }).code === 50001;
    await interaction.editReply({
      content: missingAccess
        ? "❌ 봇이 **선택한 채널**에 메시지를 보낼 수 없습니다. (Discord `Missing Access`)\n" +
          "· 봇 역할에 **채널 보기**, **메시지 보내기**, **링크 임베드**, **파일 첨부**(이미지 사용 시)를 허용했는지 확인하세요.\n" +
          "· **스레드**면 **스레드에서 메시지 보내기**가 필요하고, 비공개 스레드는 봇을 **초대**해야 할 수 있습니다."
        : `❌ 집계를 보내지 못했습니다: ${err instanceof Error ? err.message : "알 수 없는 오류"}`,
    });
  };

  if (session.status === "OPEN") {
    const noResponseIdsOpen = await getNonResponders(
      guild,
      session.targetRoleId,
      responses,
      members
    );
    const embed = buildSessionEmbed(session, counts, yesIds, noIds, sid, {
      includeSessionIdField: false,
    });
    embed.setFooter({ text: "현재 집계입니다. (진행 중)" });
    const png =
      withImage &&
      (await buildSessionResultCardBuffer({
        session,
        guildId,
        members,
        responses,
        yesIds,
        noIds,
        noResponseIds: noResponseIdsOpen,
        cardMode: "open",
      }));
    try {
      const msg = await textChannel.send({
        content: resultHeaderPublic(""),
        embeds: [embed],
        ...(png
          ? { files: [new AttachmentBuilder(png, { name: "session-result.png" })] }
          : {}),
      });
      await interaction.editReply({
        content: `✅ 집계를 올렸습니다. [메시지 보기](${msg.url})`,
      });
      await sendSessionIdToInvoker();
    } catch (err) {
      await replySendError(err, "[session result open]");
    }
    return;
  }

  // CLOSED
  const noResponseIds = await getNonResponders(
    guild,
    session.targetRoleId,
    responses,
    members
  );
  const embed = buildResultEmbed(session, yesIds, noIds, noResponseIds, {
    includeSessionIdField: false,
  });
  const pngClosed =
    withImage &&
    (await buildSessionResultCardBuffer({
      session,
      guildId,
      members,
      responses,
      yesIds,
      noIds,
      noResponseIds,
      cardMode: "closed",
    }));
  try {
    const msg = await textChannel.send({
      content: resultHeaderPublic(""),
      embeds: [embed],
      ...(pngClosed
        ? { files: [new AttachmentBuilder(pngClosed, { name: "session-result.png" })] }
        : {}),
    });
    await interaction.editReply({
      content: `✅ 집계를 올렸습니다. [메시지 보기](${msg.url})`,
    });
    await sendSessionIdToInvoker();
  } catch (err) {
    await replySendError(err, "[session result closed]");
  }
}

/**
 * `/일정 마감` — 강제 마감
 */
export async function handleSessionClose(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!requireManageGuild(interaction)) {
    await interaction.reply({
      content: "❌ 이 명령은 **서버 관리** 권한이 있는 사용자만 사용할 수 있습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: "❌ 길드에서만 사용할 수 있습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const sessionIdOpt = interaction.options.getString(Opt.sessionId);
  const session = await resolveOpenSession(guildId, sessionIdOpt);

  if (!session) {
    await interaction.editReply({
      content: "❌ 열린(OPEN) 세션을 찾을 수 없습니다.",
    });
    return;
  }

  if (session.status !== "OPEN") {
    await interaction.editReply({
      content: "❌ 이미 마감되었거나 취소된 세션입니다.",
    });
    return;
  }

  try {
    await executeSessionClose(interaction.client, session, {
      kind: "force",
      actorUserId: interaction.user.id,
    });
    await interaction.editReply({
      content: `✅ **${session.title}** 세션을 강제 마감했습니다.`,
    });
  } catch (err) {
    console.error("[session close]", err);
    await interaction.editReply({
      content: `❌ 마감 처리 중 오류: ${err instanceof Error ? err.message : "알 수 없는 오류"}`,
    });
  }
}

/**
 * `/일정 응답마감변경` — 응답 마감 일시 변경
 */
export async function handleSessionEditClose(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!requireManageGuild(interaction)) {
    await interaction.reply({
      content: "❌ 이 명령은 **서버 관리** 권한이 있는 사용자만 사용할 수 있습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: "❌ 길드에서만 사용할 수 있습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const newCloseStr = interaction.options.getString(Opt.newClose, true);
  const newClose = parseDateTime(newCloseStr);
  if (!newClose) {
    await interaction.reply({
      content: `❌ \`${Opt.newClose}\` 날짜 형식이 올바르지 않습니다. (예: 2026-03-22 20:00)`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const sessionIdOpt = interaction.options.getString(Opt.sessionId);
  const session = await resolveOpenSession(guildId, sessionIdOpt);

  if (!session || session.status !== "OPEN") {
    await interaction.editReply({
      content: "❌ 열린(OPEN) 세션을 찾을 수 없습니다.",
    });
    return;
  }

  const now = new Date();
  const notes: string[] = [];
  if (newClose.getTime() <= now.getTime()) {
    notes.push(
      "_마감 시각이 이미 지났습니다. 잠시 후 스케줄러가 자동 마감할 수 있습니다._"
    );
  }
  if (newClose.getTime() >= session.targetDateTime.getTime()) {
    notes.push(
      `_마감이 **세션 일시와 같거나 그 이후**입니다. 필요하면 \`/${SCHEDULE_ROOT} ${Sub.editDate}\`로 세션 일시를 조정하세요._`
    );
  }

  const sid = String(session._id);
  const ok = await updateSessionCloseDateTime(sid, newClose);
  if (!ok) {
    await interaction.editReply({
      content: "❌ DB 업데이트에 실패했습니다.",
    });
    return;
  }

  await appendSessionLog(sid, "EXTENDED", {
    userId: interaction.user.id,
    payload: {
      previousClose: session.closeDateTime.toISOString(),
      newClose: newClose.toISOString(),
    },
  });

  const refreshed = await findSessionById(sid);
  let announceUpdated = false;
  if (refreshed) {
    try {
      await refreshOpenSessionAnnouncement(interaction.client, refreshed);
      announceUpdated = true;
    } catch (err) {
      console.error("[session edit_close] 공지 메시지 임베드 갱신 실패:", err);
    }
  }

  const announceNote = announceUpdated
    ? "\n· 공지 메시지의 **응답 마감** 일시도 반영했습니다."
    : "\n· _(공지 임베드 자동 갱신에 실패했을 수 있습니다. 봇이 해당 채널 메시지를 수정할 권한이 있는지 확인하세요.)_";

  const warnBlock = notes.length ? `\n\n${notes.join("\n")}` : "";

  await interaction.editReply({
    content: `✅ **${session.title}** **응답 마감 일시**를 변경했습니다. 새 마감: <t:${Math.floor(newClose.getTime() / 1000)}:F>${announceNote}${warnBlock}`,
  });
}

/** 세션 시작 1시간 전을 응답 마감으로 쓰기 (일정만 앞당길 때 자동 맞춤) */
function autoCloseBeforeSession(sessionStart: Date): Date {
  return new Date(sessionStart.getTime() - 60 * 60 * 1000);
}

/**
 * `/일정 일정변경` — 세션 진행 일시 변경
 */
export async function handleSessionEditDate(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!requireManageGuild(interaction)) {
    await interaction.reply({
      content: "❌ 이 명령은 **서버 관리** 권한이 있는 사용자만 사용할 수 있습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: "❌ 길드에서만 사용할 수 있습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const newDateStr = interaction.options.getString(Opt.newDate, true);
  const newDate = parseDateTime(newDateStr);
  if (!newDate) {
    await interaction.reply({
      content:
        `❌ \`${Opt.newDate}\` 날짜 형식이 올바르지 않습니다. (예: 2026-03-22 20:00)`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const sessionIdOpt = interaction.options.getString(Opt.sessionId);
  const session = await resolveOpenSession(guildId, sessionIdOpt);

  if (!session || session.status !== "OPEN") {
    await interaction.editReply({
      content: "❌ 열린(OPEN) 세션을 찾을 수 없습니다.",
    });
    return;
  }

  const sid = String(session._id);
  let autoClose: Date | null = null;
  if (newDate.getTime() <= session.closeDateTime.getTime()) {
    autoClose = autoCloseBeforeSession(newDate);
  }

  const ok = autoClose
    ? await updateSessionTargetAndCloseDateTime(sid, newDate, autoClose)
    : await updateSessionTargetDateTime(sid, newDate);
  if (!ok) {
    await interaction.editReply({
      content: "❌ DB 업데이트에 실패했습니다.",
    });
    return;
  }

  await appendSessionLog(sid, "SESSION_TARGET_UPDATED", {
    userId: interaction.user.id,
    payload: {
      previousTarget: session.targetDateTime.toISOString(),
      newTarget: newDate.toISOString(),
      ...(autoClose
        ? {
            autoAdjustedClose: true,
            newClose: autoClose.toISOString(),
            previousClose: session.closeDateTime.toISOString(),
          }
        : {}),
    },
  });

  const refreshed = await findSessionById(sid);
  let announceUpdated = false;
  if (refreshed) {
    try {
      await refreshOpenSessionAnnouncement(interaction.client, refreshed);
      announceUpdated = true;
    } catch (err) {
      console.error("[session edit_date] 공지 메시지 임베드 갱신 실패:", err);
    }
  }

  const autoCloseNote = autoClose
    ? `\n· 응답 마감이 세션보다 늦거나 같아, 마감을 **<t:${Math.floor(autoClose.getTime() / 1000)}:F>** (세션 1시간 전·불가 시 1분 전)으로 맞췄습니다.`
    : "";

  const announceNote = announceUpdated
    ? "\n· 공지 메시지의 **세션 일시**도 반영했습니다. (시작 24시간 전 리마인드는 새 일정 기준으로 다시 판단합니다.)"
    : "\n· _(공지 임베드 자동 갱신에 실패했을 수 있습니다. 봇 권한을 확인하세요.)_";

  const pastNote =
    newDate.getTime() <= Date.now()
      ? "\n\n_세션 일시가 과거입니다. 리마인드·집계 의미를 확인해 주세요._"
      : "";

  await interaction.editReply({
    content: `✅ **${session.title}** **세션 진행 일시**를 변경했습니다. 새 일시: <t:${Math.floor(newDate.getTime() / 1000)}:F>${autoCloseNote}${announceNote}${pastNote}`,
  });
}

/**
 * `/일정 취소` — 세션 취소
 */
export async function handleSessionCancel(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!requireManageGuild(interaction)) {
    await interaction.reply({
      content: "❌ 이 명령은 **서버 관리** 권한이 있는 사용자만 사용할 수 있습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: "❌ 길드에서만 사용할 수 있습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const sessionIdOpt = interaction.options.getString(Opt.sessionId);
  const session = await resolveOpenSession(guildId, sessionIdOpt);

  if (!session || session.status !== "OPEN") {
    await interaction.editReply({
      content: "❌ 열린(OPEN) 세션을 찾을 수 없습니다.",
    });
    return;
  }

  try {
    await executeSessionCancel(
      interaction.client,
      session,
      interaction.user.id
    );
    await interaction.editReply({
      content: `✅ **${session.title}** 세션을 취소했습니다.`,
    });
  } catch (err) {
    console.error("[session cancel]", err);
    await interaction.editReply({
      content: `❌ 취소 처리 중 오류: ${err instanceof Error ? err.message : "알 수 없는 오류"}`,
    });
  }
}
