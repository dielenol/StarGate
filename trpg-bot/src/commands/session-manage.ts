/**
 * /session list | result | close | edit_close | edit_date | cancel 관리자 명령 핸들러
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
  PermissionFlagsBits,
} from "discord.js";
import { findBySessionId, countByStatus } from "../db/responses.js";
import {
  findSessionById,
  findSessionByIdInGuild,
  findLatestOpenSessionByGuild,
  findLatestClosedSessionByGuild,
  findOpenSessionsByGuild,
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
import { buildSessionResultCardBuffer } from "../utils/build-session-result-card.js";
import type { Session } from "../types/session.js";

/** 버튼 customId는 button-handler와 동일해야 함 */
const ATTEND_PREFIX = "trpg:attend:";

const LIST_EMBED_COLOR = 0xc5a059;
/** 임베드 description 한도(여유) */
const LIST_DESC_SAFE_MAX = 3900;
/** 한 번에 표시할 최대 세션 수 */
const LIST_MAX_ITEMS = 20;

/**
 * `/session list` — 이 길드의 OPEN 세션 목록 (에페메랄)
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
      text: `처음 ${LIST_MAX_ITEMS}건만 표시 (전체 ${total}건)`,
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

function requireManageGuild(interaction: ChatInputCommandInteraction): boolean {
  const perms = interaction.memberPermissions;
  if (!perms?.has(PermissionFlagsBits.ManageGuild)) {
    return false;
  }
  return true;
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
 * `/session result` — 현재 집계 또는 최종 결과 (에페메랄)
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
  if (!guildId) {
    await interaction.reply({
      content: "❌ 길드에서만 사용할 수 있습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const sessionIdOpt = interaction.options.getString("session_id");
  const session = await resolveSessionForResult(guildId, sessionIdOpt);

  if (!session) {
    await interaction.editReply({
      content:
        "❌ 대상 세션을 찾을 수 없습니다.\n" +
        "· `session_id`를 적었다면 ID(생성 완료 에페메랄 메시지)를 확인하세요.\n" +
        "· 비웠다면 이 서버에 **진행 중(OPEN)** 또는 **마감(CLOSED)** 세션이 DB에 없는 상태입니다.",
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
  const resultHeader = (extra: string) =>
    [
      `**${session.title}** · \`${sid}\`${pickedAutomatically ? " · _자동 선택(서버 최근 OPEN→없으면 CLOSED, 생성자 무관)_" : ""}`,
      extra,
    ]
      .filter(Boolean)
      .join("\n");

  if (session.status === "CANCELED") {
    await interaction.editReply({
      content: resultHeader(`❌ 이 세션은 취소되었습니다.`),
    });
    return;
  }

  if (session.status === "OPEN") {
    const noResponseIdsOpen = await getNonResponders(
      guild,
      session.targetRoleId,
      responses,
      members
    );
    const embed = buildSessionEmbed(session, counts, yesIds, noIds, sid);
    embed.setFooter({ text: "현재 집계입니다. (진행 중)" });
    const png = await buildSessionResultCardBuffer({
      session,
      guildId,
      members,
      responses,
      yesIds,
      noIds,
      noResponseIds: noResponseIdsOpen,
      cardMode: "open",
    });
    await interaction.editReply({
      content: resultHeader(""),
      embeds: [embed],
      ...(png
        ? { files: [new AttachmentBuilder(png, { name: "session-result.png" })] }
        : {}),
    });
    return;
  }

  // CLOSED
  const noResponseIds = await getNonResponders(
    guild,
    session.targetRoleId,
    responses,
    members
  );
  const embed = buildResultEmbed(session, yesIds, noIds, noResponseIds);
  const pngClosed = await buildSessionResultCardBuffer({
    session,
    guildId,
    members,
    responses,
    yesIds,
    noIds,
    noResponseIds,
    cardMode: "closed",
  });
  await interaction.editReply({
    content: resultHeader(""),
    embeds: [embed],
    ...(pngClosed
      ? { files: [new AttachmentBuilder(pngClosed, { name: "session-result.png" })] }
      : {}),
  });
}

/**
 * `/session close` — 강제 마감
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

  const sessionIdOpt = interaction.options.getString("session_id");
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
 * `/session edit_close` — 응답 마감 일시 변경
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

  const newCloseStr = interaction.options.getString("new_close", true);
  const newClose = parseDateTime(newCloseStr);
  if (!newClose) {
    await interaction.reply({
      content: "❌ `new_close` 날짜 형식이 올바르지 않습니다. (예: 2026-03-22 20:00)",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const sessionIdOpt = interaction.options.getString("session_id");
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
      "_마감이 **세션 일시와 같거나 그 이후**입니다. 필요하면 `/session edit_date`로 세션 일시를 조정하세요._"
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
 * `/session edit_date` — 세션 진행 일시 변경
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

  const newDateStr = interaction.options.getString("new_date", true);
  const newDate = parseDateTime(newDateStr);
  if (!newDate) {
    await interaction.reply({
      content:
        "❌ `new_date` 날짜 형식이 올바르지 않습니다. (예: 2026-03-22 20:00)",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const sessionIdOpt = interaction.options.getString("session_id");
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
 * `/session cancel` — 세션 취소
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

  const sessionIdOpt = interaction.options.getString("session_id");
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
