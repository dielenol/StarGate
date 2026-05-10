/**
 * 주식 — 내 자산 (`/erp/stock/portfolio`).
 *
 * 토스 패턴: 평가금/총손익/손익% 3-column hero + 보유 종목 list.
 * 행 클릭 시 `/erp/stock/[ticker]` 풀페이지 상세로 이동 → 거기서 매도 sticky CTA.
 *
 * 서버: 메인 캐릭터 + 시세 + 보유 + 잔액 병렬 fetch.
 */

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { findMainCharacterByOwner } from "@/lib/db/characters";
import { getCharacterBalance } from "@/lib/db/credits";

import type {
  StockHoldingsResponse,
  StockPricesResponse,
} from "@/hooks/queries/useStocksQuery";

import { buildHoldingsResponse, buildPricesResponse } from "../_data";
import StockPortfolioClient from "./StockPortfolioClient";

export const metadata = {
  title: "내 자산 — 주식 — Stargate ERP",
};

export default async function StockPortfolioPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const userId = session.user.id;

  let mainCharacter: Awaited<
    ReturnType<typeof findMainCharacterByOwner>
  > | null = null;
  let mainCharacterError: string | null = null;
  try {
    mainCharacter = await findMainCharacterByOwner(userId);
  } catch (err) {
    console.error(
      `[stock/portfolio] findMainCharacterByOwner integrity violation (userId=${userId}): `,
      err,
    );
    mainCharacterError =
      "메인 캐릭터 정합성 위반. 운영자(GM)에게 문의해주세요.";
  }
  const mainCharacterId = mainCharacter ? String(mainCharacter._id) : null;

  // prices 를 먼저 fetch — buildHoldingsResponse 가 같은 데이터를 재사용하여
  // SSR 중 stock_prices 컬렉션 중복 read 방지.
  const initialPrices = await buildPricesResponse().catch(
    (): StockPricesResponse => ({ items: [] }),
  );

  const [initialHoldings, initialBalance] = await Promise.all([
    mainCharacterId
      ? buildHoldingsResponse(mainCharacterId, initialPrices).catch(
          (): StockHoldingsResponse => ({
            items: [],
            hasMainCharacter: true,
          }),
        )
      : Promise.resolve<StockHoldingsResponse>({
          items: [],
          hasMainCharacter: false,
        }),
    mainCharacterId
      ? getCharacterBalance(mainCharacterId).catch(() => 0)
      : Promise.resolve(0),
  ]);

  return (
    <StockPortfolioClient
      initialPrices={initialPrices}
      initialHoldings={initialHoldings}
      initialBalance={initialBalance}
      mainCharacter={
        mainCharacter && mainCharacterId
          ? { id: mainCharacterId, codename: mainCharacter.codename }
          : null
      }
      mainCharacterError={mainCharacterError}
    />
  );
}
