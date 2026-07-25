import { NextResponse, after } from "next/server";

import type { PlayerTradeOffer, TradeAction } from "@/types/trade";

import { readIdempotencyKey } from "@/lib/api/idempotency";
import { auth } from "@/lib/auth/config";
import {
  EconomicOperationConflictError,
  executeEconomicOperationResult,
} from "@/lib/db/execute-economic-operation";
import { prepareCharacterInventoryItemLocks } from "@/lib/db/inventory";
import {
  cancelPlayerTrade,
  confirmPlayerTrade,
  findPlayerTradeById,
  normalizePlayerTradeOffer,
  PlayerTradeError,
  replacePlayerTradeOffer,
  serializePlayerTrade,
} from "@/lib/db/trades";
import { notifyUser } from "@/lib/notifications/events";
import { deliverPlayerTradeDiscordDm } from "@/lib/notifications/player-trade-discord-dm";
import { isValidObjectId } from "@/lib/db/utils";

interface TradeActionBody {
  trade?: ReturnType<typeof serializePlayerTrade>;
  completed?: boolean;
  error?: string;
  code?: string;
}

function tradeErrorResult(error: unknown): {
  status: number;
  body: TradeActionBody;
} | null {
  if (!(error instanceof PlayerTradeError)) return null;
  const status =
    error.code === "TRADE_NOT_FOUND"
      ? 404
      : error.code === "TRADE_FORBIDDEN"
        ? 403
        : error.code === "TRADE_REVISION_CONFLICT" ||
            error.code === "TRADE_NOT_OPEN"
          ? 409
          : 400;
  return { status, body: { error: error.message, code: error.code } };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tradeId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const requestId = readIdempotencyKey(request);
  if (!requestId) {
    return NextResponse.json(
      { error: "유효한 Idempotency-Key 헤더가 필요합니다.", code: "INVALID_IDEMPOTENCY_KEY" },
      { status: 400 },
    );
  }
  const { tradeId } = await params;
  if (!isValidObjectId(tradeId)) {
    return NextResponse.json({ error: "거래 ID가 올바르지 않습니다." }, { status: 400 });
  }

  let raw: Partial<TradeAction>;
  try {
    raw = (await request.json()) as Partial<TradeAction>;
  } catch {
    return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }
  if (
    (raw.action !== "SET_OFFER" &&
      raw.action !== "CONFIRM" &&
      raw.action !== "CANCEL") ||
    !Number.isSafeInteger(raw.expectedRevision) ||
    (raw.expectedRevision ?? 0) < 1
  ) {
    return NextResponse.json({ error: "거래 액션 또는 revision이 올바르지 않습니다." }, { status: 400 });
  }

  let offer: PlayerTradeOffer | undefined;
  if (raw.action === "SET_OFFER") {
    try {
      offer = normalizePlayerTradeOffer(raw.offer);
    } catch (error) {
      const result = tradeErrorResult(error);
      return NextResponse.json(
        result?.body ?? { error: "거래 자산 구성이 올바르지 않습니다." },
        { status: result?.status ?? 400 },
      );
    }
  }

  try {
    const current = await findPlayerTradeById(tradeId);
    if (!current) {
      return NextResponse.json({ error: "거래를 찾을 수 없습니다." }, { status: 404 });
    }
    if (
      current.initiator.userId !== session.user.id &&
      current.counterparty.userId !== session.user.id
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (raw.action === "CONFIRM") {
      const itemIds = [
        ...current.initiatorOffer.items,
        ...current.counterpartyOffer.items,
      ].map((item) => item.itemId);
      if (itemIds.length > 0) {
        await Promise.all([
          prepareCharacterInventoryItemLocks(
            current.initiator.characterId,
            itemIds,
          ),
          prepareCharacterInventoryItemLocks(
            current.counterparty.characterId,
            itemIds,
          ),
        ]);
      }
    }

    const action: TradeAction =
      raw.action === "SET_OFFER"
        ? {
            action: "SET_OFFER",
            expectedRevision: raw.expectedRevision!,
            offer: offer!,
          }
        : {
            action: raw.action,
            expectedRevision: raw.expectedRevision!,
          };
    const operation =
      await executeEconomicOperationResult<TradeActionBody>({
        requestId,
        domain: "player-trade-action",
        actorId: session.user.id,
        payload: { tradeId, ...action },
        run: async (dbSession) => {
          if (action.action === "SET_OFFER") {
            const trade = await replacePlayerTradeOffer(
              tradeId,
              session.user.id,
              action.expectedRevision,
              action.offer,
              dbSession,
            );
            return { status: 200, body: { trade: serializePlayerTrade(trade) } };
          }
          if (action.action === "CANCEL") {
            const trade = await cancelPlayerTrade(
              tradeId,
              session.user.id,
              action.expectedRevision,
              dbSession,
            );
            return { status: 200, body: { trade: serializePlayerTrade(trade) } };
          }
          const result = await confirmPlayerTrade(
            tradeId,
            session.user.id,
            action.expectedRevision,
            { id: session.user.id, name: session.user.displayName },
            dbSession,
          );
          return {
            status: 200,
            body: {
              trade: serializePlayerTrade(result.trade),
              completed: result.completed,
            },
          };
        },
      });

    if (operation.status === 200 && operation.body.trade) {
      const trade = operation.body.trade;
      if (operation.body.completed) {
        after(async () => {
          const followUps: Promise<unknown>[] = [
            deliverPlayerTradeDiscordDm({
              tradeId: trade.id,
              event: "EXCHANGE_COMPLETED",
              userId: trade.initiator.userId,
              recipientCodename: trade.initiator.characterCodename,
              otherCharacterCodename:
                trade.counterparty.characterCodename,
            }),
            deliverPlayerTradeDiscordDm({
              tradeId: trade.id,
              event: "EXCHANGE_COMPLETED",
              userId: trade.counterparty.userId,
              recipientCodename: trade.counterparty.characterCodename,
              otherCharacterCodename: trade.initiator.characterCodename,
            }),
          ];
          if (!operation.replayed) {
            followUps.push(
              notifyUser({
                userId: trade.initiator.userId,
                type: "SYSTEM",
                title: "자산 교환이 완료되었습니다",
                message: `${trade.counterparty.characterCodename} 님과의 교환이 체결되었습니다.`,
                link: "/erp/trades",
              }),
              notifyUser({
                userId: trade.counterparty.userId,
                type: "SYSTEM",
                title: "자산 교환이 완료되었습니다",
                message: `${trade.initiator.characterCodename} 님과의 교환이 체결되었습니다.`,
                link: "/erp/trades",
              }),
            );
          }
          await Promise.all(followUps);
        });
      } else if (action.action === "CANCEL") {
        const other =
          trade.initiator.userId === session.user.id
            ? trade.counterparty
            : trade.initiator;
        const actor =
          trade.initiator.userId === session.user.id
            ? trade.initiator
            : trade.counterparty;
        after(async () => {
          const followUps: Promise<unknown>[] = [
            deliverPlayerTradeDiscordDm({
              tradeId: trade.id,
              event: "EXCHANGE_CANCELLED",
              userId: other.userId,
              recipientCodename: other.characterCodename,
              otherCharacterCodename: actor.characterCodename,
            }),
          ];
          if (!operation.replayed) {
            followUps.push(notifyUser({
              userId: other.userId,
              type: "SYSTEM",
              title: "교환 요청이 취소되었습니다",
              message: "진행 중이던 자산 교환이 취소되었습니다.",
              link: "/erp/trades",
            }));
          }
          await Promise.all(followUps);
        });
      }
    }
    return NextResponse.json(operation.body, {
      status: operation.status,
      headers: operation.replayed
        ? { "X-Idempotency-Replayed": "true" }
        : undefined,
    });
  } catch (error) {
    const result = tradeErrorResult(error);
    if (result) {
      return NextResponse.json(result.body, { status: result.status });
    }
    if (error instanceof EconomicOperationConflictError) {
      return NextResponse.json(
        { error: "동일한 요청이 처리 중입니다.", code: "DUPLICATE_REQUEST" },
        { status: 409 },
      );
    }
    console.error("[trades] action failed:", error);
    return NextResponse.json({ error: "거래 처리에 실패했습니다." }, { status: 500 });
  }
}
