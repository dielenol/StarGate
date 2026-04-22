/**
 * /일정 목록·한눈에·달력·집계·마감·응답마감변경·일정변경·취소 관리자 핸들러
 *
 * @module commands/session-manage
 */

import {
  type ChatInputCommandInteraction,
  type Client,
  type TextChannel,
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import {
  findBySessionId,
  countByStatus,
  findUserParticipationsInGuild,
} from "../db/responses.js";
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
  executeSessionRetract,
} from "../services/session-close.js";
import { isResultCardImageEnabled } from "../config.js";
import {
  buildSessionResultCardBuffer,
  buildGuildMonthCalendarOnlyBuffer,
  buildParticipationMonthCalendarBuffer,
  hasParticipationCalendarMarksInMonth,
} from "../utils/build-session-result-card.js";
import { ATTEND_BUTTON_PREFIX } from "../constants/registrar.js";
import { D, L } from "../constants/registrar-voice.js";
import { resolveParticipationCodename } from "../constants/participation-codename.js";
import { Opt, SCHEDULE_ROOT, Sub } from "../slash/ko-names.js";
import {
  deferReplyAndRequireManageGuild,
  hasManageGuildAfterDeferred,
} from "../utils/require-manage-guild.js";
import { resolveGuildTextSendChannel } from "../utils/resolve-guild-text-send-channel.js";
import { safeTitleForAnnouncePing } from "../utils/safe-announce-title.js";
import { buildAnnounceLinkRow } from "../utils/announce-link.js";
import {
  canIssueParticipationImage,
  getParticipationImageCooldownMs,
  markParticipationImageIssued,
  msUntilNextParticipationImage,
  participationImageCooldownKey,
} from "../utils/participation-image-cooldown.js";
import type { Session, SessionStatus } from "../types/session.js";
import { parseStrictDateTimeInput } from "../utils/date-time-input.js";

/** 버튼 customId는 button-handler와 동일해야 함 */
const ATTEND_PREFIX = ATTEND_BUTTON_PREFIX;

const LIST_EMBED_COLOR = 0xc5a059;
/** 임베드 description 한도(여유) */
const LIST_DESC_SAFE_MAX = 3900;
/** 한 번에 표시할 최대 세션 수 */
const LIST_MAX_ITEMS = 20;
/** `/일정 참여확인` — 표시 상한(전체 건수는 푸터에 안내) */
const PARTICIPATION_CHECK_MAX_ITEMS = 20;
/** 참여확인 임베드 description 여유 한도 */
const PARTICIPATION_DESC_SAFE_MAX = 3900;
/** overview: OPEN·CLOSED 세션 일시 순·월별 표에 포함할 최대 건수 */
const OVERVIEW_MAX_SESSIONS = 100;
/** overview: 임베드 description 여유 한도 */
const OVERVIEW_DESC_SAFE_MAX = 3800;
/** overview: 분할 임베드 최대 개수 */
const OVERVIEW_MAX_EMBEDS = 6;
/** result: OPEN 여러 개일 때 자동 선택 대신 안내에 줄 최대 줄 수 */
const RESULT_MULTI_OPEN_PREVIEW = 8;
/** 파괴적 관리자 명령에서 OPEN 후보를 안내할 최대 줄 수 */
const MUTATION_MULTI_OPEN_PREVIEW = 8;

/**
 * `/일정 목록` — 이 길드의 OPEN 세션 목록 (에페메랄)
 */
