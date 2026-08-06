import type { ObjectId } from "mongodb";

export type CraftingVoteChoice = "YES" | "NO";
export type CraftingVoteStatus = "OPEN" | "RESOLVED";
export type CraftingVoteOutcome = "APPROVED" | "REJECTED" | "DEFERRED";
export type CraftingVotePublicationState =
  | "PENDING"
  | "DISPATCHING"
  | "SENT";

export interface CraftingVotePublicationReconciliation {
  action:
    | "CONFIRMED_NOT_SENT"
    | "LINKED_EXISTING_MESSAGE"
    | "CONFIRMED_DELETED_AFTER_FAILURE";
  actorDiscordUserId: string;
  reason: string;
  at: Date;
}

export interface CraftingVotePublication {
  state: CraftingVotePublicationState;
  operationKey?: string;
  dispatchStartedAt?: Date;
  sentAt?: Date;
  reconciliations: CraftingVotePublicationReconciliation[];
}

export interface CraftingVoteSubject {
  kind: "CENSOR_3_MANUFACTURE_APPROVAL";
  code: "ZULU_0028_CENSOR_3";
  displayName: string;
  targetCharacterCodename: "네베드";
  outputQuantity: 3;
}

export interface CraftingVoteBallot {
  choice: CraftingVoteChoice;
  displayName: string;
  submittedAt: Date;
}

export interface CraftingVoteResolution {
  outcome: CraftingVoteOutcome;
  reason: string;
  resolvedByDiscordUserId: string;
  resolvedAt: Date;
}

/**
 * CENSOR-3 제작 동의 투표 원장.
 *
 * ballots는 Discord snowflake를 키로 둔 단일 문서 map입니다. 동일 사용자의
 * 재투표는 한 필드의 원자적 덮어쓰기로 처리되며, 결론 전환과 경합해도
 * `status: OPEN` 조건을 통과한 표만 기록됩니다.
 */
export interface CraftingVote {
  _id?: ObjectId;
  schemaVersion: 1;
  /** 공개 메시지 렌더 순서를 위한 단조 증가 revision */
  revision: number;
  guildId: string;
  channelId: string;
  messageId: string;
  requestRef: string;
  eligibleRoleId: string;
  subject: CraftingVoteSubject;
  status: CraftingVoteStatus;
  ballots: Record<string, CraftingVoteBallot>;
  resolution?: CraftingVoteResolution;
  publication: CraftingVotePublication;
  closesAt: Date;
  createdByDiscordUserId: string;
  createdAt: Date;
  updatedAt: Date;
}
