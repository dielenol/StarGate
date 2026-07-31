import "server-only";

import type { StockAdminHoldingsResponse } from "@/hooks/queries/useStocksQuery";

import { findCharactersByIdsLite } from "@/lib/db/characters";
import { getAllHoldings, getStockPrices } from "@/lib/db/stocks";
import { findUsersByIds } from "@/lib/db/users";
import { findStockByTicker } from "@/lib/stocks/catalog";
import { roundStockValue } from "@/lib/stocks/pricing";

export async function buildStockAdminHoldingsResponse(): Promise<StockAdminHoldingsResponse> {
  const [holdings, prices] = await Promise.all([
    getAllHoldings(),
    getStockPrices(),
  ]);
  const activeHoldings = holdings.filter((holding) => holding.shares > 0);
  // 전체 캐릭터 로드 + JS 필터 대신, 보유 장부에 등장하는 characterId 만 `$in` 경량 조회.
  const characterIds = Array.from(
    new Set(activeHoldings.map((holding) => holding.characterId)),
  );
  const characters = await findCharactersByIdsLite(characterIds);
  const characterById = new Map(
    characters.map((character) => [String(character._id), character]),
  );
  const ownerIds = Array.from(
    new Set(
      Array.from(characterById.values())
        .map((character) => character.ownerId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );
  const owners = await findUsersByIds(ownerIds);
  const ownerById = new Map(owners.map((owner) => [String(owner._id), owner]));
  const priceByTicker = new Map(prices.map((price) => [price.ticker, price]));

  const rows: StockAdminHoldingsResponse["rows"] = activeHoldings.map((holding) => {
    const character = characterById.get(holding.characterId) ?? null;
    const ownerId = character?.ownerId ?? null;
    const owner = ownerId ? ownerById.get(ownerId) ?? null : null;
    const meta = findStockByTicker(holding.ticker);
    const currentPrice =
      priceByTicker.get(holding.ticker)?.price ?? meta?.basePrice ?? holding.avgPrice;
    const evaluation = roundStockValue(currentPrice * holding.shares);
    const profitLoss = roundStockValue(
      (currentPrice - holding.avgPrice) * holding.shares,
    );
    const profitPercent =
      holding.avgPrice > 0
        ? ((currentPrice - holding.avgPrice) / holding.avgPrice) * 100
        : 0;

    return {
      characterId: holding.characterId,
      characterCodename: character?.codename ?? "(미등록 캐릭터)",
      characterType: character?.type === "NPC" ? "NPC" : "AGENT",
      ownerId,
      ownerName: owner?.discordUsername ?? owner?.displayName ?? null,
      ticker: holding.ticker,
      stockName: meta?.name ?? "미등록 종목",
      shares: holding.shares,
      avgPrice: holding.avgPrice,
      currentPrice,
      evaluation,
      profitLoss,
      profitPercent,
      updatedAt: holding.updatedAt.toISOString(),
    };
  });

  rows.sort((a, b) => {
    if (b.evaluation !== a.evaluation) return b.evaluation - a.evaluation;
    if (a.ticker !== b.ticker) return a.ticker.localeCompare(b.ticker);
    return a.characterCodename.localeCompare(b.characterCodename);
  });

  return { rows, generatedAt: new Date().toISOString() };
}
