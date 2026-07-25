import { NextResponse, after } from "next/server";

import type {
  PlayerTradeOffer,
  PlayerTradeParticipant,
  TradesResponse,
} from "@/types/trade";

import { readIdempotencyKey } from "@/lib/api/idempotency";
import { auth } from "@/lib/auth/config";
import { findMainCharacterLiteByOwner as findMainCharacterByOwner } from "@/lib/db/characters";
import { getCharacterBalance } from "@/lib/db/credits";
import {
  EconomicOperationConflictError,
  executeEconomicOperationResult,
} from "@/lib/db/execute-economic-operation";
import {
  listCharacterInventoryEntries,
  prepareCharacterInventoryItemLocks,
} from "@/lib/db/inventory";
import { getHoldings } from "@/lib/db/stocks";
import {
  assertPlayerTradeCounterpartyAccess,
  createAndSettleGift,
  createOpenPlayerTrade,
  listPlayerTradeCounterparties,
  listPlayerTradesForUser,
  normalizePlayerTradeOffer,
  PlayerTradeError,
  serializePlayerTrade,
} from "@/lib/db/trades";
import { notifyUser } from "@/lib/notifications/events";
import { deliverPlayerTradeDiscordDm } from "@/lib/notifications/player-trade-discord-dm";
import { findStockByTicker } from "@/lib/stocks/catalog";

interface CreateTradeBody {
  kind?: "GIFT" | "EXCHANGE";
  targetUserId?: string;
  offer?: PlayerTradeOffer;
}

interface TradeOperationBody {
  trade?: ReturnType<typeof serializePlayerTrade>;
  error?: string;
  code?: string;
}

function isAgentMain(
  character: Awaited<ReturnType<typeof findMainCharacterByOwner>>,
): character is NonNullable<typeof character> {
  return (
    character !== null &&
    character.type === "AGENT" &&
    character.tier !== "MINI"
  );
}