export async function handleSessionList(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!(await deferReplyAndRequireManageGuild(interaction))) return;
  const guildId = interaction.guildId!;

  const sessions = await findOpenSessionsByGuild(guildId);

  if (sessions.length === 0) {
    await interaction.editReply({
      content: D.listEmpty,
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
      `【${i + 1}】 ${titleShort}\n` +
        `등록번호 \`${sid}\` · 공지 ${ch} · 등록 <@${s.createdBy}>\n` +
        `· 배정 <t:${tStart}:F>\n` +
        `· 회신 마감 <t:${tClose}:F>`
    );
  }

  let description = lines.join("\n\n");
  if (description.length > LIST_DESC_SAFE_MAX) {
    description =
      description.slice(0, LIST_DESC_SAFE_MAX - 30).trimEnd() + "\n… _(일부만 표시)_";
  }

  const embed = new EmbedBuilder()
    .setTitle(D.listTitle(total))
    .setColor(LIST_EMBED_COLOR)
    .setDescription(description)
    .setTimestamp();

  if (total > LIST_MAX_ITEMS) {
    embed.setFooter({
      text: D.listFooterMore(
        LIST_MAX_ITEMS,
        total,
        `/${SCHEDULE_ROOT} ${Sub.overview}`
      ),
    });
  } else {
    embed.setFooter({
      text: D.listFooterAll(`/${SCHEDULE_ROOT} ${Sub.overview}`),
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

/**
 * 접수 중인 등록 일정 공지 임베드·버튼을 DB 기준으로 다시 그립니다.
 *
 * 성공 시 해당 채널을 반환해 호출처가 동일 guild/channel을 **재fetch 없이** 이어
 * 다른 메시지 전송(예: 변경 알림)에 재사용할 수 있도록 합니다.
 */
async function refreshOpenSessionAnnouncement(
  client: Client,
  session: Session
): Promise<{ channel: TextChannel } | null> {
  if (!session.messageId?.trim()) return null;

  const guild = await client.guilds.fetch(session.guildId);
  const channel = await guild.channels.fetch(session.channelId);
  if (!channel?.isTextBased() || !("messages" in channel)) return null;

  const sid = String(session._id);
  const counts = await countByStatus(sid);
  const responses = await findBySessionId(sid);
  const yesIds = responses.filter((r) => r.status === "YES").map((r) => r.userId);
  const noIds = responses.filter((r) => r.status === "NO").map((r) => r.userId);

  const embed = buildSessionEmbed(session, counts, yesIds, noIds, sid);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${ATTEND_PREFIX}${sid}:yes`)
      .setLabel("가용")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${ATTEND_PREFIX}${sid}:no`)
      .setLabel("불가")
      .setStyle(ButtonStyle.Danger)
  );

  const msg = await channel.messages.fetch(session.messageId);
  await msg.edit({ embeds: [embed], components: [row] });
  return { channel: channel as TextChannel };
}

type ResolveOpenSessionForMutationResult =
  | { kind: "resolved"; session: Session }
  | { kind: "not_found" }
  | { kind: "ambiguous"; sessions: Session[] };

async function resolveOpenSessionForMutation(
  guildId: string,
  sessionIdOpt: string | null
): Promise<ResolveOpenSessionForMutationResult> {
  const trimmed = sessionIdOpt?.trim();
  if (trimmed) {
    const session = await findSessionByIdInGuild(trimmed, guildId);
    if (!session) return { kind: "not_found" };
    return { kind: "resolved", session };
  }

  const openSessions = await findOpenSessionsByGuild(guildId);
  if (openSessions.length === 0) return { kind: "not_found" };
  if (openSessions.length === 1) {
    return { kind: "resolved", session: openSessions[0]! };
  }
  return { kind: "ambiguous", sessions: openSessions };
}

function buildOpenSessionPreview(
  sessions: Session[]
): { lines: string; more: string } {
  const lines = [...sessions]
    .sort((a, b) => a.targetDateTime.getTime() - b.targetDateTime.getTime())
    .slice(0, MUTATION_MULTI_OPEN_PREVIEW)
    .map((s, i) => {
      const sid = String(s._id);
      const ts = Math.floor(s.targetDateTime.getTime() / 1000);
      const title = s.title.length > 44 ? `${s.title.slice(0, 41)}…` : s.title;
      return `${i + 1}. **${title}** — \`${sid}\` — 배정 <t:${ts}:D>`;
    })
    .join("\n");

  const more =
    sessions.length > MUTATION_MULTI_OPEN_PREVIEW
      ? `\n… 외 ${sessions.length - MUTATION_MULTI_OPEN_PREVIEW}건`
      : "";

  return { lines, more };
}

async function replyNeedRegistrationIdForMutation(
  interaction: ChatInputCommandInteraction,
  sessions: Session[],
  commandName: string
): Promise<void> {
  const { lines, more } = buildOpenSessionPreview(sessions);

  await interaction.editReply({
    content: D.mutationMultiOpen(
      sessions.length,
      Opt.registrationId,
      commandName
    ),
  });
  await interaction.followUp({
    flags: MessageFlags.Ephemeral,
    content: D.mutationPickIds(
      lines,
      more,
      commandName,
      `/${SCHEDULE_ROOT} ${Sub.overview}`
    ),
  });
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
 * `/일정 한눈에` — 접수 중·마감 전체를 **배정 일시 기준 월별**로 (에페메랄, PNG 없음)
 *
 * 집계·PNG는 `/일정 집계`를 씁니다.
 */
export async function handleSessionOverview(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!(await deferReplyAndRequireManageGuild(interaction))) return;
  const guildId = interaction.guildId!;

  const raw = await findOpenAndClosedSessionsByGuildOrderByTarget(
    guildId,
    OVERVIEW_MAX_SESSIONS + 1
  );

  if (raw.length === 0) {
    await interaction.editReply({
      content: D.overviewEmpty,
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
        const st = participationStatusLabel(s.status);
        const t = s.title.length > 48 ? `${s.title.slice(0, 45)}…` : s.title;
        return `· 【${st}】 ${t}\n  \`${sid}\` · ${ch} · 등록 <@${s.createdBy}> · 배정 <t:${ts}:f> · 회신마감 <t:${tc}:f>`;
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
    await interaction.editReply({ content: D.overviewNoRender });
    return;
  }

  const omittedTail = chunk.trim().length > 0;
  if (omittedTail) {
    const last = embeds[embeds.length - 1]!;
    last.setDescription(
      `${last.data.description ?? ""}\n\n${D.overviewOmitted}`
    );
  }

  while (embeds.length > 10) embeds.pop();

  embeds[0]!.setTitle(D.overviewTitle);
  for (let i = 1; i < embeds.length; i++) {
    embeds[i]!.setTitle(D.overviewCont(i, embeds.length));
  }

  const foot: string[] = [];
  if (hitSessionCap) {
    foot.push(`최대 ${OVERVIEW_MAX_SESSIONS}건까지 표시`);
  }
  if (omittedTail || embeds.length >= OVERVIEW_MAX_EMBEDS) {
    foot.push(`분할·길이 한도`);
  }
  foot.push(
    D.overviewFooterTools(
      SCHEDULE_ROOT,
      Sub.result,
      Opt.registrationId,
      Opt.withImage,
      Sub.calendar
    )
  );
  embeds[embeds.length - 1]!.setFooter({ text: foot.join(" · ") });

  await interaction.editReply({ embeds });
}

/**
 * `/일정 달력` — 올해 지정 월의 등록 일정만 월간 캘린더 PNG (격자만)
 */
export async function handleSessionMonthCalendar(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!(await deferReplyAndRequireManageGuild(interaction))) return;

  const guildId = interaction.guildId!;
  let guild = interaction.guild;
  if (!guild) {
    try {
      guild = await interaction.client.guilds.fetch(guildId);
    } catch {
      await interaction.editReply({ content: D.guildOnly });
      return;
    }
  }

  const month = interaction.options.getInteger(Opt.month, true);
  const year = new Date().getFullYear();
  const monthIndex = month - 1;

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
      content: D.calImageOff,
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
      content: D.calRenderFail,
    });
    return;
  }

  try {
    const msg = await textChannel.send({
      content: D.calPosted(year, month),
      files: [new AttachmentBuilder(buf, { name: "session-calendar.png" })],
    });
    await interaction.editReply({
      content: D.calDone(msg.url),
    });
  } catch (err) {
    console.error(L.sessionCalendar, err);
    const missingAccess =
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: unknown }).code === 50001;
    await interaction.editReply({
      content: missingAccess
        ? D.calMissingAccess
        : D.calSendFail(
            err instanceof Error ? err.message : "원인 미상"
          ),
    });
  }
}

