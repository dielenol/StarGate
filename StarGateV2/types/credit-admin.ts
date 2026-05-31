/** /erp/admin/credits 응답 DTO. 서버 → 클라이언트 직렬화 후 전달. */

import type { CreditTransaction, CreditTransactionType } from "@/types/credit";

export interface CreditKpiSnapshot {
  totalBalance: number;
  totalPointBalance: number;
  activeAgentCount: number;
  totalGranted24h: number;
  totalDeducted24h: number;
  opPoolBalance: number | null;
  opPoolUpdatedAt: string | null; // ISO
  generatedAt: string; // ISO
}

export interface AgentBalanceRow {
  characterId: string;
  characterCodename: string;
  ownerId: string | null;
  ownerName: string | null;
  ownerDiscordId: string | null;
  agentLevel: string;
  balance: number;
  pointBalance: number;
  lastTxAt: string | null; // ISO
}

export interface CreditTransactionFilter {
  types?: CreditTransactionType[];
  ownerId?: string;
  characterId?: string;
  /**
   * 다중 characterId 화이트리스트. admin 라우트가 운영(isPublic !== false)
   * 캐릭터 IDs 로 자동 채워 더미 트랜잭션을 화면에서 제외한다.
   *
   * `characterId` (단건) 가 명시되면 단건이 우선 — GM 이 의도적으로 단건
   * 필터를 입력한 경우 (더미 트랜잭션 audit 조회 등) 화이트리스트는 무시.
   */
  characterIds?: string[];
  from?: string; // ISO
  to?: string; // ISO
  amountMin?: number;
  amountMax?: number;
  limit?: number;
  skip?: number;
}

export interface CreditTransactionPage {
  items: CreditTransaction[];
  total: number;
  limit: number;
  skip: number;
  hasMore: boolean;
}

export interface BulkGrantTarget {
  ownerId?: string;
  characterId?: string;
}

export type RewardKind = "CREDIT" | "POINT";
export type SessionRewardLineKind = "CREDIT" | "POINT" | "STAT";
export type SessionRewardStatField = "hp" | "san" | "def" | "atk";

export interface BulkGrantInput {
  targets: BulkGrantTarget[];
  amount: number;
  type: "ADMIN_GRANT" | "ADMIN_DEDUCT" | "SESSION_REWARD";
  description: string;
  rewardKind?: RewardKind;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface BulkGrantResultItem {
  ownerId?: string;
  characterId?: string;
  success: boolean;
  transactionId?: string;
  characterCodename?: string;
  rewardLabel?: string;
  rewardKind?: SessionRewardLineKind;
  statField?: SessionRewardStatField;
  newBalance?: number;
  newPointBalance?: number;
  newStatValue?: number;
  error?: string;
  code?: string;
  /** 멱등 검출 등으로 발급을 건너뛴 경우 (세션 자동 보상에서 사용). */
  skipped?: boolean;
  skipReason?: string;
}

export interface BulkGrantResult {
  results: BulkGrantResultItem[];
  succeeded: number;
  failed: number;
  skipped: number;
}

export type SessionRespondentStatus =
  | "eligible"
  | "no-user" // discordId 매칭되는 user 없음
  | "no-character" // user 는 있으나 메인 AGENT 미등록
  | "integrity-violation" // 1인 1 MAIN 위반 (findMainCharacterByOwner throw)
  | "already-rewarded"; // 이 세션의 자동 보상 이력 존재

export interface SessionRespondent {
  discordId: string;
  displayName: string;
  userId: string | null;
  ownerId: string | null;
  characterId: string | null;
  characterCodename: string | null;
  status: SessionRespondentStatus;
  reason?: string;
}

export interface SessionRewardCandidate {
  sessionId: string;
  sessionTitle: string;
  sessionDate: string; // ISO
  guildId: string;
  respondents: SessionRespondent[];
  /** status 별 응답자 카운트 — UI 카드에서 즉시 표시. */
  counts: Record<SessionRespondentStatus, number>;
}

export interface SessionRewardTarget {
  ownerId?: string;
  characterId?: string;
}

export interface SessionRewardLineInput {
  id?: string;
  kind: SessionRewardLineKind;
  amount: number;
  statField?: SessionRewardStatField;
  targetCharacterId?: string | null;
}

export interface SessionRewardGrantInput {
  sessionId: string;
  description: string;
  participants: SessionRewardTarget[];
  rewards: SessionRewardLineInput[];
}
