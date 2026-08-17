import type { ObjectId } from "mongodb";

export const STOCK_MARKET_STATE_ID = "novex" as const;
export type StockMarketStatus = "OPENING_PENDING" | "OPEN" | "CLOSED";
export type StockMarketClosureReason =
  | "DAILY_CLOSE"
  | "REGULAR_SESSION"
  | "REGULAR_SESSION_FALLBACK"
  | "GM_EXCEPTION";

export interface StockMarketState {
  _id: typeof STOCK_MARKET_STATE_ID;
  status: StockMarketStatus;
  tradingDate: string;
  opensAt: Date;
  closesAt: Date;
  nextSlotAt?: Date;
  lastCompletedSlotKey?: string;
  delayed: boolean;
  mergedSlotKeys?: string[];
  closureReason?: StockMarketClosureReason;
  tradeRevision: number;
  updatedAt: Date;
}

export interface StockMarketSnapshot {
  state: StockMarketState;
  prices: import("./stock.js").StockPrice[];
  companyProfiles: StockCompanyProfile[];
  /** state/prices와 같은 snapshot read에서 집계한 다음 회차 수급 신호. */
  flowSignals: StockFlowSignal[];
}

/** scheduled_job_runs summary에만 저장하는 read-only shadow 가격 상태. */
export interface StockMarketShadowPrice {
  ticker: string;
  price: number;
  prevPrice: number;
  eventText: string;
  lastUpdate: string;
  referencePrice: number;
  pendingBasePercent: number;
  cumulativeSplitFactor: number;
  cumulativeCapitalIncreaseFactor: number;
  corporateActionHaltId?: string;
  corporateActionHaltReason?: string;
  corporateActionResumeSlotKey?: string;
  cooldownUntil?: string;
  cooldownReason?: string;
}

export interface StockMarketShadowFlow {
  operationKey: string;
  characterId: string;
  ticker: string;
  side: StockOrderFlowSide;
  shares: number;
}

export interface StockMarketShadowState {
  version: 1;
  lastCompletedSlotKey?: string;
  completedAt: string;
  prices: StockMarketShadowPrice[];
  rejectedDividendActionIds: string[];
  pendingFlows: StockMarketShadowFlow[];
  seenFlowOperationKeys: string[];
}

