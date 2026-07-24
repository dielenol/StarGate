import "./init";

import type { PlayerTrade } from "@stargate/shared-db";

import type { PlayerTradeDto } from "@/types/trade";

export {
  EMPTY_PLAYER_TRADE_OFFER,
  PlayerTradeError,
  normalizePlayerTradeOffer,
  listPlayerTradesForUser,
  findPlayerTradeById,
  listPlayerTradeCounterparties,
  createOpenPlayerTrade,
  createAndSettleGift,
  replacePlayerTradeOffer,
  confirmPlayerTrade,
  cancelPlayerTrade,
} from "@stargate/shared-db";

function dateToIso(value: Date | string | undefined): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function serializePlayerTrade(trade: PlayerTrade): PlayerTradeDto {
  const completedAt = dateToIso(trade.completedAt);
  const cancelledAt = dateToIso(trade.cancelledAt);
  return {
    id: String(trade._id),
    kind: trade.kind,
    status: trade.status,
    revision: trade.revision,
    initiator: trade.initiator,
    counterparty: trade.counterparty,
    initiatorOffer: trade.initiatorOffer,
    counterpartyOffer: trade.counterpartyOffer,
    ...(trade.initiatorConfirmedRevision !== undefined
      ? { initiatorConfirmedRevision: trade.initiatorConfirmedRevision }
      : {}),
    ...(trade.counterpartyConfirmedRevision !== undefined
      ? { counterpartyConfirmedRevision: trade.counterpartyConfirmedRevision }
      : {}),
    createdAt:
      dateToIso(trade.createdAt) ?? new Date(0).toISOString(),
    updatedAt:
      dateToIso(trade.updatedAt) ?? new Date(0).toISOString(),
    ...(completedAt ? { completedAt } : {}),
    ...(cancelledAt ? { cancelledAt } : {}),
  };
}