function tradeErrorResult(error: unknown): {
  status: number;
  body: TradeOperationBody;
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

async function resolveSelf(
  user: { id: string; displayName: string },
): Promise<PlayerTradeParticipant | null> {
  const character = await findMainCharacterByOwner(user.id);
  if (!isAgentMain(character) || !character._id) return null;
  return {
    userId: user.id,
    displayName: user.displayName,
    characterId: String(character._id),
    characterCodename: character.codename,
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [me, counterparties, trades] = await Promise.all([
      resolveSelf(session.user),
      listPlayerTradeCounterparties(session.user.id),
      listPlayerTradesForUser(session.user.id),
    ]);
    if (!me) {
      const response: TradesResponse = {
        me: null,
        counterparties,
        trades: trades.map(serializePlayerTrade),
        assets: { credits: 0, items: [], stocks: [] },
      };
      return NextResponse.json(response);
    }

    const [balance, inventoryResult, holdings] = await Promise.all([
      getCharacterBalance(me.characterId),
      listCharacterInventoryEntries(me.characterId),
      getHoldings(me.characterId),
    ]);
    const items = inventoryResult.entries
      .filter(
        (entry) =>
          !entry.equippedSlot &&
          !entry.equipmentCharge &&
          !entry.equipmentAction &&
          !entry.workshop &&
          entry.isPublic !== false,
      )
      .map((entry) => ({
        itemId: entry.itemId,
        itemName: entry.itemName,
        quantity: entry.quantity,
        category: entry.category,
        slug: entry.slug,
        effect: entry.effect,
        description: entry.description,
        previewImage: entry.previewImage,
      }));
    const stocks = holdings.map((holding) => ({
      ticker: holding.ticker,
      name: findStockByTicker(holding.ticker)?.name ?? holding.ticker,
      shares: holding.shares,
    }));
    const response: TradesResponse = {
      me,
      counterparties,
      trades: trades.map(serializePlayerTrade),
      assets: { credits: balance, items, stocks },
    };
    return NextResponse.json(response, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[trades] list failed:", error);
    return NextResponse.json(
      { error: "거래 정보를 불러올 수 없습니다." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
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

  let body: CreateTradeBody;
  try {
    body = (await request.json()) as CreateTradeBody;
  } catch {
    return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }
  if (
    (body.kind !== "GIFT" && body.kind !== "EXCHANGE") ||
    typeof body.targetUserId !== "string"
  ) {
    return NextResponse.json({ error: "거래 종류와 상대를 선택해주세요." }, { status: 400 });
  }

  let offer: PlayerTradeOffer;
  try {
    offer = normalizePlayerTradeOffer(body.offer ?? {
      credits: 0,
      items: [],
      stocks: [],
    });
  } catch (error) {
    const result = tradeErrorResult(error);
    return NextResponse.json(
      result?.body ?? { error: "거래 자산 구성이 올바르지 않습니다." },
      { status: result?.status ?? 400 },
    );
  }

  try {
    const [me, counterparties] = await Promise.all([
      resolveSelf(session.user),
      listPlayerTradeCounterparties(session.user.id),
    ]);
    if (!me) {
      return NextResponse.json(
        { error: "ACTIVE 사용자의 MAIN AGENT 캐릭터가 필요합니다.", code: "NO_MAIN_CHARACTER" },
        { status: 409 },
      );
    }
    const counterparty = counterparties.find(
      (candidate) => candidate.userId === body.targetUserId,
    );
    if (!counterparty) {
      return NextResponse.json(
        { error: "거래 가능한 상대를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    if (body.kind === "GIFT" && offer.items.length > 0) {
      const itemIds = offer.items.map((item) => item.itemId);
      await Promise.all([
        prepareCharacterInventoryItemLocks(me.characterId, itemIds),
        prepareCharacterInventoryItemLocks(counterparty.characterId, itemIds),
      ]);
    }

    const operation =
      await executeEconomicOperationResult<TradeOperationBody>({
        requestId,
        domain: "player-trade-create",
        actorId: session.user.id,
        payload: { kind: body.kind, targetUserId: body.targetUserId, offer },
        run: async (dbSession) => {
          await assertPlayerTradeCounterpartyAccess(
            session.user.id,
            counterparty.userId,
            dbSession,
          );
          const trade =
            body.kind === "GIFT"
              ? await createAndSettleGift(
                  me,
                  counterparty,
                  offer,
                  { id: session.user.id, name: session.user.displayName },
                  dbSession,
                )
              : await createOpenPlayerTrade(
                  me,
                  counterparty,
                  offer,
                  dbSession,
                );
          return {
            status: 201,
            body: { trade: serializePlayerTrade(trade) },
          };
        },
      });

    if (operation.status === 201 && operation.body.trade) {
      const isGift = body.kind === "GIFT";
      const trade = operation.body.trade;
      after(async () => {
        const followUps: Promise<unknown>[] = [
          deliverPlayerTradeDiscordDm({
            tradeId: trade.id,
            event: isGift ? "GIFT_RECEIVED" : "EXCHANGE_OPENED",
            userId: counterparty.userId,
            recipientCodename: counterparty.characterCodename,
            otherCharacterCodename: me.characterCodename,
            offer: trade.initiatorOffer,
          }),
        ];
        if (!operation.replayed) {
          followUps.push(notifyUser({
            userId: counterparty.userId,
            type: "SYSTEM",
            title: isGift ? "자산을 전달받았습니다" : "교환 요청이 도착했습니다",
            message: `${me.characterCodename} 님의 ${isGift ? "즉시 전달" : "교환 요청"}`,
            link: "/erp/trades",
          }));
          if (isGift) {
            followUps.push(notifyUser({
              userId: me.userId,
              type: "SYSTEM",
              title: "자산 전달이 완료되었습니다",
              message: `${counterparty.characterCodename} 님에게 자산을 전달했습니다.`,
              link: "/erp/trades",
            }));
          }
        }
        await Promise.all(followUps);
      });
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
    console.error("[trades] create failed:", error);
    return NextResponse.json({ error: "거래 생성에 실패했습니다." }, { status: 500 });
  }
}
