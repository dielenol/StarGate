import type { ObjectId } from "mongodb";

export const RESEARCH_RECIPE_IDS = [
  "ZULU_0028",
  "ZULU_0040",
  "INVERTED_SOCK",
] as const;

export type ResearchRecipeId = (typeof RESEARCH_RECIPE_IDS)[number];

export const RESEARCH_LINE_STATUSES = [
  "LOCKED",
  "INITIAL_RESEARCH",
  "OPEN",
] as const;
export type ResearchLineStatus = (typeof RESEARCH_LINE_STATUSES)[number];

export const RESEARCH_JOB_STATUSES = [
  "QUEUED",
  "RUNNING",
  "CLAIMABLE",
  "COMPLETED",
  "CANCELLED",
  "DIVERTED_SHARED",
] as const;
export type ResearchJobStatus = (typeof RESEARCH_JOB_STATUSES)[number];

export const RESEARCH_DESTINATIONS = ["SHARED", "CHARACTER"] as const;
export type ResearchDestination = (typeof RESEARCH_DESTINATIONS)[number];

export const RESEARCH_INITIAL_DURATION_MS = 24 * 60 * 60 * 1_000;
export const RESEARCH_REPEAT_DURATION_MS = 6 * 60 * 60 * 1_000;
export const RESEARCH_CLAIM_WINDOW_MS = 6 * 60 * 60 * 1_000;
export const RESEARCH_CLAIM_REMINDER_LEAD_MS = 60 * 60 * 1_000;
export const RESEARCH_REPEAT_CREDIT_COST = 500;

export const RELATIONSHIP_STATES = [
  "CONTEMPT",
  "HOSTILE",
  "DISPLEASED",
  "COLD",
  "NEUTRAL",
  "OBSERVING",
  "ACKNOWLEDGED",
  "FAVORABLE",
  "DELIGHTED",
] as const;
export type RelationshipState = (typeof RELATIONSHIP_STATES)[number];

export interface ResearchLabItemSnapshot {
  itemId: string;
  slug: string;
  name: string;
  quantity: number;
}

export interface ResearchLabLine {
  _id: ResearchRecipeId;
  status: ResearchLineStatus;
  submittedByUserId?: string;
  submittedByCharacterId?: string;
  submittedByCharacterCodename?: string;
  source?: ResearchLabItemSnapshot;
  initialJobId?: string;
  startedAt?: Date;
  completesAt?: Date;
  openedAt?: Date;
  updatedAt: Date;
  version: 2;
}

export type ResearchJobKind = "INITIAL" | "REPEAT";
export type ResearchLabSignalKind =
  | "INITIAL_COMPLETED"
  | "SHARED_COMPLETED"
  | "CHARACTER_CLAIMABLE"
  | "CHARACTER_DIVERTED";

export interface ResearchLabJob {
  _id?: ObjectId;
  requestId: string;
  recipeId: ResearchRecipeId;
  kind: ResearchJobKind;
  status: ResearchJobStatus;
  destination: ResearchDestination;
  requesterUserId: string;
  requesterDisplayName: string;
  characterId: string;
  characterCodename: string;
  output: ResearchLabItemSnapshot;
  creditCost: number;
  durationMs: number;
  outstandingKey?: string;
  activeLineKey?: ResearchRecipeId;
  queuedAt: Date;
  startedAt?: Date;
  completesAt?: Date;
  claimDeadline?: Date;
  claimReminderAt?: Date;
  claimReminderSentAt?: Date;
  reminderLeaseToken?: string;
  reminderLeaseUntil?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  refundedAt?: Date;
  inventoryGrantedAt?: Date;
  leaseToken?: string;
  leaseUntil?: Date;
  attempts: number;
  lastError?: string;
  nextAttemptAt?: Date;
  workerHaltedAt?: Date;
  /** enqueue와 worker 안전정지가 같은 active job 문서에서 충돌하도록 하는 admission fence. */
  queueAdmissionVersion?: number;
  pendingSignals?: ResearchLabSignalKind[];
  signalSentAt?: Date;
  signalLeaseToken?: string;
  signalLeaseUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
  version: 2;
}

export interface NpcRelationship {
  _id: string;
  npcId: "XENO";
  userId: string;
  characterId: string;
  score: number;
  initializedAt: Date;
  updatedAt: Date;
  version: 1;
}

export interface NpcRelationshipEvent {
  _id?: ObjectId;
  dedupeKey: string;
  npcId: "XENO";
  userId: string;
  characterId: string;
  kind: "INITIAL" | "CHOICE";
  sceneId?: string;
  choiceId?: string;
  delta: number;
  scoreAfter: number;
  createdAt: Date;
  version: 1;
}

export interface NpcConversationMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}

export interface NpcConversation {
  _id: string;
  npcId: "XENO";
  userId: string;
  characterId: string;
  summary: string;
  messages: NpcConversationMessage[];
  dailyUsageDate: string;
  dailyUsageCount: number;
  totalUsageCount: number;
  lastUserMessageAt?: Date;
  /** 한 캐릭터의 자유대화 생성/append 순서를 직렬화하는 fencing lease. */
  turnLeaseToken?: string;
  turnLeaseUntil?: Date;
  summaryPending: boolean;
  /** 마지막으로 장기 요약에 반영한 대화 turn 수. */
  lastSummarizedUsageCount: number;
  /** 현재 요약 작업이 담당하는 turn 경계와 단일 lease. */
  summaryGeneration?: number;
  summaryLeaseToken?: string;
  summaryLeaseUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
  version: 1;
}
