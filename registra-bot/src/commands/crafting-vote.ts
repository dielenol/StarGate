import type { ChatInputCommandInteraction, Message } from "discord.js";
import {
  CENSOR3_VOTE_CHANNEL_ID,
} from "../constants/registrar.js";
import {
  claimCraftingVotePublication,
  createCraftingVote,
  findCraftingVoteById,
  linkUncertainCraftingVotePublication,
  markCraftingVotePublicationSent,
  releaseCraftingVotePublicationAfterConfirmedDelete,
  resetUncertainCraftingVotePublication,
  resolveCraftingVote,
} from "../db/crafting-votes.js";
import {
  buildCraftingVoteResolutionReceipt,
  classifyCraftingVotePublication,
  getCraftingVotePhase,
  isCraftingVoteAnnouncementDeletionSafe,
  parseCraftingVoteButtonCustomId,
} from "../services/crafting-vote.js";
import {
  CraftingVoteOpt,
  CraftingVoteSub,
} from "../slash/ko-names.js";
import type {
  CraftingVote,
  CraftingVoteOutcome,
} from "../types/crafting-vote.js";
import { parseStrictDateTimeInput } from "../utils/date-time-input.js";
import { deferReplyAndRequireAdminOrManageGuild } from "../utils/require-admin-or-manage-guild.js";
import { resolveGuildTextSendChannel } from "../utils/resolve-guild-text-send-channel.js";
import {
  buildCraftingVoteActionRow,
  buildCraftingVoteEmbed,
} from "../utils/crafting-vote-view.js";

const E = "■ ";
const S = "◆ ";
const N = "※ ";

function buildReceiptAttachment(vote: CraftingVote) {
  const receipt = buildCraftingVoteResolutionReceipt(vote);
  if (!receipt || !vote._id) return null;
  return {
    attachment: Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8"),
    name: `crafting-vote-${vote._id.toHexString()}-receipt.json`,
  };
}

async function persistCraftingVotePublication(input: {
  voteId: string;
  guildId: string;
  operationKey: string;
  messageId: string;
}): Promise<{
  vote: CraftingVote | null;
  safeToDeleteAnnouncement: boolean;
}> {
  let markThrew = false;
  try {
    const published = await markCraftingVotePublicationSent(
      input.voteId,
      input.operationKey,
      input.messageId,
      new Date()
    );
    if (published) {
      return { vote: published, safeToDeleteAnnouncement: false };
    }
  } catch (err) {
    markThrew = true;
    console.error("[crafting-vote] publication mark response uncertain", err);
  }

  // Mongo가 commit한 뒤 응답만 유실될 수 있으므로 Discord 삭제보다 재조회가 먼저입니다.
  try {
    const persisted = await findCraftingVoteById(input.voteId, input.guildId);
    const confirmation = classifyCraftingVotePublication(persisted, {
      messageId: input.messageId,
      operationKey: input.operationKey,
    });
    if (confirmation === "SENT_CONFIRMED") {
      return { vote: persisted, safeToDeleteAnnouncement: false };
    }
    // 예외 응답은 서버 commit이 늦게 도착할 수 있어 DISPATCHING 재조회만으로
    // 삭제 안전을 선언하지 않습니다. 정상 null 응답일 때만 삭제가 안전합니다.
    if (isCraftingVoteAnnouncementDeletionSafe(markThrew, confirmation)) {
      return { vote: null, safeToDeleteAnnouncement: true };
    }
  } catch (err) {
    console.error("[crafting-vote] publication mark requery failed", err);
  }
  return { vote: null, safeToDeleteAnnouncement: false };
}

async function refreshCraftingVoteMessage(
  interaction: ChatInputCommandInteraction,
  vote: CraftingVote
): Promise<boolean> {
  if (!vote.messageId) return false;
  try {
    const channel = await interaction.client.channels.fetch(vote.channelId);
    if (!channel || !channel.isTextBased() || !("messages" in channel)) {
      return false;
    }
    const message = await channel.messages.fetch(vote.messageId);
    await message.edit({
      embeds: [buildCraftingVoteEmbed(vote)],
      components: [buildCraftingVoteActionRow(vote)],
    });
    return true;
  } catch (err) {
    console.error("[crafting-vote] message refresh failed", err);
    return false;
  }
}

