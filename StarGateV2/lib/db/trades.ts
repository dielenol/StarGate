import "./init";

import { ObjectId, type ClientSession } from "mongodb";

import {
  listPlayerTradeCounterparties as listUnrestrictedPlayerTradeCounterparties,
  PlayerTradeError,
  usersCol,
  type PlayerTrade,
  type PlayerTradeParticipant,
  type User,
} from "@stargate/shared-db";

import { canSelectPlayerTradeCounterparty } from "@/lib/auth/player-service-test-access";
import type { PlayerTradeDto } from "@/types/trade";

export {
  EMPTY_PLAYER_TRADE_OFFER,
  PlayerTradeError,
  normalizePlayerTradeOffer,
  listPlayerTradesForUser,
  findPlayerTradeById,
  createOpenPlayerTrade,
  createAndSettleGift,
  replacePlayerTradeOffer,
  confirmPlayerTrade,
  cancelPlayerTrade,
} from "@stargate/shared-db";

async function findPlayerTradeAccessUsers(
  userIds: string[],
  session?: ClientSession,
): Promise<User[]> {
  const objectIds = Array.from(new Set(userIds))
    .filter((userId) => ObjectId.isValid(userId))
    .map((userId) => new ObjectId(userId));
  if (objectIds.length === 0) return [];

  return (await usersCol())
    .find(
      { _id: { $in: objectIds } },
      {
        session,
        projection: { username: 1, role: 1, status: 1 },
      },
    )
    .toArray();
}

export async function listPlayerTradeCounterparties(
  excludeUserId: string,
): Promise<PlayerTradeParticipant[]> {
  const counterparties =
    await listUnrestrictedPlayerTradeCounterparties(excludeUserId);
  if (counterparties.length === 0) return [];

  const users = await findPlayerTradeAccessUsers([
    excludeUserId,
    ...counterparties.map((counterparty) => counterparty.userId),
  ]);
  const usersById = new Map(
    users
      .filter((user) => user._id)
      .map((user) => [String(user._id), user]),
  );
  const actor = usersById.get(excludeUserId);
  if (!actor || actor.status !== "ACTIVE") return [];

  return counterparties.filter((counterparty) => {
    const target = usersById.get(counterparty.userId);
    return (
      target?.status === "ACTIVE" &&
      canSelectPlayerTradeCounterparty(actor, target)
    );
  });
}

export async function assertPlayerTradeCounterpartyAccess(
  actorUserId: string,
  targetUserId: string,
  session: ClientSession,
): Promise<void> {
  if (
    actorUserId === targetUserId ||
    !ObjectId.isValid(actorUserId) ||
    !ObjectId.isValid(targetUserId)
  ) {
    throw new PlayerTradeError(
      "TRADE_FORBIDDEN",
      "거래 상대 정보가 올바르지 않습니다.",
    );
  }

  const users = await findPlayerTradeAccessUsers(
    [actorUserId, targetUserId],
    session,
  );
  const usersById = new Map(
    users
      .filter((user) => user._id)
      .map((user) => [String(user._id), user]),
  );
  const actor = usersById.get(actorUserId);
  const target = usersById.get(targetUserId);
  if (
    actor?.status !== "ACTIVE" ||
    target?.status !== "ACTIVE" ||
    !canSelectPlayerTradeCounterparty(actor, target)
  ) {
    throw new PlayerTradeError(
      "TRADE_FORBIDDEN",
      "GM 및 테스트 계정은 GM 또는 공식 테스트 계정만 거래 상대로 지정할 수 있습니다.",
    );
  }
}

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