/**
 * `/일정 집계` — 한 건 집계·확정 보고 (채널 공개). 등록 ID는 실행 관리자에게만 에페메랄.
 */
export async function handleSessionResult(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!(await deferReplyAndRequireManageGuild(interaction))) return;

  const guildId = interaction.guildId!;
  let guildBase = interaction.guild;
  if (!guildBase) {
    try {
      guildBase = await interaction.client.guilds.fetch(guildId);
    } catch {
      await interaction.editReply({ content: D.guildOnly });
      return;
    }
  }

  const sessionIdOpt = interaction.options.getString(Opt.registrationId);
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
          return `${i + 1}. **${title}** — \`${sid}\` — 배정 <t:${ts}:D>`;
        })
        .join("\n");
      const more =
        openOnly.length > RESULT_MULTI_OPEN_PREVIEW
          ? `\n… 외 ${openOnly.length - RESULT_MULTI_OPEN_PREVIEW}건`
          : "";
      await interaction.editReply({
        content: D.resultMultiOpen(
          openOnly.length,
          Opt.registrationId,
          `/${SCHEDULE_ROOT} ${Sub.overview}`
        ),
      });
      await interaction.followUp({
        flags: MessageFlags.Ephemeral,
        content: D.resultPickIds(
          lines,
          more,
          `/${SCHEDULE_ROOT} ${Sub.result}`,
          `/${SCHEDULE_ROOT} ${Sub.overview}`
        ),
      });
      return;
    }
  }

  const session = await resolveSessionForResult(guildId, sessionIdOpt);

  if (!session) {
    await interaction.editReply({
      content: D.resultNotFound(
        Opt.registrationId,
        `/${SCHEDULE_ROOT} ${Sub.overview}`
      ),
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
      content: D.resultEphemeralId(
        sid,
        `/${SCHEDULE_ROOT}`,
        Opt.registrationId
      ),
    });
  };

  if (session.status === "CANCELED") {
    await interaction.editReply({
      content: resultHeaderPublic(D.resultCanceled),
    });
    await sendSessionIdToInvoker();
    return;
  }

  if (session.status === "CLOSING") {
    await interaction.editReply({
      content: resultHeaderPublic(D.resultClosing),
    });
    await sendSessionIdToInvoker();
    return;
  }

  if (session.status === "CANCELING") {
    await interaction.editReply({
      content: resultHeaderPublic(D.resultCanceling),
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
    console.error(L.sessionResult(ctx), err);
    const missingAccess =
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: unknown }).code === 50001;
    await interaction.editReply({
      content: missingAccess
        ? D.resultChannelDeny
        : D.resultSendFail(
            err instanceof Error ? err.message : "원인 미상"
          ),
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
    embed.setFooter({ text: D.resultOpenFooter });
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
        content: D.resultPosted(msg.url),
      });
      await sendSessionIdToInvoker();
    } catch (err) {
      await replySendError(err, "접수 중 집계 송부");
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
      content: D.resultPosted(msg.url),
    });
    await sendSessionIdToInvoker();
  } catch (err) {
    await replySendError(err, "마감 집계 송부");
  }
}

