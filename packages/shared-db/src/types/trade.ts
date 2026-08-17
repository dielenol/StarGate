import type { ObjectId } from "mongodb";

export const PLAYER_TRADE_KINDS = ["GIFT", "EXCHANGE"] as const;
export type PlayerTradeKind = (typeof PLAYER_TRADE_KINDS)[number];

export const PLAYER_TRADE_STATUSES = [
  "OPEN",
  "COMPLETED",
  "CANCELLED",
] as const;
export type PlayerTradeStatus = (typeof PLAYER_TRADE_STATUSES)[number];
export type PlayerTradeCancellationReason =
  | "USER_CANCELLED"
  | "RIGHTS_OFFERING_ANNOUNCED";

export interface PlayerTradeParticipant {
  userId: string;
  displayName: string;
  characterId: string;
  characterCodename: string;
}

export interface PlayerTradeItemOffer {
  itemId: string;
  itemName: string;
  quantity: number;
}

export interface PlayerTradeStockOffer {
  ticker: string;
  shares: number;
}

export interface PlayerTradeOffer {
  credits: number;
  items: PlayerTradeItemOffer[];
  stocks: PlayerTradeStockOffer[];
}

export interface PlayerTrade {
  _id?: ObjectId;
  kind: PlayerTradeKind;
  status: PlayerTradeStatus;
  revision: number;
  initiator: PlayerTradeParticipant;
  counterparty: PlayerTradeParticipant;
  initiatorOffer: PlayerTradeOffer;
  counterpartyOffer: PlayerTradeOffer;
  initiatorConfirmedRevision?: number;
  counterpartyConfirmedRevision?: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  cancellationReason?: PlayerTradeCancellationReason;
  cancellationContextId?: string;
}

export type CreatePlayerTradeInput = Omit<
  PlayerTrade,
  "_id" | "createdAt" | "updatedAt" | "completedAt" | "cancelledAt"
>;
