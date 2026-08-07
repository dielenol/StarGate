import type { ObjectId } from "mongodb";

export const BUREAUCRAT_VOTE_CHANNEL_ID = "1534753076399833249";
export const BUREAUCRAT_VOTE_DURATION_MS = 6 * 60 * 60 * 1_000;
export const BUREAUCRAT_VOTE_TITLE_MAX_LENGTH = 100;
export const BUREAUCRAT_VOTE_CONTENT_MAX_LENGTH = 3_500;
export const BUREAUCRAT_VOTE_BUTTON_PREFIX = "registrar:bureaucrat-vote:v1:";

export type BureaucratVoteChoice = "YES" | "NO";
export type BureaucratVoteStatus = "OPEN" | "CLOSED";
export type BureaucratVoteOutcome = "APPROVED" | "REJECTED";
export type BureaucratVotePublicationState =
  | "PENDING"
  | "DISPATCHING"
  | "SENT";

export interface BureaucratVoteActor {
  kind: "DISCORD_USER" | "ERP_USER" | "SYSTEM";
  id: string;
  displayName: string;
}

export interface BureaucratVoteBallot {
  choice: BureaucratVoteChoice;
  displayName: string;
  submittedAt: Date;
}

export interface BureaucratVotePublication {
  state: BureaucratVotePublicationState;
  attempts: number;
  leaseToken?: string;
  leaseUntil?: Date;
  messageId?: string;
  sentAt?: Date;
  lastError?: string;
}

export interface BureaucratVoteResolution {
  outcome: BureaucratVoteOutcome;
  reason: string;
  rule: "CAST_BALLOT_MAJORITY";
  trigger: "MANUAL" | "AUTO_EXPIRED";
  tally: {
    yes: number;
    no: number;
    total: number;
  };
  closedBy: BureaucratVoteActor;
  closedAt: Date;
}

export interface BureaucratVoteWorkshopRef {
  requestId: string;
  quoteVersion: number;
}

/**
 * 사무국 관료 표결 원장.
 *
 * - Discord 명령, ERP 고정 안건, 공방 연결 안건이 같은 원장을 사용한다.
 * - 표결 결과는 권한 승인만 기록하며, 크레딧·재료·인벤토리는 변경하지 않는다.
 * - ballots는 Discord user snowflake별 현재 표 한 건만 보존한다.
 */
export interface BureaucratVote {
  _id?: ObjectId;
  schemaVersion: 1;
  revision: number;
  requestKey: string;
  source: "DISCORD_COMMAND" | "ERP_PRESET" | "WORKSHOP";
  presetKey?: string;
  workshopRef?: BureaucratVoteWorkshopRef;
  /** OPEN 상태인 ERP preset의 동시 중복 생성을 막는 partial unique key. */
  activePresetKey?: string;
  guildId: string;
  channelId: typeof BUREAUCRAT_VOTE_CHANNEL_ID;
  title: string;
  content: string;
  status: BureaucratVoteStatus;
  ballots: Record<string, BureaucratVoteBallot>;
  publication: BureaucratVotePublication;
  resolution?: BureaucratVoteResolution;
  closesAt: Date;
  createdBy: BureaucratVoteActor;
  createdAt: Date;
  updatedAt: Date;
}
