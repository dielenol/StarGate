/**
 * 주식 — Stargate ERP (M3-A)
 *
 * 서버 컴포넌트: 메인 캐릭터 + 시세/보유 + 잔액/ledger + 첫 종목 history 를 병렬 fetch 후
 * `StockClient` 에 initialData 로 주입. 클라이언트는 TanStack Query 캐시 시드 +
 * 백그라운드 갱신 + 매수/매도 mutation 처리.
 *
 * 권한 — 현재는 ERP 로그인만 통과 (별도 RBAC 게이트 없음).
 * TODO(M3-B): GM 시세 조정 / 거래 정지 / 자동 시세 변동 알고리즘.
 */

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";
import { findMainCharacterByOwner } from "@/lib/db/characters";
import {
  getCharacterBalance,
  listCreditTransactions,
} from "@/lib/db/credits";
import {
  getHoldings,
  getStockPrices,
  listStockPriceHistory,
} from "@/lib/db/stocks";
import { findStockByTicker, STOCK_CATALOG } from "@/lib/stocks/catalog";

import type { CreditsResponse } from "@/hooks/queries/useCreditsQuery";
import type {
  StockHistoryResponse,
  StockHoldingsResponse,
  StockPricesResponse,
} from "@/hooks/queries/useStocksQuery";

import StockClient from "./StockClient";

const INITIAL_LEDGER_LIMIT = 50;
const INITIAL_HISTORY_DAYS = 30;

export const metadata = {
  title: "주식 — Stargate ERP",
};

/* ── 서버 측 시세 응답 빌더 (prices API 와 동일 형식) ── */

async function buildPricesResponse(): Promise<StockPricesResponse> {
  const prices = await getStockPrices();
  const priceByTicker = new Map(prices.map((p) => [p.ticker, p]));

  const items: StockPricesResponse["items"] = STOCK_CATALOG.map((meta) => {
    const row = priceByTicker.get(meta.ticker);
    const price = row?.price ?? meta.basePrice;
    const prevPrice = row?.prevPrice ?? meta.basePrice;
    const eventText = row?.eventText ?? "";
    const lastUpdate = row?.lastUpdate ?? "";
    const changePercent =
      prevPrice > 0 ? ((price - prevPrice) / prevPrice) * 100 : 0;
    return {
      ticker: meta.ticker,
      name: meta.name,
      basePrice: meta.basePrice,
      description: meta.description,
      price,
      prevPrice,
      eventText,
      changePercent,
      lastUpdate,
    };
  });

  return { items };
}

/* ── 서버 측 보유 응답 빌더 (holdings API 와 동일 형식) ── */

async function buildHoldingsResponse(
  mainCharacterId: string | null,
): Promise<StockHoldingsResponse> {
  if (!mainCharacterId) {
    return { items: [], hasMainCharacter: false };
  }

  const [holdings, prices] = await Promise.all([
    getHoldings(mainCharacterId),
    getStockPrices(),
  ]);
  const priceByTicker = new Map(prices.map((p) => [p.ticker, p.price]));

  const items: StockHoldingsResponse["items"] = [];
  for (const h of holdings) {
    const meta = findStockByTicker(h.ticker);
    // 카탈로그 외 ticker — holdings API 와 동일 처리(표시 제외 + 경고).
    if (!meta) {
      console.warn(
        `[stock/page] catalog 외 ticker 보유 발견 — 표시 제외 ` +
          `(characterId=${mainCharacterId}, ticker=${h.ticker}, shares=${h.shares}, avgPrice=${h.avgPrice})`,
      );
      continue;
    }
    const currentPrice = priceByTicker.get(h.ticker) ?? 0;
    const evaluation = currentPrice * h.shares;
    const profitLoss = (currentPrice - h.avgPrice) * h.shares;
    const profitPercent =
      h.avgPrice > 0 ? ((currentPrice - h.avgPrice) / h.avgPrice) * 100 : 0;
    items.push({
      ticker: h.ticker,
      name: meta.name,
      shares: h.shares,
      avgPrice: h.avgPrice,
      currentPrice,
      evaluation,
      profitLoss,
      profitPercent,
    });
  }

  return { items, hasMainCharacter: true };
}

