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
  templateId?: string;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
  cancelledAt?: Date;
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
export type StockCorporateAction = StockDividendAction | StockSplitAction;

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
