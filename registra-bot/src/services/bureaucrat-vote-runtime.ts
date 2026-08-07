import {
  BUREAUCRAT_VOTE_CHANNEL_ID,
  claimBureaucratVotePublicationById,
  claimNextBureaucratVotePublication,
  closeBureaucratVote,
  decideBureaucratVoteMajority,
  findBureaucratVoteById,
  listDueBureaucratVotes,
  markBureaucratVotePublicationSent,
  releaseBureaucratVotePublication,
  type BureaucratVote,
  type BureaucratVoteActor,
} from "@stargate/shared-db";
import type { Client, Message, TextChannel } from "discord.js";

import { bureaucratVoteAuthorLabel } from "./bureaucrat-vote.js";
import {
  buildBureaucratVoteActionRow,
  buildBureaucratVoteEmbed,
  buildBureaucratVoteMessage,
} from "../utils/bureaucrat-vote-view.js";

const RECOVERY_PAGE_LIMIT = 5;
const RECOVERY_LOOKBACK_MARGIN_MS = 5 * 60 * 1_000;
const MARK_SENT_ATTEMPTS = 3;

async function resolveVoteChannel(
  client: Client,
  vote: BureaucratVote,
): Promise<TextChannel> {
  if (vote.channelId !== BUREAUCRAT_VOTE_CHANNEL_ID) {
    throw new Error("원장 채널이 관료 채널 계약과 일치하지 않습니다.");
  }
  const guild = await client.guilds.fetch(vote.guildId);
  const channel = await guild.channels.fetch(vote.channelId);
  if (!channel || !channel.isTextBased() || !("send" in channel)) {
    throw new Error("관료 채널에 메시지를 보낼 수 없습니다.");
  }
  return channel as TextChannel;
}

function isVoteMessage(message: Message, voteId: string): boolean {
  return message.embeds.some(
    (embed) => embed.author?.name === bureaucratVoteAuthorLabel(voteId),
  );
}

/** Discord 전송 성공 후 DB 응답이 유실된 경우 최근 봇 메시지에서 원장 ID를 복구한다. */
async function findExistingVoteMessage(
  client: Client,
  channel: TextChannel,
  vote: BureaucratVote,
): Promise<Message | null> {
  if (!vote._id || !client.user) return null;
  const voteId = vote._id.toHexString();
  const cutoff = vote.createdAt.getTime() - RECOVERY_LOOKBACK_MARGIN_MS;
  let before: string | undefined;

  for (let page = 0; page < RECOVERY_PAGE_LIMIT; page += 1) {
    const messages = await channel.messages.fetch({ limit: 100, before });
    if (messages.size === 0) return null;
    const ordered = [...messages.values()];
    const matched = ordered.find(
      (message) =>
        message.author.id === client.user?.id && isVoteMessage(message, voteId),
    );
    if (matched) return matched;
    const oldest = ordered.reduce((current, message) =>
      message.createdTimestamp < current.createdTimestamp ? message : current,
    );
    if (oldest.createdTimestamp < cutoff) return null;
    before = oldest.id;
  }
  return null;
}

async function markSentWithRetry(
  vote: BureaucratVote,
  messageId: string,
): Promise<BureaucratVote | null> {
  if (!vote._id || !vote.publication.leaseToken) return null;
  for (let attempt = 0; attempt < MARK_SENT_ATTEMPTS; attempt += 1) {
    const marked = await markBureaucratVotePublicationSent({
      voteId: vote._id.toHexString(),
      leaseToken: vote.publication.leaseToken,
      messageId,
    });
    if (marked) return marked;
    const current = await findBureaucratVoteById(vote._id.toHexString());
    if (
      current?.publication.state === "SENT" &&
      current.publication.messageId === messageId
    ) {
      return current;
    }
  }
  return null;
}