export interface StockMarketCalendarException {
  _id: string;
  kstDate: string;
  mode: "EARLY_CLOSE" | "CANCEL_EARLY_CLOSE";
  closeAt?: Date;
  reason?: string;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export type StockOrderFlowSide = "BUY" | "SELL";
export interface StockOrderFlow {
  _id?: ObjectId;
  operationKey: string;
  characterId: string;
  ticker: string;
  side: StockOrderFlowSide;
  shares: number;
  price: number;
  occurredAt: Date;
  consumedSlotKey?: string;
  consumedAt?: Date;
}

export type StockFlowStrength = "WEAK" | "MODERATE" | "STRONG";
export interface StockFlowSignal {
  ticker: string;
  direction: "BUY" | "SELL" | "NEUTRAL";
  strength: StockFlowStrength;
  volume: number;
}

export type StockDisclosureStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "PUBLISHED"
  | "CANCELLED";
export type StockDisclosureKind = "INFO" | "PRICE";
export interface StockDisclosureEffect {
  scope: "MARKET" | "TICKER";
  ticker?: string;
  changePercent?: number;
  structural: boolean;
}
export interface StockMajorShareholder {
  name: string;
  stakePercent: number;
  note?: string;
}
export interface StockCompanyProfileUpdate {
  majorShareholders: StockMajorShareholder[];
}
export interface StockCompanyProfile extends StockCompanyProfileUpdate {
  _id: string;
  sourceDisclosureId: string;
  updatedAt: Date;
}
export interface StockDisclosure {
  _id: string;
  title: string;
  body: string;
  kind: StockDisclosureKind;
  status: StockDisclosureStatus;
  source: "GM" | "AUTO" | "CORPORATE_ACTION";
  effects: StockDisclosureEffect[];
  publishAt?: Date;
  slotKey?: string;
  shock?: boolean;
  forceCooldown?: boolean;
  /** PRICE 공시가 실제 적용·공개되는 transaction에서만 회사 프로필에 반영한다. */
  companyProfileUpdate?: StockCompanyProfileUpdate;
  /** 하나의 기업행동과 함께 예약·취소되어야 하는 후속 시나리오 공시 owner. */
  ownerCorporateActionId?: string;
  templateId?: string;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
  cancelledAt?: Date;
  /** 유상증자 exact 회차와 충돌해 다음 실제 가격 회차로 이월된 action id. */
  deferredByCorporateActionId?: string;
  deferredAt?: Date;
}

export type StockAlertKind =
  | "BELOW_PRICE"
  | "MOVE_PERCENT"
  | "DISCLOSURE";
export interface StockMarketAlertRule {
  id: string;
  ticker?: string;
  kind: StockAlertKind;
  threshold?: number;
  enabled: boolean;
  armed?: boolean;
  lastTriggeredSlotKey?: string;
  lastTriggeredDisclosureId?: string;
}
export interface StockMarketPreference {
  _id: string;
  userId: string;
  watchlist: string[];
  alerts: StockMarketAlertRule[];
  migratedLocalStorageAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type StockCorporateActionStatus =
  | "SCHEDULED"
  | "HALTED"
  | "SNAPSHOTTED"
  | "PROCESSING"
  | "COMPLETED"
  | "ERROR"
  | "CANCELLED";
export interface StockDividendAction {
  _id: string;
  type: "DIVIDEND";
  ticker: string;
  amountPerShare: number;
  recordSlotKey: string;
  exDateSlotKey: string;
  status: StockCorporateActionStatus;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  payoutCompletedAt?: Date;
  exDateAppliedAt?: Date;
  failureReason?: string;
}
export interface StockSplitAction {
  _id: string;
  type: "SPLIT";
  ticker: string;
  factor: number;
  executeSlotKey: string;
  status: StockCorporateActionStatus;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}
export interface StockRightsOfferingAction {
  _id: string;
  type: "RIGHTS_OFFERING";
  ticker: string;
  factor: number;
  reason: string;
  priceAdjustmentPercent: number;
  announceSlotKey: string;
  executeSlotKey: string;
  status: StockCorporateActionStatus;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  haltedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  failureReason?: string;
  cancelledAt?: Date;
  cancelledOpenTradeCount?: number;
  openTradesCancelledAt?: Date;
  remainingDisclosuresCancelledAt?: Date;
  remainingDisclosuresCancelledCount?: number;
}
export type StockCorporateAction =
  | StockDividendAction
  | StockSplitAction
  | StockRightsOfferingAction;

export interface StockDividendEntitlement {
  _id: string;
  actionId: string;
  characterId: string;
  shares: number;
  amount: number;
  status: "PENDING" | "PAID" | "ERROR";
  creditRequestId: string;
  createdAt: Date;
  paidAt?: Date;
  failedAt?: Date;
  failureReason?: string;
}

export interface StockInvestmentSeason {
  _id: string;
  startsAt: Date;
  endsAt: Date;
  status: "SCHEDULED" | "ACTIVE" | "FINALIZED";
  createdAt: Date;
  finalizedAt?: Date;
}
export type StockSeasonFlowKind =
  | "BUY"
  | "SELL"
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "GM_GRANT"
  | "DIVIDEND";
export interface StockSeasonFlow {
  _id?: ObjectId;
  operationKey: string;
  characterId: string;
  ticker: string;
  kind: StockSeasonFlowKind;
  shares: number;
  marketPrice: number;
  /** BUY/TRANSFER_IN/GM_GRANT는 +, SELL/TRANSFER_OUT은 -, DIVIDEND는 0. */
  externalAmount: number;
  /** 배당만 투자수익으로 더하며 외부 자금 유입으로 보지 않는다. */
  returnAmount: number;
  occurredAt: Date;
  evaluatedSlotKey?: string;
  evaluatedAt?: Date;
}
export interface StockSeasonPerformance {
  _id: string;
  seasonId: string;
  characterId: string;
  codename: string;
  linkedReturn: number;
  investedValue: number;
  buyCount: number;
  exposureSlots: number;
  eligible: boolean;
  rank?: number;
  badge?: string;
  title?: string;
  currentPortfolioValue?: number;
  lastValuedAt?: Date;
  lastValuedSlotKey?: string;
  updatedAt: Date;
}
export type StockSeasonLeaderboardEntry = Pick<
  StockSeasonPerformance,
  "codename" | "linkedReturn" | "rank" | "badge" | "title"
>;
