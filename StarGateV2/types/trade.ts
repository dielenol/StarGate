export type {
  PlayerTradeKind,
  PlayerTradeStatus,
  PlayerTradeParticipant,
  PlayerTradeOffer,
  PlayerTradeItemOffer,
  PlayerTradeStockOffer,
} from "@stargate/shared-db/types";

import type {
  PlayerTradeKind,
  PlayerTradeOffer,
  PlayerTradeParticipant,
  PlayerTradeStatus,
} from "@stargate/shared-db/types";

export interface PlayerTradeDto {
  id: string;
  kind: PlayerTradeKind;
  status: PlayerTradeStatus;
  revision: number;
  initiator: PlayerTradeParticipant;
  counterparty: PlayerTradeParticipant;
  initiatorOffer: PlayerTradeOffer;
  counterpartyOffer: PlayerTradeOffer;
  initiatorConfirmedRevision?: number;
  counterpartyConfirmedRevision?: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  cancelledAt?: string;
}

export interface PlayerTradeAssets {
  credits: number;
  items: Array<{
    itemId: string;
    itemName: string;
    quantity: number;
  }>;
  stocks: Array<{
    ticker: string;
    name: string;
    shares: number;
  }>;
}

export interface TradesResponse {
  me: PlayerTradeParticipant | null;
  counterparties: PlayerTradeParticipant[];
  trades: PlayerTradeDto[];
  assets: PlayerTradeAssets;
}

export type TradeAction =
  | {
      action: "SET_OFFER";
      expectedRevision: number;
      offer: PlayerTradeOffer;
    }
  | {
      action: "CONFIRM" | "CANCEL";
      expectedRevision: number;
    };
