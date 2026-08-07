import {
  BUREAUCRAT_VOTE_BUTTON_PREFIX,
  type BureaucratVote,
  type BureaucratVoteChoice,
} from "@stargate/shared-db";

export type BureaucratVoteButtonAction = BureaucratVoteChoice | "CLOSE";
export type BureaucratVotePhase = "PUBLISH_PENDING" | "OPEN" | "CLOSED";

export function getBureaucratVotePhase(
  vote: Pick<BureaucratVote, "status" | "closesAt" | "publication">,
  now = new Date(),
): BureaucratVotePhase {
  if (vote.status === "CLOSED" || vote.closesAt.getTime() <= now.getTime()) {
    return "CLOSED";
  }
  return vote.publication.state === "SENT" ? "OPEN" : "PUBLISH_PENDING";
}

export function buildBureaucratVoteButtonCustomId(
  voteId: string,
  action: BureaucratVoteButtonAction,
): string {
  return `${BUREAUCRAT_VOTE_BUTTON_PREFIX}${voteId}:${action.toLowerCase()}`;
}

export function parseBureaucratVoteButtonCustomId(customId: string): {
  voteId: string;
  action: BureaucratVoteButtonAction;
} | null {
  if (!customId.startsWith(BUREAUCRAT_VOTE_BUTTON_PREFIX)) return null;
  const parts = customId.slice(BUREAUCRAT_VOTE_BUTTON_PREFIX.length).split(":");
  if (parts.length !== 2) return null;
  const [voteId, rawAction] = parts;
  if (!/^[a-f\d]{24}$/i.test(voteId)) return null;
  if (rawAction === "yes") return { voteId, action: "YES" };
  if (rawAction === "no") return { voteId, action: "NO" };
  if (rawAction === "close") return { voteId, action: "CLOSE" };
  return null;
}

export function isCanonicalBureaucratVoteSource(
  vote: Pick<BureaucratVote, "guildId" | "channelId" | "publication">,
  source: { guildId: string | null; channelId: string; messageId: string },
): boolean {
  return (
    vote.publication.state === "SENT" &&
    vote.guildId === source.guildId &&
    vote.channelId === source.channelId &&
    vote.publication.messageId === source.messageId
  );
}

export function bureaucratVoteAuthorLabel(voteId: string): string {
  return `사무국 표결 원장 · ${voteId}`;
}
