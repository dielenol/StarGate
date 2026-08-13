/** GET /api/erp/stocks/ledger?ticker= — 세션 소유자의 ticker별 최근 체결 원장 5건. */

import { NextResponse } from "next/server";

import type { StockLedgerResponse } from "@/hooks/queries/useStocksQuery";

import { auth } from "@/lib/auth/config";
import { listRecentStockLedger } from "@/lib/db/stock-account";
import { resolveOwnedCreditCharacter } from "@/lib/credits/account-read";
import { findStockByTicker } from "@/lib/stocks/catalog";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ticker =
    new URL(request.url).searchParams.get("ticker")?.trim().toUpperCase() ?? "";
  if (!ticker || !findStockByTicker(ticker)) {
    return NextResponse.json(
      { error: "주식 카탈로그에 없는 종목입니다." },
      { status: 400 },
    );
  }

  const character = await resolveOwnedCreditCharacter(
    session.user,
    "stocks/ledger",
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
    const response: StockLedgerResponse = {
      items: [],
      characterId: null,
      ticker,
      hasMainCharacter: false,
    };
    return NextResponse.json(response, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  try {
    const rows = await listRecentStockLedger(character.characterId, ticker, 5);
    const response: StockLedgerResponse = {
      items: rows.map((row) => ({
        id: String(row._id),
        type: row.type,
        amount: row.amount,
        balance: row.balance,
        ...(row.metadata ? { metadata: row.metadata } : {}),
        createdAt: row.createdAt.toISOString(),
      })),
      characterId: character.characterId,
      ticker,
      hasMainCharacter: true,
    };
    return NextResponse.json(response, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[stocks/ledger] recent ledger lookup failed", error);
    return NextResponse.json(
      { error: "주식 체결 원장을 불러올 수 없습니다." },
      { status: 500 },
    );
  }
}