async function fetchCanonicalCraftingVoteMessage(
  interaction: ChatInputCommandInteraction,
  vote: CraftingVote
): Promise<Message | null> {
  if (vote.publication.state !== "SENT" || !vote.messageId || !vote._id) {
    return null;
  }
  try {
    const channel = await interaction.client.channels.fetch(vote.channelId);
    if (!channel || !channel.isTextBased() || !("messages" in channel)) {
      return null;
    }
    const message = await channel.messages.fetch(vote.messageId);
    if (
      message.author.id !== interaction.client.user?.id ||
      !messageHasCraftingVoteButtons(message, vote._id.toHexString())
    ) {
      return null;
    }
    return message;
  } catch {
    return null;
  }
}

async function handleCreate(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const guild = interaction.guild;
  if (!guild || !interaction.guildId) {
    await interaction.editReply({ content: `${E}길드에서만 실행할 수 있습니다.` });
    return;
  }

  const requestRef = interaction.options
    .getString(CraftingVoteOpt.requestRef, true)
    .trim();
  const closeText = interaction.options.getString(
    CraftingVoteOpt.closeTime,
    true
  );
  const eligibleRole = interaction.options.getRole(
    CraftingVoteOpt.eligibleRole,
    true
  );
  const closesAt = parseStrictDateTimeInput(closeText);

  if (!requestRef) {
    await interaction.editReply({ content: `${E}요청 참조를 비워둘 수 없습니다.` });
    return;
  }
  if (!closesAt) {
    await interaction.editReply({
      content: `${E}응답 마감 형식이 잘못되었습니다. 예: 2026-08-08 21:00`,
    });
    return;
  }
  if (closesAt.getTime() <= Date.now()) {
    await interaction.editReply({
      content: `${E}응답 마감은 현재 이후여야 합니다.`,
    });
    return;
  }
  if (eligibleRole.id === guild.id) {
    await interaction.editReply({
      content: `${E}@everyone은 관료 투표 역할로 지정할 수 없습니다.`,
    });
    return;
  }

  const resolvedChannel = await resolveGuildTextSendChannel(
    guild,
    { id: CENSOR3_VOTE_CHANNEL_ID },
    null
  );
  if (!resolvedChannel.ok) {
    await interaction.editReply({
      content: `${E}지정 투표 채널(${CENSOR3_VOTE_CHANNEL_ID})에 접근할 수 없습니다. ${resolvedChannel.message}`,
    });
    return;
  }

  const now = new Date();
  let voteId: string | null = null;
  let announcement: Message | null = null;
  let publicationClaimed = false;
  let safeToDeleteAnnouncement = false;
  const operationKey = interaction.id;
  try {
    const creation = await createCraftingVote({
      guildId: interaction.guildId,
      requestRef,
      eligibleRoleId: eligibleRole.id,
      closesAt,
      createdByDiscordUserId: interaction.user.id,
      createdAt: now,
    });
    voteId = creation.voteId;
    const existing = await findCraftingVoteById(voteId, interaction.guildId);
    if (!existing) {
      throw new Error("생성된 투표 원장을 다시 읽지 못했습니다.");
    }
    if (existing.publication.state === "SENT") {
      const canonical = await fetchCanonicalCraftingVoteMessage(
        interaction,
        existing
      );
      await interaction.editReply({
        content: canonical
          ? `${N}동일 요청 참조의 제작 투표가 이미 존재합니다. 투표 ID: \`${voteId}\``
          : `${E}원장은 SENT이지만 공식 Discord 공지를 확인할 수 없습니다. 자동 재게시하지 말고 \`/제작투표 게시복구\`를 실행하십시오.`,
      });
      return;
    }
    if (existing.publication.state === "DISPATCHING") {
      await interaction.editReply({
        content: [
          `${N}이 요청의 Discord 전달 상태가 불확실하여 자동 재전송하지 않습니다.`,
          `투표 ID: \`${voteId}\``,
          `${N}\`/제작투표 게시복구\`에서 실제 채널 상태를 확인한 뒤 복구하십시오.`,
        ].join("\n"),
      });
      return;
    }
    if (
      existing.eligibleRoleId !== eligibleRole.id ||
      existing.closesAt.getTime() !== closesAt.getTime()
    ) {
      await interaction.editReply({
        content: [
          `${E}동일 요청참조의 재게시 값이 최초 원장과 다릅니다. 원장 값을 임의 변경하지 않았습니다.`,
          `최초 투표 역할: <@&${existing.eligibleRoleId}>`,
          `최초 응답 마감: <t:${Math.floor(existing.closesAt.getTime() / 1_000)}:F>`,
        ].join("\n"),
        allowedMentions: { parse: [] },
      });
      return;
    }

    const claimed = await claimCraftingVotePublication({
      voteId,
      guildId: interaction.guildId,
      operationKey,
      claimedAt: new Date(),
    });
    if (!claimed) {
      await interaction.editReply({
        content: `${N}다른 실행이 이 투표의 공지 전달을 처리 중입니다. 자동 재전송하지 않습니다.`,
      });
      return;
    }
    publicationClaimed = true;

    // Discord 공지는 전송 직후 사용할 수 있어야 하므로 렌더만 SENT 상태로 구성합니다.
    // 실제 DB 원장은 아래 messageId CAS가 성공하기 전까지 DISPATCHING입니다.
    const announcementView: CraftingVote = {
      ...claimed,
      publication: { ...claimed.publication, state: "SENT" },
    };

    announcement = await resolvedChannel.channel.send({
      content: `<@&${claimed.eligibleRoleId}> CENSOR-3 제작 동의 투표가 접수되었습니다.`,
      embeds: [buildCraftingVoteEmbed(announcementView, now)],
      components: [buildCraftingVoteActionRow(announcementView, now)],
      allowedMentions: { roles: [claimed.eligibleRoleId] },
    });
    const publication = await persistCraftingVotePublication({
      voteId,
      guildId: interaction.guildId,
      operationKey,
      messageId: announcement.id,
    });
    safeToDeleteAnnouncement = publication.safeToDeleteAnnouncement;
    if (!publication.vote) {
      throw new Error("Discord 공지 messageId를 원장에 기록하지 못했습니다.");
    }
  } catch (err) {
    let confirmedDeleted = false;
    let publicationReleased = false;
    if (announcement && safeToDeleteAnnouncement) {
      try {
        await announcement.delete();
        confirmedDeleted = true;
      } catch (deleteErr) {
        console.error("[crafting-vote] announcement rollback failed", deleteErr);
      }
    }
    if (voteId && confirmedDeleted) {
      try {
        publicationReleased =
          await releaseCraftingVotePublicationAfterConfirmedDelete({
            voteId,
            operationKey,
            actorDiscordUserId: interaction.user.id,
            reason: "공지 전송 후 원장 연결 실패; Discord 메시지 삭제 확인",
            at: new Date(),
          });
      } catch (releaseErr) {
        console.error("[crafting-vote] publication release failed", releaseErr);
      }
    }
    console.error("[crafting-vote] create failed", err);
    await interaction.editReply({
      content: !publicationClaimed
        ? `${E}투표 원장 준비에 실패했습니다. 동일 요청으로 다시 시도할 수 있습니다.`
        : confirmedDeleted && publicationReleased
          ? `${E}투표 공지를 원장에 연결하지 못해 게시물을 삭제했습니다. 동일 요청으로 다시 실행할 수 있습니다.`
          : `${E}투표 공지 전달 결과가 불확실합니다. 자동 재전송하지 않습니다. \`/제작투표 게시복구\`로 확인하십시오.`,
    });
    return;
  }

  await interaction.editReply({
    content: [
      `${S}CENSOR-3 제작 동의 투표를 등재했습니다. [공지 열람](${announcement.url})`,
      `투표 ID: \`${voteId}\``,
      `${N}자동 승인·크레딧 차감·재료 소모·인벤토리 지급은 수행하지 않습니다.`,
    ].join("\n"),
  });
}

