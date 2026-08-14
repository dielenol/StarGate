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

import { getActiveSession } from "@/lib/auth/active-session";
import { getOwnedDataViewerId } from "@/lib/auth/guest";
import { resolvePlayerServiceAvailability } from "@/lib/auth/player-service-test-access";
import { findMainCharacterDisplayLiteByOwnerCached as findMainCharacterByOwner } from "@/lib/db/characters";
import { findStockByTicker } from "@/lib/stocks/catalog";
import { isStockMarketEnabled } from "@/lib/stocks/market";

import type {
  StockBalanceResponse,
  StockHistoryResponse,
  StockHoldingsResponse,
  StockLedgerResponse,
} from "@/hooks/queries/useStocksQuery";

import { INITIAL_RANGE, RANGE_TO_DAYS } from "../RangeToggle";
import {
  buildHistoryResponse,
  buildHoldingsResponse,
  buildPricesResponse,
  buildStockPricesFallback,
  buildStockBalanceResponse,
  buildStockLedgerResponse,
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
  const session = await getActiveSession();
  if (!session?.user) {
    redirect("/login");
  }

  const { ticker: rawTicker } = await params;
  const ticker = rawTicker.toUpperCase();
  const meta = findStockByTicker(ticker);
  if (!meta) {
    notFound();
  }

  const userId = getOwnedDataViewerId(session.user);

  // 메인 캐릭터 — null=정상 미등록, throw=1인 1 MAIN 정합성 위반.
  let mainCharacter: Awaited<
    ReturnType<typeof findMainCharacterByOwner>
  > | null = null;
  let mainCharacterError: string | null = null;
  try {
    mainCharacter = userId ? await findMainCharacterByOwner(userId) : null;
  } catch (err) {
    console.error(
      `[stock/[ticker]] findMainCharacterByOwner integrity violation (userId=${userId ?? "guest"}): `,
      err,
    );
    mainCharacterError =
      "메인 캐릭터 정합성 위반. 운영자(GM)에게 문의해주세요.";
  }
  const mainCharacterId = mainCharacter ? String(mainCharacter._id) : null;

  // prices 먼저 — buildHoldingsResponse 가 같은 데이터를 재사용해 중복 read 회피.
  const initialPrices = await buildPricesResponse().catch(() =>
    buildStockPricesFallback(),
  );

  const [initialHoldings, initialBalance, initialHistory, initialLedger] =
    await Promise.all([
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
        ? buildStockBalanceResponse(mainCharacterId).catch(
            (): StockBalanceResponse | undefined => undefined,
          )
        : Promise.resolve<StockBalanceResponse>({
            balance: 0,
            characterId: null,
            hasMainCharacter: false,
          }),
      buildHistoryResponse(ticker, INITIAL_HISTORY_DAYS).catch(
        (): StockHistoryResponse => ({ items: [] }),
      ),
      mainCharacterId
        ? buildStockLedgerResponse(mainCharacterId, ticker).catch(
            (): StockLedgerResponse | undefined => undefined,
          )
        : Promise.resolve<StockLedgerResponse>({
            items: [],
            characterId: null,
            ticker,
            hasMainCharacter: false,
          }),
    ]);

  return (
    <StockTradeClient
      ticker={ticker}
      initialPrices={initialPrices}
      initialHoldings={initialHoldings}
      initialBalance={initialBalance}
      initialHistory={initialHistory}
      initialLedger={initialLedger}
      mainCharacter={
        mainCharacter && mainCharacterId
          ? { id: mainCharacterId, codename: mainCharacter.codename }
          : null
      }
      mainCharacterError={mainCharacterError}
      marketEnabled={resolvePlayerServiceAvailability(
        isStockMarketEnabled(),
        session.user,
      )}
    />
  );
}
