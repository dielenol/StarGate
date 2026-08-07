import type {
  BureaucratVote,
  BureaucratVoteActor,
  BureaucratVoteOutcome,
  BureaucratVotePublicationState,
  BureaucratVoteStatus,
} from "@stargate/shared-db";

import type { BureaucratVotePreset } from "./presets";

export interface SerializedBureaucratVote {
  id: string;
  revision: number;
  source: BureaucratVote["source"];
  presetKey?: string;
  title: string;
  content: string;
  status: BureaucratVoteStatus;
  tally: { yes: number; no: number; total: number };
  publication: {
    state: BureaucratVotePublicationState;
    attempts: number;
    messageId?: string;
    sentAt?: string;
    lastError?: string;
  };
  resolution?: {
    outcome: BureaucratVoteOutcome;
    reason: string;
    trigger: "MANUAL" | "AUTO_EXPIRED";
    closedBy: BureaucratVoteActor;
    closedAt: string;
  };
  createdBy: BureaucratVoteActor;
  closesAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface BureaucratVotesResponse {
  configured: boolean;
  discordGuildId: string | null;
  discordChannelId: string;
  durationHours: 6;
  presets: BureaucratVotePreset[];
  votes: SerializedBureaucratVote[];
}
