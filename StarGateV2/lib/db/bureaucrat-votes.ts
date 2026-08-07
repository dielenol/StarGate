import {
  countBureaucratVoteBallots,
  listBureaucratVotes,
  type BureaucratVote,
} from "@stargate/shared-db";

import type { SerializedBureaucratVote } from "@/lib/bureaucrat-votes/contracts";

import "./init";

export { createBureaucratVote, listBureaucratVotes } from "@stargate/shared-db";

export function serializeBureaucratVote(
  vote: BureaucratVote,
): SerializedBureaucratVote {
  return {
    id: vote._id?.toHexString() ?? "",
    revision: vote.revision,
    source: vote.source,
    ...(vote.presetKey ? { presetKey: vote.presetKey } : {}),
    title: vote.title,
    content: vote.content,
    status: vote.status,
    tally: countBureaucratVoteBallots(vote),
    publication: {
      state: vote.publication.state,
      attempts: vote.publication.attempts,
      ...(vote.publication.messageId
        ? { messageId: vote.publication.messageId }
        : {}),
      ...(vote.publication.sentAt
        ? { sentAt: vote.publication.sentAt.toISOString() }
        : {}),
      ...(vote.publication.lastError
        ? { lastError: vote.publication.lastError }
        : {}),
    },
    ...(vote.resolution
      ? {
          resolution: {
            outcome: vote.resolution.outcome,
            reason: vote.resolution.reason,
            trigger: vote.resolution.trigger,
            closedBy: vote.resolution.closedBy,
            closedAt: vote.resolution.closedAt.toISOString(),
          },
        }
      : {}),
    createdBy: vote.createdBy,
    closesAt: vote.closesAt.toISOString(),
    createdAt: vote.createdAt.toISOString(),
    updatedAt: vote.updatedAt.toISOString(),
  };
}

export async function getSerializedBureaucratVotes(
  limit = 30,
): Promise<SerializedBureaucratVote[]> {
  return (await listBureaucratVotes({ limit })).map(serializeBureaucratVote);
}