async function publishClaimedVote(
  client: Client,
  vote: BureaucratVote,
): Promise<BureaucratVote | null> {
  if (!vote._id || !vote.publication.leaseToken) return null;
  const voteId = vote._id.toHexString();
  let channel: TextChannel;
  try {
    channel = await resolveVoteChannel(client, vote);
  } catch (error) {
    await releaseBureaucratVotePublication({
      voteId,
      leaseToken: vote.publication.leaseToken,
      error,
    });
    throw error;
  }

  if (vote.publication.attempts > 1) {
    const recovered = await findExistingVoteMessage(client, channel, vote);
    if (recovered) {
      const marked = await markSentWithRetry(vote, recovered.id);
      if (!marked) {
        console.error("[bureaucrat-vote] recovered message mark failed", voteId);
      }
      return marked;
    }
  }

  if (vote.closesAt.getTime() <= Date.now()) {
    await releaseBureaucratVotePublication({
      voteId,
      leaseToken: vote.publication.leaseToken,
      error: new Error(
        "표결 기한이 종료되어 미확정 Discord 공지를 재전송하지 않습니다.",
      ),
    });
    return null;
  }

  let message: Message;
  try {
    // 공개 공지는 응답 가능한 모양으로 먼저 보낸다. DB가 SENT로 확정되기 전
    // 극히 짧은 구간의 클릭은 canonical guard가 거부하고, 확정 뒤에는 별도
    // Discord edit 성공 여부에 의존하지 않고 즉시 투표할 수 있다.
    const announcementVote: BureaucratVote = {
      ...vote,
      publication: { ...vote.publication, state: "SENT" },
    };
    message = await channel.send(buildBureaucratVoteMessage(announcementVote));
  } catch (error) {
    await releaseBureaucratVotePublication({
      voteId,
      leaseToken: vote.publication.leaseToken,
      error,
    });
    throw error;
  }

  const marked = await markSentWithRetry(vote, message.id);
  if (!marked) {
    // 전송 성공 여부가 확정된 상태이므로 PENDING으로 되돌리지 않는다.
    // lease 만료 뒤 최근 메시지의 원장 ID를 찾아 자동 연결한다.
    console.error("[bureaucrat-vote] sent message mark uncertain", voteId, message.id);
  }
  return marked;
}

export async function publishBureaucratVoteById(
  client: Client,
  voteId: string,
): Promise<BureaucratVote | null> {
  const claimed = await claimBureaucratVotePublicationById({ voteId });
  if (!claimed) return findBureaucratVoteById(voteId);
  return publishClaimedVote(client, claimed);
}

export async function publishPendingBureaucratVotes(
  client: Client,
  limit = 10,
): Promise<number> {
  let published = 0;
  for (let index = 0; index < limit; index += 1) {
    const claimed = await claimNextBureaucratVotePublication();
    if (!claimed) break;
    try {
      if (await publishClaimedVote(client, claimed)) published += 1;
    } catch (error) {
      console.error("[bureaucrat-vote] publication failed", claimed._id, error);
      break;
    }
  }
  return published;
}

export async function refreshBureaucratVoteMessage(
  client: Client,
  vote: BureaucratVote,
): Promise<boolean> {
  if (vote.publication.state !== "SENT" || !vote.publication.messageId) {
    return false;
  }
  try {
    const channel = await resolveVoteChannel(client, vote);
    const message = await channel.messages.fetch(vote.publication.messageId);
    let renderVote = vote;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await message.edit({
        embeds: [buildBureaucratVoteEmbed(renderVote)],
        components: [buildBureaucratVoteActionRow(renderVote)],
      });
      if (!renderVote._id) return true;
      const latest = await findBureaucratVoteById(
        renderVote._id.toHexString(),
      );
      if (!latest || latest.revision === renderVote.revision) return true;
      renderVote = latest;
    }
    return true;
  } catch (error) {
    console.error("[bureaucrat-vote] message refresh failed", vote._id, error);
    return false;
  }
}

/** ballot과 종료가 경합하면 revision을 재조회해 최신 과반으로 최대 5회 수렴한다. */
export async function closeBureaucratVoteWithRetry(input: {
  voteId: string;
  trigger: "MANUAL" | "AUTO_EXPIRED";
  closedBy: BureaucratVoteActor;
  closedAt?: Date;
}): Promise<BureaucratVote | null> {
  const closedAt = input.closedAt ?? new Date();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const vote = await findBureaucratVoteById(input.voteId);
    if (!vote) return null;
    if (vote.status === "CLOSED") return vote;
    if (
      input.trigger === "AUTO_EXPIRED" &&
      vote.closesAt.getTime() > closedAt.getTime()
    ) {
      return null;
    }
    const decision = decideBureaucratVoteMajority(vote);
    const closed = await closeBureaucratVote({
      voteId: input.voteId,
      expectedRevision: vote.revision,
      ...decision,
      trigger: input.trigger,
      closedBy: input.closedBy,
      closedAt,
    });
    if (closed) return closed;
  }
  return null;
}

export async function closeDueBureaucratVotes(client: Client): Promise<number> {
  const now = new Date();
  const due = await listDueBureaucratVotes({ now });
  let closedCount = 0;
  for (const vote of due) {
    if (!vote._id) continue;
    const closed = await closeBureaucratVoteWithRetry({
      voteId: vote._id.toHexString(),
      trigger: "AUTO_EXPIRED",
      closedBy: {
        kind: "SYSTEM",
        id: "registrar:auto-close",
        displayName: "REGISTRAR 자동 마감",
      },
      closedAt: now,
    });
    if (!closed) continue;
    closedCount += 1;
    await refreshBureaucratVoteMessage(client, closed);
  }
  return closedCount;
}
