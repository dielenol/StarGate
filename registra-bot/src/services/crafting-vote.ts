import {
  CRAFTING_VOTE_BUTTON_PREFIX,
} from "../constants/registrar.js";
import { createHash } from "node:crypto";
import type {
  CraftingVote,
  CraftingVoteChoice,
} from "../types/crafting-vote.js";

export type CraftingVotePhase =
  | "PUBLISH_PENDING"
  | "OPEN"
  | "CLOSED_PENDING_GM"
  | "RESOLVED";

export interface CraftingVoteTally {
  yes: number;
  no: number;
  total: number;
}

export type CraftingVotePublicationConfirmation =
  | "SENT_CONFIRMED"
  | "NOT_SENT_CONFIRMED"
  | "UNKNOWN";

/** Mongo write 응답 유실 뒤 재조회 결과를 안전하게 분류합니다. */
export function classifyCraftingVotePublication(
  vote: CraftingVote | null,
  expected: { messageId: string; operationKey: string }
): CraftingVotePublicationConfirmation {
  if (!vote) return "UNKNOWN";
  if (
    vote.publication.state === "SENT" &&
    vote.messageId === expected.messageId
  ) {
    return "SENT_CONFIRMED";
  }
  if (
    vote.publication.state === "DISPATCHING" &&
    vote.publication.operationKey === expected.operationKey
  ) {
    return "NOT_SENT_CONFIRMED";
  }
  return "UNKNOWN";
}

export function isCraftingVoteAnnouncementDeletionSafe(
  markThrew: boolean,
  confirmation: CraftingVotePublicationConfirmation
): boolean {
  return !markThrew && confirmation === "NOT_SENT_CONFIRMED";
}

/**
 * 동일 길드·요청참조는 Mongo 기본 `_id` unique 제약으로 한 투표만 갖습니다.
 * 별도 unique index migration 없이 중복 명령·동시 호출을 fail-closed 처리합니다.
 */
export function buildCraftingVoteLedgerId(
  guildId: string,
  requestRef: string
): string {
  return createHash("sha256")
    .update(`registrar:censor3:${guildId}:${requestRef}`, "utf8")
    .digest("hex")
    .slice(0, 24);
}

export function countCraftingVoteBallots(
  vote: Pick<CraftingVote, "ballots">
): CraftingVoteTally {
  let yes = 0;
  let no = 0;
  for (const ballot of Object.values(vote.ballots)) {
    if (ballot.choice === "YES") yes += 1;
    if (ballot.choice === "NO") no += 1;
  }
  return { yes, no, total: yes + no };
}

export function getCraftingVotePhase(
  vote: Pick<CraftingVote, "status" | "closesAt" | "publication">,
  now = new Date()
): CraftingVotePhase {
  if (vote.status === "RESOLVED") return "RESOLVED";
  if (vote.publication.state !== "SENT") return "PUBLISH_PENDING";
  if (vote.closesAt.getTime() <= now.getTime()) {
    return "CLOSED_PENDING_GM";
  }
  return "OPEN";
}

export function isCanonicalCraftingVoteSource(
  vote: Pick<CraftingVote, "guildId" | "channelId" | "messageId" | "publication">,
  source: { guildId: string | null; channelId: string; messageId: string }
): boolean {
  return (
    vote.publication.state === "SENT" &&
    vote.guildId === source.guildId &&
    vote.channelId === source.channelId &&
    vote.messageId.length > 0 &&
    vote.messageId === source.messageId
  );
}

export function buildCraftingVoteButtonCustomId(
  voteId: string,
  choice: CraftingVoteChoice
): string {
  return `${CRAFTING_VOTE_BUTTON_PREFIX}${voteId}:${choice.toLowerCase()}`;
}

export function parseCraftingVoteButtonCustomId(customId: string): {
  voteId: string;
  choice: CraftingVoteChoice;
} | null {
  if (!customId.startsWith(CRAFTING_VOTE_BUTTON_PREFIX)) return null;

  const parts = customId.slice(CRAFTING_VOTE_BUTTON_PREFIX.length).split(":");
  if (parts.length !== 2) return null;
  const [voteId, rawChoice] = parts;
  if (!/^[a-f\d]{24}$/i.test(voteId)) return null;
  if (rawChoice !== "yes" && rawChoice !== "no") return null;
  return {
    voteId,
    choice: rawChoice === "yes" ? "YES" : "NO",
  };
}

/**
 * 후속 ERP 수동 승인 단계에 넘길 구조화 receipt입니다.
 * 이 receipt 자체는 크레딧·인벤토리·공방 상태를 변경하지 않습니다.
 */
export function buildCraftingVoteResolutionReceipt(vote: CraftingVote) {
  if (!vote._id || !vote.resolution || vote.status !== "RESOLVED") {
    return null;
  }

  return {
    schema: "registrar.crafting-vote-resolution.v1" as const,
    voteId: vote._id.toHexString(),
    requestRef: vote.requestRef,
    subject: vote.subject,
    guildId: vote.guildId,
    channelId: vote.channelId,
    messageId: vote.messageId,
    eligibleRoleId: vote.eligibleRoleId,
    source: {
      collection: "registrar_crafting_votes" as const,
      schemaVersion: vote.schemaVersion,
      revision: vote.revision,
      createdByDiscordUserId: vote.createdByDiscordUserId,
      createdAt: vote.createdAt.toISOString(),
      publicationState: vote.publication.state,
    },
    closesAt: vote.closesAt.toISOString(),
    tally: countCraftingVoteBallots(vote),
    resolution: {
      outcome: vote.resolution.outcome,
      reason: vote.resolution.reason,
      resolvedByDiscordUserId: vote.resolution.resolvedByDiscordUserId,
      resolvedAt: vote.resolution.resolvedAt.toISOString(),
    },
    execution: {
      mode: "MANUAL_GM_REVIEW_REQUIRED" as const,
      automaticallyApproved: false,
      erpMutationsPerformed: false,
      creditMutationsPerformed: false,
      inventoryMutationsPerformed: false,
    },
    verification: {
      receiptIsAuthoritative: false,
      requiredMethod: "REQUERY_REGISTRAR_LEDGER" as const,
      lookup: {
        collection: "registrar_crafting_votes" as const,
        voteId: vote._id.toHexString(),
        guildId: vote.guildId,
      },
      compareFields: [
        "requestRef",
        "subject",
        "eligibleRoleId",
        "closesAt",
        "tally<-ballots",
        "resolution",
        "messageId",
        "publication.state",
      ] as const,
    },
  };
}
