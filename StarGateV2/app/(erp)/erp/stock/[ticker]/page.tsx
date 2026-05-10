/**
 * 주식 종목 상세 — `/erp/stock/[ticker]`.
 *
 * 토스 패턴: 큰 가격 hero + 변동 칩 + 시간 토글 + 큰 차트 + 종목 정보.
 * 하단 sticky CTA 두 버튼 (매도 / 매수) — 보유 0이면 매도 disabled.
 *
 * 서버: ticker 검증 → 시세 + 보유 + 1M 시계열 + 잔액 병렬 fetch → 클라이언트 시드.
 *
 * 동적 segment vs 정적 segment — Next.js App Router 는 정적(`portfolio`)이 우선 매칭.
 * `findStockByTicker` 미존재 ticker 는 notFound() 로 404.
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
import StockDetailClient from "./StockDetailClient";

/**
 * initialHistory days — RangeToggle 의 INITIAL_RANGE 와 동일하게 시드.
 * 한 곳에서 변경 시 다른 곳도 자동 동기화 (silent coupling 회피).
 */
const INITIAL_HISTORY_DAYS = RANGE_TO_DAYS[INITIAL_RANGE];

interface Props {
  params: Promise<{ ticker: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { ticker } = await params;
  const meta = findStockByTicker(ticker);
  if (!meta) return { title: "주식 — Stargate ERP" };
  return {
    title: `${meta.name} (${meta.ticker}) — 주식 — Stargate ERP`,
  };
}

export default async function StockDetailPage({ params }: Props) {
  const { ticker } = await params;
  const meta = findStockByTicker(ticker);
  if (!meta) notFound();

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
      `[stock/[ticker]] findMainCharacterByOwner integrity violation (userId=${userId}): `,
      err,
    );
    mainCharacterError =
      "메인 캐릭터 정합성 위반. 운영자(GM)에게 문의해주세요.";
  }
  const mainCharacterId = mainCharacter ? String(mainCharacter._id) : null;

  // prices/holdings 는 모든 종목 fetch 후 클라이언트에서 ticker 로 lookup.
  // (ticker 단건 holding 빌더는 따로 두지 않음 — useStockHoldings 가 전 종목 캐시를 공유.)
  // prices 는 holdings 가 currentPrice 계산에 재사용 → 먼저 fetch 후 전달 (중복 read 방지).
  // history/balance 는 prices 와 독립이라 그 다음 Promise.all 에 둠.
  const pricesAll = await buildPricesResponse().catch(
    (): StockPricesResponse => ({ items: [] }),
  );

  const [holdingsAll, initialHistory, initialBalance] = await Promise.all([
    mainCharacterId
      ? buildHoldingsResponse(mainCharacterId, pricesAll).catch(
          (): StockHoldingsResponse => ({
            items: [],
            hasMainCharacter: true,
          }),
        )
      : Promise.resolve<StockHoldingsResponse>({
          items: [],
          hasMainCharacter: false,
        }),
    buildHistoryResponse(meta.ticker, INITIAL_HISTORY_DAYS).catch(
      (): StockHistoryResponse => ({ items: [] }),
    ),
    mainCharacterId
      ? getCharacterBalance(mainCharacterId).catch(() => 0)
      : Promise.resolve(0),
  ]);

  return (
    <StockDetailClient
      ticker={meta.ticker}
      meta={meta}
      initialPrices={pricesAll}
      initialHoldings={holdingsAll}
      initialHistory={initialHistory}
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
