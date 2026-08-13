/** GET /api/erp/stocks/realized-profit — 세션 소유자의 전체 기간 실현손익. */

import { NextResponse } from "next/server";

import type { StockRealizedProfitResponse } from "@/hooks/queries/useStocksQuery";

import { auth } from "@/lib/auth/config";
import { getStockRealizedProfitSummary } from "@/lib/db/stock-account";
import { resolveOwnedCreditCharacter } from "@/lib/credits/account-read";
import { roundStockValue } from "@/lib/stocks/pricing";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const character = await resolveOwnedCreditCharacter(
    session.user,
    "stocks/realized-profit",
  );
  if (character.status === "integrity-error") {
    return NextResponse.json(
      {
        error: "메인 캐릭터 정합성 위반 — 운영자(GM)에게 문의해주세요.",
        code: "MAIN_CHARACTER_INTEGRITY",
      },
      { status: 409 },
    );
  }
  if (character.status === "lookup-error") {
    return NextResponse.json(
      { error: "메인 캐릭터를 확인할 수 없습니다." },
      { status: 500 },
    );
  }
  if (character.status === "missing") {
    const response: StockRealizedProfitResponse = {
      realizedProfit: 0,
      countedSales: 0,
      totalSales: 0,
      characterId: null,
      hasMainCharacter: false,
    };
    return NextResponse.json(response, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  try {
    const summary = await getStockRealizedProfitSummary(character.characterId);
    const response: StockRealizedProfitResponse = {
      realizedProfit: roundStockValue(summary.realizedProfit),
      countedSales: summary.countedSales,
      totalSales: summary.totalSales,
      characterId: character.characterId,
      hasMainCharacter: true,
    };
    return NextResponse.json(response, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[stocks/realized-profit] summary lookup failed", error);
    return NextResponse.json(
      { error: "실현손익을 불러올 수 없습니다." },
      { status: 500 },
    );
  }
}
