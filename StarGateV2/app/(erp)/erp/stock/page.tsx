/**
 * 주식 종목 리스트 — Stargate ERP (`/erp/stock`).
 *
 * 좌(list) + 가운데(hover 미리보기) + 우(rail) 3-column 풀.
 *  - 행 클릭 시 별도 매수 페이지(`/erp/stock/[ticker]`) 로 push.
 *  - 행 hover 0.5초 후 가운데 영역에 가격/미니 차트/이벤트 요약 표시.
 *
 * 서버 컴포넌트: 메인 캐릭터 + 시세 + 보유 + sparkline + 잔액 병렬 fetch 후 client 시드.
 *
 * Subroutes:
 *  - `/erp/stock/[ticker]` — 매수/매도 풀페이지.
 *  - `/erp/stock/portfolio` — 내 자산 (별도 탭).
 *
 * 권한 — 현재는 ERP 로그인만 통과 (별도 RBAC 게이트 없음).
 */

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { findMainCharacterByOwner } from "@/lib/db/characters";
import { getCharacterBalance } from "@/lib/db/credits";
import { STOCK_CATALOG } from "@/lib/stocks/catalog";
import { isStockMarketEnabled } from "@/lib/stocks/market";

import type {
  StockHoldingsResponse,
  StockPricesResponse,
  StockSparklinesResponse,
} from "@/hooks/queries/useStocksQuery";

import {
  buildHoldingsResponse,
  buildPricesResponse,
  buildSparklinesResponse,
} from "./_data";
import StockListClient from "./StockListClient";

const SPARKLINE_DAYS = 7;

export const metadata = {
  title: "주식 — Stargate ERP",
};

export default async function StockPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const userId = session.user.id;

  // STOCK_CATALOG 시드 누락은 운영 사고 — 빌드 시 invariant.
  if (STOCK_CATALOG.length === 0) {
    throw new Error(
      "STOCK_CATALOG 가 비어 있습니다 — lib/stocks/catalog.ts 시드 누락.",
    );
  }

  // 메인 캐릭터 — null=정상 미등록, throw=1인 1 MAIN 정합성 위반.
  let mainCharacter: Awaited<
    ReturnType<typeof findMainCharacterByOwner>
  > | null = null;
  let mainCharacterError: string | null = null;
  try {
    mainCharacter = await findMainCharacterByOwner(userId);
  } catch (err) {
    console.error(
      `[stock] findMainCharacterByOwner integrity violation (userId=${userId}): `,
      err,
    );
    mainCharacterError =
      "메인 캐릭터 정합성 위반. 운영자(GM)에게 문의해주세요.";
  }
  const mainCharacterId = mainCharacter ? String(mainCharacter._id) : null;

  // prices 먼저 fetch — buildHoldingsResponse 가 같은 데이터를 재사용해 중복 read 회피.
  const initialPrices = await buildPricesResponse().catch(
    (): StockPricesResponse => ({ items: [] }),
  );

  const [initialSparklines, initialHoldings, initialBalance] = await Promise.all([
    buildSparklinesResponse(SPARKLINE_DAYS).catch(
      (): StockSparklinesResponse => ({ items: [], days: SPARKLINE_DAYS }),
    ),
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
    <StockListClient
      initialPrices={initialPrices}
      initialSparklines={initialSparklines}
      initialHoldings={initialHoldings}
      initialBalance={initialBalance}
      mainCharacter={
        mainCharacter && mainCharacterId
          ? { id: mainCharacterId, codename: mainCharacter.codename }
          : null
      }
      mainCharacterError={mainCharacterError}
      marketEnabled={isStockMarketEnabled()}
    />
  );
}