/* ── 서버 측 history 응답 빌더 (history API 와 동일 형식) ── */

async function buildHistoryResponse(
  ticker: string,
): Promise<StockHistoryResponse> {
  const rows = await listStockPriceHistory(ticker, INITIAL_HISTORY_DAYS);
  const items: StockHistoryResponse["items"] = rows.map((r) => ({
    price: r.price,
    prevPrice: r.prevPrice,
    eventText: r.eventText,
    source: r.source,
    createdAt: r.createdAt.toISOString(),
  }));
  return { items };
}

/* ── 페이지 ── */

export default async function StockPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
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
    // 원본 메시지(메인 캐릭 codename 들 포함)는 운영 채널(Vercel 로그)에만 남기고
    // 사용자에게는 일반화된 메시지만 노출 — shop/page.tsx 와 동일 정책.
    console.error(
      `[stock] findMainCharacterByOwner integrity violation (userId=${userId}): `,
      err,
    );
    mainCharacterError =
      "메인 캐릭터 정합성 위반. 운영자(GM)에게 문의해주세요.";
  }
  const mainCharacterId = mainCharacter ? String(mainCharacter._id) : null;

  // 시세/보유/잔액/ledger 병렬 fetch — 각각 독립적이므로 Promise.all + .catch() 폴백.
  // 첫 history ticker 결정은 holdings 결과에 의존하므로 1차 라운드 후 결정.
  const [initialPrices, initialHoldings, initialBalance, initialLedger] =
    await Promise.all([
      buildPricesResponse().catch(
        (): StockPricesResponse => ({ items: [] }),
      ),
      buildHoldingsResponse(mainCharacterId).catch(
        (): StockHoldingsResponse => ({
          items: [],
          hasMainCharacter: mainCharacterId !== null,
        }),
      ),
      mainCharacterId
        ? getCharacterBalance(mainCharacterId).catch(() => 0)
        : Promise.resolve(0),
      mainCharacterId
        ? listCreditTransactions(mainCharacterId, INITIAL_LEDGER_LIMIT).catch(
            () => [],
          )
        : Promise.resolve([]),
    ]);

  // STOCK_CATALOG 는 카탈로그 시드 누락이면 운영 사고 — 빌드 시 invariant.
  // 빈 카탈로그가 placeholder 와 구분 없이 silent 로 가려지는 것 방지.
  if (STOCK_CATALOG.length === 0) {
    throw new Error(
      "STOCK_CATALOG 가 비어 있습니다 — lib/stocks/catalog.ts 시드 누락.",
    );
  }

  // 초기 차트 종목: 보유 ≥ 1 이면 첫 보유 종목, 아니면 카탈로그 첫 종목.
  const initialHistoryTicker =
    initialHoldings.items[0]?.ticker ?? STOCK_CATALOG[0].ticker;

  const initialHistory: StockHistoryResponse = initialHistoryTicker
    ? await buildHistoryResponse(initialHistoryTicker).catch(
        (): StockHistoryResponse => ({ items: [] }),
      )
    : { items: [] };

  // useCredits 가 받을 CreditsResponse — 메인 캐릭이 있을 때만 시드.
  // Next.js 16: Server→Client prop 으로 ObjectId(toJSON 가진 객체) 전달 거부 → _id 를 hex string 으로 정규화.
  const initialCredits: CreditsResponse | undefined =
    mainCharacter && mainCharacterId
      ? {
          transactions: initialLedger.map((t) => ({
            ...t,
            _id: t._id?.toString() as unknown as typeof t._id,
          })),
          balance: initialBalance,
          characterId: mainCharacterId,
          characterCodename: mainCharacter.codename,
        }
      : undefined;

  return (
    <StockClient
      initialPrices={initialPrices}
      initialHoldings={initialHoldings}
      initialHistory={initialHistory}
      initialHistoryTicker={initialHistoryTicker}
      mainCharacter={
        mainCharacter
          ? { id: String(mainCharacter._id), codename: mainCharacter.codename }
          : null
      }
      initialBalance={initialBalance}
      initialCredits={initialCredits}
      mainCharacterError={mainCharacterError}
    />
  );
}
