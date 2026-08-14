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
    category: import("@stargate/shared-db/types").ItemCategory | null;
    slug?: string;
    effect?: string;
    description?: string;
    previewImage?: string;
  }>;
  stocks: Array<{
    ticker: string;
    name: string;
    shares: number;
    isSeeded: boolean;
    isTradingHalted: boolean;
    isCoolingDown: boolean;
    cooldownUntil: string | null;
    marketStatus: import("@/hooks/queries/useStocksQuery").StockMarketStatus;
  }>;
}

export interface PlayerTradeStockAvailability {
  ticker: string;
  isSeeded: boolean;
  isTradingHalted: boolean;
  isCoolingDown: boolean;
  cooldownUntil: string | null;
  marketStatus: import("@/hooks/queries/useStocksQuery").StockMarketStatus;
}

export interface TradesResponse {
  me: PlayerTradeParticipant | null;
  counterparties: PlayerTradeParticipant[];
  trades: PlayerTradeDto[];
  assets: PlayerTradeAssets;
  /** OPEN 거래 양측 제안에 포함된 종목 상태. ETag 수렴에도 포함된다. */
  stockAvailability: PlayerTradeStockAvailability[];
  market: import("@/hooks/queries/useStocksQuery").StockMarketStateItem;
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