/**
 * `/일정 마감` — 강제 마감
 */
export async function handleSessionClose(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!(await deferReplyAndRequireManageGuild(interaction))) return;
  const guildId = interaction.guildId!;

  const sessionIdOpt = interaction.options.getString(Opt.registrationId);
  const resolved = await resolveOpenSessionForMutation(guildId, sessionIdOpt);
  if (resolved.kind === "ambiguous") {
    await replyNeedRegistrationIdForMutation(
      interaction,
      resolved.sessions,
      `/${SCHEDULE_ROOT} ${Sub.close}`
    );
    return;
  }
  const session = resolved.kind === "resolved" ? resolved.session : null;

  if (!session) {
    await interaction.editReply({
      content: D.closeNoOpen,
    });
    return;
  }

  if (session.status === "CLOSING") {
    await interaction.editReply({
      content: D.closeInProgress,
    });
    return;
  }

  if (session.status !== "OPEN") {
    await interaction.editReply({
      content: D.closeNotOpen,
    });
    return;
  }

  try {
    const result = await executeSessionClose(interaction.client, session, {
      kind: "force",
      actorUserId: interaction.user.id,
    });
    if (!result.transitioned) {
      await interaction.editReply({
        content: D.closeAlready,
      });
      return;
    }
    const warningNote =
      result.warnings.length > 0
        ? `${D.warnPrefix}${result.warnings.join(" / ")}`
        : "";
    await interaction.editReply({
      content: D.closeDone(session.title, warningNote),
    });
  } catch (err) {
    console.error(L.sessionCloseCmd, err);
    await interaction.editReply({
      content: D.closeErr(
        err instanceof Error ? err.message : "원인 미상"
      ),
    });
  }
}