async function handleStatus(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const voteId = interaction.options.getString(CraftingVoteOpt.voteId, true);
  const vote = await findCraftingVoteById(voteId, interaction.guildId ?? undefined);
  if (!vote) {
    await interaction.editReply({ content: `${E}해당 투표를 찾지 못했습니다.` });
    return;
  }

  const receipt = buildReceiptAttachment(vote);

  await interaction.editReply({
    embeds: [buildCraftingVoteEmbed(vote)],
    components: [],
    files: receipt ? [receipt] : [],
  });
}

function parseOutcome(value: string): CraftingVoteOutcome | null {
  if (value === "APPROVED" || value === "REJECTED" || value === "DEFERRED") {
    return value;
  }
  return null;
}

async function handleResolve(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.editReply({ content: `${E}길드에서만 실행할 수 있습니다.` });
    return;
  }

  const voteId = interaction.options.getString(CraftingVoteOpt.voteId, true);
  const outcome = parseOutcome(
    interaction.options.getString(CraftingVoteOpt.outcome, true)
  );
  const reason = interaction.options
    .getString(CraftingVoteOpt.reason, true)
    .trim();
  if (!outcome || !reason) {
    await interaction.editReply({
      content: `${E}결론과 사유를 모두 명시해야 합니다.`,
    });
    return;
  }

  const before = await findCraftingVoteById(voteId, interaction.guildId);
  if (!before) {
    await interaction.editReply({ content: `${E}해당 투표를 찾지 못했습니다.` });
    return;
  }
  const phase = getCraftingVotePhase(before);
  if (phase === "PUBLISH_PENDING") {
    await interaction.editReply({
      content: `${E}Discord 공지 전달이 확정되지 않았습니다. 먼저 게시복구를 완료하십시오.`,
    });
    return;
  }
  if (phase === "OPEN") {
    await interaction.editReply({
      content: `${E}응답 마감 전에는 결론을 기록할 수 없습니다.`,
    });
    return;
  }
  if (phase === "RESOLVED") {
    await interaction.editReply({
      content: `${N}이미 GM 결론이 기록된 투표입니다. 현황 명령으로 확인하십시오.`,
    });
    return;
  }
  if (!(await fetchCanonicalCraftingVoteMessage(interaction, before))) {
    await interaction.editReply({
      content: `${E}원장에 연결된 공식 Discord 공지를 확인할 수 없어 결론을 기록하지 않았습니다. 게시복구를 먼저 완료하십시오.`,
    });
    return;
  }

  const resolvedAt = new Date();
  const vote = await resolveCraftingVote({
    voteId,
    guildId: interaction.guildId,
    outcome,
    reason,
    resolvedByDiscordUserId: interaction.user.id,
    resolvedAt,
  });
  if (!vote) {
    await interaction.editReply({
      content: `${E}투표 상태가 동시에 변경되어 결론을 기록하지 못했습니다. 현황을 재조회하십시오.`,
    });
    return;
  }

  const receipt = buildReceiptAttachment(vote);
  if (!receipt) {
    await interaction.editReply({
      content: `${E}결론은 기록했지만 후속 receipt를 구성하지 못했습니다. 기술 담당에 문의하십시오.`,
    });
    return;
  }
  const messageUpdated = await refreshCraftingVoteMessage(interaction, vote);
  const warning = messageUpdated
    ? ""
    : `\n${N}원본 Discord 공지를 갱신하지 못했으나 DB 결론과 receipt는 기록되었습니다.`;

  await interaction.editReply({
    content: [
      `${S}GM 수동 결론을 기록했습니다: **${outcome}**`,
      `${N}이 결과는 ERP 승인 근거일 뿐, 지급·차감·제작을 자동 실행하지 않습니다.${warning}`,
    ].join("\n"),
    files: [
      receipt,
    ],
  });
}

