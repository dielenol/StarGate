/**
 * 주식 — Stargate ERP (M3-A 토스 마스터-디테일 통합).
 *
 * 본 페이지는 좌(list 50%) + 우(detail 50%) 한 화면 마스터-디테일.
 *  - 행 클릭 시 라우트 이동 X — selectedTicker 만 갱신 + URL `?ticker=` replace.
 *  - 새로고침 시 URL `?ticker=XXX` 가 server fallback 보다 우선.
 *  - 잘못된 ticker 는 silent fallback (보유 첫 → catalog 첫 순). notFound 호출 X.
 *
 * 서버 컴포넌트: 메인 캐릭터 + 시세 + 보유 + sparkline + 잔액 + 초기 detail 시계열
 *               병렬 fetch 후 client 시드.
 *
 * Subroutes:
 *  - `/erp/stock/portfolio` — 내 자산 (별도 탭).
 *
 * 권한 — 현재는 ERP 로그인만 통과 (별도 RBAC 게이트 없음).
 * TODO(M3-B): GM 시세 조정 / 거래 정지 / 자동 시세 변동 알고리즘.
 */

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { findMainCharacterByOwner } from "@/lib/db/characters";
import { getCharacterBalance } from "@/lib/db/credits";
import { findStockByTicker, STOCK_CATALOG } from "@/lib/stocks/catalog";

import type {
  StockHistoryResponse,
  StockHoldingsResponse,
  StockPricesResponse,
  StockSparklinesResponse,
} from "@/hooks/queries/useStocksQuery";

import { INITIAL_RANGE, RANGE_TO_DAYS } from "./RangeToggle";
import {
  buildHistoryResponse,
  buildHoldingsResponse,
  buildPricesResponse,
  buildSparklinesResponse,
} from "./_data";
import StockMasterDetailClient from "./StockMasterDetailClient";

const SPARKLINE_DAYS = 7;
/** detail panel 초기 range 와 동일하게 시드. 한 곳에서 변경 시 자동 동기화. */
const INITIAL_HISTORY_DAYS = RANGE_TO_DAYS[INITIAL_RANGE];

export const metadata = {
  title: "주식 — Stargate ERP",
};

interface Props {
  searchParams: Promise<{ ticker?: string }>;
}

export default async function StockPage({ searchParams }: Props) {
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

  // detail ticker 결정 우선순위:
  //  (1) URL ?ticker= 가 catalog 검증 통과
  //  (2) 보유 첫 항목
  //  (3) catalog 첫 항목 (위 invariant 로 항상 존재 보장)
  const params = await searchParams;
  const requestedTicker = params.ticker?.trim();
  const validRequested =
    requestedTicker && findStockByTicker(requestedTicker)
      ? requestedTicker
      : null;
  const initialDetailTicker =
    validRequested ??
    initialHoldings.items[0]?.ticker ??
    STOCK_CATALOG[0].ticker;

  const initialDetailHistory = await buildHistoryResponse(
    initialDetailTicker,
    INITIAL_HISTORY_DAYS,
  ).catch((): StockHistoryResponse => ({ items: [] }));

  return (
    <StockMasterDetailClient
      initialPrices={initialPrices}
      initialSparklines={initialSparklines}
      initialHoldings={initialHoldings}
      initialBalance={initialBalance}
      initialDetailTicker={initialDetailTicker}
      initialDetailHistory={initialDetailHistory}
      mainCharacter={
        mainCharacter && mainCharacterId
          ? { id: mainCharacterId, codename: mainCharacter.codename }
          : null
      }
      mainCharacterError={mainCharacterError}
    />
  );
}