/**
 * `/일정 응답마감변경` — 응답 마감 일시 변경
 */
export async function handleSessionEditClose(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: D.guildOnly,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (!(await hasManageGuildAfterDeferred(interaction))) {
    await interaction.editReply({ content: D.permManage });
    return;
  }

  const guildId = interaction.guildId;
  const newCloseStr = interaction.options.getString(Opt.newClose, true);
  const newClose = parseStrictDateTimeInput(newCloseStr);
  if (!newClose) {
    await interaction.editReply({
      content: D.editCloseDateBad(Opt.newClose),
    });
    return;
  }

  const sessionIdOpt = interaction.options.getString(Opt.registrationId);
  const resolved = await resolveOpenSessionForMutation(guildId, sessionIdOpt);
  if (resolved.kind === "ambiguous") {
    await replyNeedRegistrationIdForMutation(
      interaction,
      resolved.sessions,
      `/${SCHEDULE_ROOT} ${Sub.editClose}`
    );
    return;
  }
  const session = resolved.kind === "resolved" ? resolved.session : null;

  if (!session || session.status !== "OPEN") {
    await interaction.editReply({
      content: D.closeNoOpen,
    });
    return;
  }

  const now = new Date();
  const notes: string[] = [];
  if (newClose.getTime() <= now.getTime()) {
    notes.push(D.warnClosePast);
  }
  if (newClose.getTime() >= session.targetDateTime.getTime()) {
    notes.push(D.warnCloseAfterTarget(`/${SCHEDULE_ROOT} ${Sub.editDate}`));
  }

  const sid = String(session._id);
  const updateResult = await updateSessionCloseDateTime(sid, newClose);
  if (updateResult !== "updated") {
    await interaction.editReply({
      content:
        updateResult === "not_open" ? D.editMutationLostOpen : D.dbFail,
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
      console.error(L.sessionEditClose, err);
    }
  }

  const announceNote = announceUpdated
    ? D.announceOkClose
    : D.announceFailClose;

  const warnBlock = notes.length ? `\n\n${notes.join("\n")}` : "";

  await interaction.editReply({
    content: D.editCloseDone(
      session.title,
      `<t:${Math.floor(newClose.getTime() / 1000)}:F>`,
      announceNote,
      warnBlock
    ),
  });
}

/** 배정 1시간 전을 응답 마감으로 쓰기 (일정만 앞당길 때 자동 맞춤) */
function autoCloseBeforeSession(sessionStart: Date): Date {
  return new Date(sessionStart.getTime() - 60 * 60 * 1000);
}

/**
 * `/일정 일정변경` — 배정 일시 변경
 */
export async function handleSessionEditDate(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: D.guildOnly,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (!(await hasManageGuildAfterDeferred(interaction))) {
    await interaction.editReply({ content: D.permManage });
    return;
  }

  const guildId = interaction.guildId;
  const newDateStr = interaction.options.getString(Opt.newDate, true);
  const newDate = parseStrictDateTimeInput(newDateStr);
  if (!newDate) {
    await interaction.editReply({
      content: D.editDateBad(Opt.newDate),
    });
    return;
  }

  const sessionIdOpt = interaction.options.getString(Opt.registrationId);
  const resolved = await resolveOpenSessionForMutation(guildId, sessionIdOpt);
  if (resolved.kind === "ambiguous") {
    await replyNeedRegistrationIdForMutation(
      interaction,
      resolved.sessions,
      `/${SCHEDULE_ROOT} ${Sub.editDate}`
    );
    return;
  }
  const session = resolved.kind === "resolved" ? resolved.session : null;

  if (!session || session.status !== "OPEN") {
    await interaction.editReply({
      content: D.closeNoOpen,
    });
    return;
  }

  const sid = String(session._id);
  let autoClose: Date | null = null;
  if (newDate.getTime() <= session.closeDateTime.getTime()) {
    autoClose = autoCloseBeforeSession(newDate);
  }

  const updateResult = autoClose
    ? await updateSessionTargetAndCloseDateTime(sid, newDate, autoClose)
    : await updateSessionTargetDateTime(sid, newDate);
  if (updateResult !== "updated") {
    await interaction.editReply({
      content:
        updateResult === "not_open" ? D.editMutationLostOpen : D.dbFail,
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
  let refreshResult: { channel: TextChannel } | null = null;
  if (refreshed) {
    try {
      refreshResult = await refreshOpenSessionAnnouncement(
        interaction.client,
        refreshed
      );
    } catch (err) {
      console.error(L.sessionEditDate, err);
    }
  }
  const announceUpdated = refreshResult !== null;

  let channelNotifyFailed = false;
  if (refreshResult && refreshed) {
    try {
      const previousTs = Math.floor(session.targetDateTime.getTime() / 1000);
      const newTs = Math.floor(newDate.getTime() / 1000);
      const autoCloseLine = autoClose
        ? D.editDateChannelAutoCloseLine(
            Math.floor(autoClose.getTime() / 1000)
          )
        : "";
      const announceRow = buildAnnounceLinkRow(refreshed);
      await refreshResult.channel.send({
        content: D.editDateChannelAnnounceWithHere(
          safeTitleForAnnouncePing(refreshed.title),
          previousTs,
          newTs,
          autoCloseLine
        ),
        components: announceRow ? [announceRow] : undefined,
        allowedMentions: { parse: ["everyone"] },
      });
    } catch (err) {
      channelNotifyFailed = true;
      console.error(L.sessionEditDate, err);
    }
  }

  const autoCloseNote = autoClose
    ? D.autoCloseNote(
        `<t:${Math.floor(autoClose.getTime() / 1000)}:F>`
      )
    : "";

  const announceNote = announceUpdated
    ? D.announceOkDate
    : D.announceFailDate;

  const pastNote =
    newDate.getTime() <= Date.now() ? D.pastDateWarn : "";

  const notifyFailNote = channelNotifyFailed
    ? `\n${D.editDateChannelNotifyFail}`
    : "";

  await interaction.editReply({
    content:
      D.editDateDone(
        session.title,
        `<t:${Math.floor(newDate.getTime() / 1000)}:F>`,
        autoCloseNote,
        announceNote,
        pastNote
      ) + notifyFailNote,
  });
}

function participationStatusLabel(status: SessionStatus): string {
  switch (status) {
    case "OPEN":
      return D.statusOpen;
    case "CLOSING":
      return D.statusClosing;
    case "CLOSED":
      return D.statusClosed;
    case "CANCELING":
      return D.statusCanceling;
    case "CANCELED":
      return D.statusCanceled;
    default:
      return String(status);
  }
}

/**
 * `/일정 참여확인` — 본인이 **가용(YES)** 으로 제출한 등록 일정만 (에페메랄).
 * `RESULT_CARD_IMAGE`가 켜져 있으면 **쿨다운이 지난 조회에만** 이번 달 **월간 캘린더 PNG**를 함께 붙입니다 (`/일정 달력`과 동일 격자).
 */
export async function handleSessionParticipationCheck(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: D.guildOnly,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const userId = interaction.user.id;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { items, totalInGuild } = await findUserParticipationsInGuild(
    guildId,
    userId,
    PARTICIPATION_CHECK_MAX_ITEMS,
    { responseStatus: "YES" }
  );

  if (totalInGuild === 0) {
    await interaction.editReply({
      content: D.partEmpty,
    });
    return;
  }

  let displayNick = interaction.user.username;
  try {
    const m = await interaction.guild!.members.fetch(userId);
    displayNick = m.displayName ?? interaction.user.username;
  } catch {
    /* 길드 멤버 캐시 실패 시 유저명만 사용 */
  }
  const codeName = resolveParticipationCodename(displayNick);
  const introLine = D.partIntro(displayNick, codeName);

  const lines: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const { session: s } = items[i];
    const sid = String(s._id);
    const tStart = Math.floor(s.targetDateTime.getTime() / 1000);
    const tClose = Math.floor(s.closeDateTime.getTime() / 1000);
    const announceUrl = `https://discord.com/channels/${guildId}/${s.channelId}/${s.messageId}`;
    const titleShort =
      s.title.length > 80 ? `${s.title.slice(0, 77)}...` : s.title;
    lines.push(
      `**${i + 1}.** ${titleShort}\n` +
        `${D.partLineState(participationStatusLabel(s.status))}\n` +
        `${D.partLineAssign(tStart)}\n` +
        `${D.partLineClose(tClose)}\n` +
        `${D.partLineLink(announceUrl, sid)}`
    );
  }

  let body = lines.join("\n\n");
  if (body.length > PARTICIPATION_DESC_SAFE_MAX) {
    body =
      body.slice(0, PARTICIPATION_DESC_SAFE_MAX - 20).trimEnd() +
      D.partDescTrunc;
  }

  let description = `${introLine}\n\n${body}`;
  if (description.length > 4096) {
    const budget = Math.max(0, 4096 - (introLine.length + 2 + D.partDescTrunc.length));
    body =
      body.slice(0, budget).trimEnd() + (body.length > budget ? D.partDescTrunc : "");
    description = `${introLine}\n\n${body}`;
  }

  const embed = new EmbedBuilder()
    .setColor(LIST_EMBED_COLOR)
    .setTitle(D.partTitle)
    .setDescription(description);

  const footerBits: string[] = [];
  if (totalInGuild > PARTICIPATION_CHECK_MAX_ITEMS) {
    footerBits.push(
      D.partFooterCap(totalInGuild, PARTICIPATION_CHECK_MAX_ITEMS)
    );
  }

  const cooldownKey = participationImageCooldownKey(guildId, userId);
  const imageOn = isResultCardImageEnabled();
  const canImage = imageOn && canIssueParticipationImage(cooldownKey);

  if (imageOn && !canImage) {
    const ms = msUntilNextParticipationImage(cooldownKey);
    const mins = Math.max(1, Math.ceil(ms / 60_000));
    footerBits.push(D.partCooldown(mins));
  }

  if (footerBits.length > 0) {
    embed.setFooter({ text: footerBits.join(" · ") });
  }

  if (canImage) {
    const now = new Date();
    const calYear = now.getFullYear();
    const calMonth = now.getMonth();

    if (!hasParticipationCalendarMarksInMonth(items, calYear, calMonth)) {
      footerBits.push(D.partNoCalMarks);
      embed.setFooter({
        text:
          footerBits.join(" · ").length > 2048
            ? `${footerBits.join(" · ").slice(0, 2045)}…`
            : footerBits.join(" · "),
      });
    } else {
      const png = await buildParticipationMonthCalendarBuffer(
        items,
        calYear,
        calMonth
      );

      if (png) {
        markParticipationImageIssued(cooldownKey);
        const cdMs = getParticipationImageCooldownMs();
        const extraFooter: string[] = [];
        const nextCal = new Date(calYear, calMonth + 1, 1);
        const y2 = nextCal.getFullYear();
        const m2 = nextCal.getMonth();
        extraFooter.push(
          D.partCalFooterTwo(
            calYear,
            calMonth + 1,
            y2,
            m2 + 1,
            PARTICIPATION_CHECK_MAX_ITEMS,
            cdMs > 0
              ? D.partCalCdNext(Math.ceil(cdMs / 60_000))
              : ""
          )
        );
        const base = footerBits.length > 0 ? footerBits.join(" · ") : "";
        const merged = [base, ...extraFooter].filter(Boolean).join(" · ");
        if (merged.length > 0) {
          embed.setFooter({
            text:
              merged.length > 2048 ? `${merged.slice(0, 2045)}…` : merged,
          });
        }
        await interaction.editReply({
          embeds: [embed],
          files: [
            new AttachmentBuilder(png, {
              name: "participation-calendar.png",
            }),
          ],
        });
        return;
      }

      const failDesc = description + D.partCalFail;
      embed.setDescription(
        failDesc.length > 4096 ? `${failDesc.slice(0, 4093)}…` : failDesc
      );
    }
  }

  await interaction.editReply({ embeds: [embed] });
}

/**
 * `/일정 취소` — 등록 일정 취소
 */
export async function handleSessionCancel(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!(await deferReplyAndRequireManageGuild(interaction))) return;
  const guildId = interaction.guildId!;

  const sessionIdOpt = interaction.options.getString(Opt.registrationId);
  const reasonOpt = interaction.options.getString(Opt.reason);
  const reason = reasonOpt?.trim() ? reasonOpt.trim() : null;

  const resolved = await resolveOpenSessionForMutation(guildId, sessionIdOpt);
  if (resolved.kind === "ambiguous") {
    await replyNeedRegistrationIdForMutation(
      interaction,
      resolved.sessions,
      `/${SCHEDULE_ROOT} ${Sub.cancel}`
    );
    return;
  }
  const session = resolved.kind === "resolved" ? resolved.session : null;

  if (!session) {
    await interaction.editReply({
      content: D.cancelNoOpen,
    });
    return;
  }

  if (session.status === "CANCELING") {
    await interaction.editReply({
      content: D.cancelInProgress,
    });
    return;
  }

  if (session.status === "CLOSING") {
    await interaction.editReply({
      content: D.cancelOnClosingBlocked,
    });
    return;
  }

  // CLOSED 사후 철회 경로 — 확정 보고 이후 운영자 재량 취소
  if (session.status === "CLOSED") {
    try {
      const result = await executeSessionRetract(
        interaction.client,
        session,
        interaction.user.id,
        reason
      );
      if (!result.transitioned) {
        await interaction.editReply({ content: D.retractAlready });
        return;
      }
      const warningNote =
        result.warnings.length > 0
          ? `${D.warnPrefix}${result.warnings.join(" / ")}`
          : "";
      await interaction.editReply({
        content: D.retractDone(session.title, reason, warningNote),
      });
    } catch (err) {
      console.error(L.sessionCancelCmd, err);
      await interaction.editReply({
        content: D.cancelErr(
          err instanceof Error ? err.message : "원인 미상"
        ),
      });
    }
    return;
  }

  if (session.status !== "OPEN") {
    await interaction.editReply({
      content: D.cancelNoOpen,
    });
    return;
  }

  try {
    const result = await executeSessionCancel(
      interaction.client,
      session,
      interaction.user.id,
      reason
    );
    if (!result.transitioned) {
      await interaction.editReply({
        content: D.cancelAlready,
      });
      return;
    }
    const warningNote =
      result.warnings.length > 0
        ? `${D.warnPrefix}${result.warnings.join(" / ")}`
        : "";
    await interaction.editReply({
      content: D.cancelDone(session.title, warningNote),
    });
  } catch (err) {
    console.error(L.sessionCancelCmd, err);
    await interaction.editReply({
      content: D.cancelErr(
        err instanceof Error ? err.message : "원인 미상"
      ),
    });
  }
}