function messageHasCraftingVoteButtons(
  message: Message,
  voteId: string
): boolean {
  const choices = new Set<string>();
  for (const row of message.components) {
    if (!("components" in row)) continue;
    for (const component of row.components) {
      if (!("customId" in component) || typeof component.customId !== "string") {
        continue;
      }
      const parsed = parseCraftingVoteButtonCustomId(component.customId);
      if (parsed?.voteId === voteId) choices.add(parsed.choice);
    }
  }
  return choices.has("YES") && choices.has("NO");
}

async function handleReconcile(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const guild = interaction.guild;
  if (!guild || !interaction.guildId) {
    await interaction.editReply({ content: `${E}길드에서만 실행할 수 있습니다.` });
    return;
  }

  const voteId = interaction.options.getString(CraftingVoteOpt.voteId, true);
  const action = interaction.options.getString(
    CraftingVoteOpt.reconciliationAction,
    true
  );
  const messageId = interaction.options
    .getString(CraftingVoteOpt.messageId)
    ?.trim();
  const reason = interaction.options
    .getString(CraftingVoteOpt.reason, true)
    .trim();
  if (!reason) {
    await interaction.editReply({ content: `${E}복구 근거를 비워둘 수 없습니다.` });
    return;
  }

  const vote = await findCraftingVoteById(voteId, interaction.guildId);
  if (!vote) {
    await interaction.editReply({ content: `${E}해당 투표를 찾지 못했습니다.` });
    return;
  }
  if (vote.publication.state === "PENDING") {
    await interaction.editReply({
      content: `${N}이 투표는 재게시 가능한 대기 상태입니다. 동일 요청참조로 생성 명령을 다시 실행하십시오.`,
    });
    return;
  }
  if (
    vote.publication.state === "SENT" &&
    (await fetchCanonicalCraftingVoteMessage(interaction, vote))
  ) {
    await interaction.editReply({
      content: `${N}이미 원장과 공식 Discord 공지가 정상적으로 연결된 투표입니다.`,
    });
    return;
  }

  if (action === "CONFIRM_NOT_SENT") {
    const reset = await resetUncertainCraftingVotePublication({
      voteId,
      guildId: interaction.guildId,
      actorDiscordUserId: interaction.user.id,
      reason,
      at: new Date(),
    });
    await interaction.editReply({
      content: reset
        ? `${S}채널에 공지가 없음을 확인한 기록을 남기고 재게시 대기로 전환했습니다. 동일 요청참조로 생성 명령을 다시 실행하십시오.`
        : `${E}상태가 동시에 변경되어 복구하지 못했습니다. 현황을 재조회하십시오.`,
    });
    return;
  }

  if (action !== "LINK_EXISTING_MESSAGE") {
    await interaction.editReply({ content: `${E}지원하지 않는 복구 동작입니다.` });
    return;
  }
  if (!messageId || !/^\d{17,19}$/.test(messageId)) {
    await interaction.editReply({
      content: `${E}기존 공지 연결에는 유효한 Discord 메시지 ID가 필요합니다.`,
    });
    return;
  }

  const resolvedChannel = await resolveGuildTextSendChannel(
    guild,
    { id: CENSOR3_VOTE_CHANNEL_ID },
    null
  );
  if (!resolvedChannel.ok) {
    await interaction.editReply({
      content: `${E}지정 투표 채널에 접근할 수 없습니다.`,
    });
    return;
  }

  let message: Message;
  try {
    message = await resolvedChannel.channel.messages.fetch(messageId);
  } catch {
    await interaction.editReply({
      content: `${E}지정 채널에서 해당 메시지를 찾지 못했습니다.`,
    });
    return;
  }
  if (
    message.author.id !== interaction.client.user?.id ||
    !messageHasCraftingVoteButtons(message, voteId)
  ) {
    await interaction.editReply({
      content: `${E}Registra가 게시한 해당 투표 ID의 동의/반대 공지가 아닙니다. 연결하지 않았습니다.`,
    });
    return;
  }

  const linked = await linkUncertainCraftingVotePublication({
    voteId,
    guildId: interaction.guildId,
    messageId,
    actorDiscordUserId: interaction.user.id,
    reason,
    at: new Date(),
  });
  if (!linked) {
    await interaction.editReply({
      content: `${E}상태가 동시에 변경되어 공지를 연결하지 못했습니다.`,
    });
    return;
  }
  const refreshed = await refreshCraftingVoteMessage(interaction, linked);
  await interaction.editReply({
    content: refreshed
      ? `${S}기존 Registra 공지를 투표 원장에 연결하고 현재 집계 화면으로 갱신했습니다.`
      : `${N}원장 연결은 완료했지만 공지 화면 갱신에 실패했습니다. 현황을 확인하십시오.`,
  });
}

export async function handleCraftingVoteCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!(await deferReplyAndRequireAdminOrManageGuild(interaction))) return;

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === CraftingVoteSub.create) {
    await handleCreate(interaction);
    return;
  }
  if (subcommand === CraftingVoteSub.status) {
    await handleStatus(interaction);
    return;
  }
  if (subcommand === CraftingVoteSub.resolve) {
    await handleResolve(interaction);
    return;
  }
  if (subcommand === CraftingVoteSub.reconcile) {
    await handleReconcile(interaction);
    return;
  }

  await interaction.editReply({
    content: `${E}지원하지 않는 제작 투표 명령입니다.`,
  });
}
