/**
 * 종목 매수/매도 페이지 — Stargate ERP (`/erp/stock/[ticker]`).
 *
 * 토스 풀 트레이딩 뷰 톤. `/erp/stock` 의 마스터-디테일 detail 패널을 별도 라우트로
 * 분리한 결과 — 차트 + 매수/매도 폼 + 보유 + 시세 테이블 + 종목 정보를 한 페이지에서
 * 다룬다.
 *
 * 라우팅:
 *  - ticker validation: `findStockByTicker(ticker)` 실패 시 `notFound()`.
 *  - 좌측 list (`/erp/stock`) 에서 push 진입. 직접 URL 도 지원.
 *
 * 서버 컴포넌트: 메인 캐릭터 + 시세 + 보유 + 잔액 + 1M 시계열 병렬 fetch 후 client 시드.
 */

import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { findMainCharacterByOwner } from "@/lib/db/characters";
import { getCharacterBalance } from "@/lib/db/credits";
import { findStockByTicker } from "@/lib/stocks/catalog";

import type {
  StockHistoryResponse,
  StockHoldingsResponse,
  StockPricesResponse,
} from "@/hooks/queries/useStocksQuery";

import { INITIAL_RANGE, RANGE_TO_DAYS } from "../RangeToggle";
import {
  buildHistoryResponse,
  buildHoldingsResponse,
  buildPricesResponse,
} from "../_data";
import StockTradeClient from "./StockTradeClient";

/** 매수 페이지 초기 차트 range 와 동일하게 시드. 한 곳에서 변경 시 자동 동기화. */
const INITIAL_HISTORY_DAYS = RANGE_TO_DAYS[INITIAL_RANGE];

interface Props {
  params: Promise<{ ticker: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { ticker } = await params;
  const meta = findStockByTicker(ticker.toUpperCase());
  if (!meta) {
    return { title: "종목 — Stargate ERP" };
  }
  return { title: `${meta.name} (${meta.ticker}) — 주식 — Stargate ERP` };
}

export default async function StockTradePage({ params }: Props) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { ticker: rawTicker } = await params;
  const ticker = rawTicker.toUpperCase();
  const meta = findStockByTicker(ticker);
  if (!meta) {
    notFound();
  }

  const userId = session.user.id;

  // 메인 캐릭터 — null=정상 미등록, throw=1인 1 MAIN 정합성 위반.
  let mainCharacter: Awaited<
    ReturnType<typeof findMainCharacterByOwner>
  > | null = null;
  let mainCharacterError: string | null = null;
  try {
    mainCharacter = await findMainCharacterByOwner(userId);
  } catch (err) {
    console.error(
      `[stock/[ticker]] findMainCharacterByOwner integrity violation (userId=${userId}): `,
      err,
    );
    mainCharacterError =
      "메인 캐릭터 정합성 위반. 운영자(GM)에게 문의해주세요.";
  }
  const mainCharacterId = mainCharacter ? String(mainCharacter._id) : null;

  // prices 먼저 — buildHoldingsResponse 가 같은 데이터를 재사용해 중복 read 회피.
  const initialPrices = await buildPricesResponse().catch(
    (): StockPricesResponse => ({ items: [] }),
  );

  const [initialHoldings, initialBalance, initialHistory] = await Promise.all([
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
    buildHistoryResponse(ticker, INITIAL_HISTORY_DAYS).catch(
      (): StockHistoryResponse => ({ items: [] }),
    ),
  ]);

  return (
    <StockTradeClient
      ticker={ticker}
      initialPrices={initialPrices}
      initialHoldings={initialHoldings}
      initialBalance={initialBalance}
      initialHistory={initialHistory}
      mainCharacter={
        mainCharacter && mainCharacterId
          ? { id: mainCharacterId, codename: mainCharacter.codename }
          : null
      }
      mainCharacterError={mainCharacterError}
    />
  );
}
