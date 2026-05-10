"use client";

/**
 * 종목 상세 client (`/erp/stock/[ticker]`).
 *
 * - 토스 hero: 큰 가격 + 변동 칩 + 종목 메타.
 * - RangeToggle (1D / 1W / 1M / ALL) — useStockHistory(ticker, { days }) 갱신.
 * - 큰 차트 (440px hero, recharts dynamic import 유지 — 초기 번들 회피).
 * - 종목 정보 + 보유 정보 카드.
 * - 하단 sticky CTA: [매도] [매수] — 보유 0이면 매도 disabled. 클릭 시 풀스크린 sheet.
 * - 매매 sheet 는 dynamic import (모달과 동일한 lazy 정책).
 *
 * 페이지 자체가 단일 ticker scope 이므로 상위 list view 의 selectedTicker 상태 불필요.
 */

import { useMemo, useState } from "react";

import dynamic from "next/dynamic";

import {
  type CreditsResponse,
  useCredits,
} from "@/hooks/queries/useCreditsQuery";
import {
  useBuyStock,
  useSellStock,
} from "@/hooks/mutations/useStocksMutation";
import {
  StocksApiError,
  type StockHoldingItem,
  type StockHoldingsResponse,
  type StockPriceItem,
  type StockPricesResponse,
  type StockHistoryResponse,
  type StocksErrorCode,
  useStockHistory,
  useStockHoldings,
  useStockPrices,
} from "@/hooks/queries/useStocksQuery";

import Box from "@/components/ui/Box/Box";
import PageHead from "@/components/ui/PageHead/PageHead";

import type { StockCatalogItem } from "@/lib/stocks/catalog";

import RangeToggle, {
  INITIAL_RANGE,
  RANGE_TO_DAYS,
  type RangeKey,
} from "../RangeToggle";
import { ChartSkeleton, type ChartPoint } from "../StockHistoryChart";

import styles from "../page.module.css";

/**
 * recharts 약 95KB(gzipped) 회피 — dynamic import + ssr:false.
 * Sheet 도 클릭 전엔 필요 없음 → dynamic.
 */
const StockHistoryChart = dynamic(() => import("../StockHistoryChart"), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});
const StockTradeSheet = dynamic(() => import("../StockTradeSheet"), {
  ssr: false,
});

/* ── 상수 ── */

const ERROR_MESSAGE: Record<StocksErrorCode, string> = {
  NO_MAIN_CHARACTER: "메인 AGENT 캐릭터가 등록되지 않았습니다.",
  MAIN_CHARACTER_INTEGRITY:
    "메인 캐릭터 정합성 위반 — 운영자(GM)에게 문의하세요.",
  PRICE_NOT_FOUND: "종목 시세를 찾을 수 없습니다.",
  INSUFFICIENT_BALANCE: "잔액이 부족합니다.",
  INSUFFICIENT_SHARES: "보유 주식이 부족합니다.",
  REFUND_FAILED:
    "매수 실패 + 자동 환불 실패. 운영자(GM)에게 문의해 잔액 정정을 요청하세요.",
  HOLDING_FAILED_REFUNDED:
    "매수에 실패했습니다. 차감된 잔액은 자동 환불되었습니다.",
  SELL_LEDGER_FAILED_RESTORED:
    "매도에 실패했습니다. 차감된 보유량은 자동 복구되었습니다.",
  RESTORE_FAILED:
    "매도 실패 + 보유량 복구 실패. 운영자(GM)에게 문의해 보유량 정정을 요청하세요.",
};

type Direction = "up" | "down" | "flat";

const ARROW: Record<Direction, string> = {
  up: "▲",
  down: "▼",
  flat: "·",
};

function priceDirection(price: number, prev: number): Direction {
  if (price > prev) return "up";
  if (price < prev) return "down";
  return "flat";
}

function profitDirection(profit: number): Direction {
  if (profit > 0) return "up";
  if (profit < 0) return "down";
  return "flat";
}

function describeStocksError(err: unknown): string {
  if (err instanceof StocksApiError) {
    if (err.code) return ERROR_MESSAGE[err.code] ?? err.message;
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "알 수 없는 오류가 발생했습니다.";
}

/* ── Sheet 상태 ── */

type SheetState = {
  kind: "trade";
  initialTab: "buy" | "sell";
} | null;

/* ── Props ── */

interface Props {
  ticker: string;
  meta: StockCatalogItem;
  initialPrices: StockPricesResponse;
  initialHoldings: StockHoldingsResponse;
  initialHistory: StockHistoryResponse;
  initialBalance: number;
  mainCharacter: { id: string; codename: string } | null;
  mainCharacterError: string | null;
}

/* ── 컴포넌트 ── */

export default function StockDetailClient({
  ticker,
  meta,
  initialPrices,
  initialHoldings,
  initialHistory,
  initialBalance,
  mainCharacter,
  mainCharacterError,
}: Props) {
  /* 6. 쿼리 */
  const pricesQuery = useStockPrices({ initialData: initialPrices });
  const holdingsQuery = useStockHoldings({ initialData: initialHoldings });
  const creditsQuery = useCredits({
    initialData: undefined as CreditsResponse | undefined,
  });

  const buyMutation = useBuyStock();
  const sellMutation = useSellStock();

  /* 10. 로컬 */
  const [range, setRange] = useState<RangeKey>(INITIAL_RANGE);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /* 11. 파생 */
  const days = RANGE_TO_DAYS[range];
  const historyQuery = useStockHistory(ticker, {
    days,
    // INITIAL_RANGE (= 30일) 일 때만 server initialHistory 시드. 다른 range 는 fetch.
    initialData: range === INITIAL_RANGE ? initialHistory : undefined,
  });

  const prices = pricesQuery.data ?? initialPrices;
  const holdings = holdingsQuery.data ?? initialHoldings;
  const history = historyQuery.data ?? { items: [] };

  // 잔액: useCredits 응답이 도착하면 그것을, 아니면 초기 props.
  const balance = useMemo(() => {
    if (creditsQuery.data) return creditsQuery.data.balance;
    return initialBalance;
  }, [creditsQuery.data, initialBalance]);

  const currentPrice: StockPriceItem | undefined = useMemo(() => {
    return prices.items.find((p) => p.ticker === ticker);
  }, [prices.items, ticker]);

  const holding: StockHoldingItem | undefined = useMemo(() => {
    return holdings.items.find((h) => h.ticker === ticker);
  }, [holdings.items, ticker]);

  const hasMainCharacter = mainCharacter !== null && !mainCharacterError;
  const isMarketOpen = true;
  const canTrade = hasMainCharacter && isMarketOpen;
  const sellDisabled = !canTrade || !holding || holding.shares === 0;

  /* 14. 핸들러 */
  function openBuy() {
    if (!canTrade) return;
    setErrorMessage(null);
    setSheet({ kind: "trade", initialTab: "buy" });
  }

  function openSell() {
    if (sellDisabled) return;
    setErrorMessage(null);
    setSheet({ kind: "trade", initialTab: "sell" });
  }

  function closeSheet() {
    setSheet(null);
  }

  function handleBuyConfirm(shares: number) {
    if (!currentPrice) return;
    buyMutation.mutate(
      { ticker, shares },
      {
        onSuccess: () => {
          setSheet(null);
          setErrorMessage(null);
        },
        onError: (err) => {
          setErrorMessage(describeStocksError(err));
        },
      },
    );
  }

  function handleSellConfirm(shares: number) {
    if (!currentPrice) return;
    sellMutation.mutate(
      { ticker, shares },
      {
        onSuccess: () => {
          setSheet(null);
          setErrorMessage(null);
        },
        onError: (err) => {
          setErrorMessage(describeStocksError(err));
        },
      },
    );
  }

  /* ── 차트 데이터 ── */

  const chartData: ChartPoint[] = useMemo(() => {
    return history.items.map((row) => ({
      ts: row.createdAt,
      price: row.price,
      eventText: row.eventText ?? "",
      source: row.source,
    }));
  }, [history.items]);

  /* ── Hero ── */

  // currentPrice 가 없는 경우(시세 fetch 실패 등) catalog meta 의 basePrice 로 fallback.
  const displayPrice = currentPrice?.price ?? meta.basePrice;
  const displayPrevPrice = currentPrice?.prevPrice ?? meta.basePrice;
  const heroDirection = priceDirection(displayPrice, displayPrevPrice);
  const heroChangeMod =
    heroDirection === "up"
      ? styles["detailHero__change--up"]
      : heroDirection === "down"
        ? styles["detailHero__change--down"]
        : "";
  const changePercent = currentPrice?.changePercent ?? 0;

  /* ── Holding direction ── */

  const holdingDir = holding ? profitDirection(holding.profitLoss) : "flat";
  const holdingMod =
    holdingDir === "up"
      ? styles["detailHolding__value--up"]
      : holdingDir === "down"
        ? styles["detailHolding__value--down"]
        : "";

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "주식", href: "/erp/stock" },
          { label: meta.ticker },
        ]}
        title={meta.name}
      />

      {/* 메인 캐릭터 안내 */}
      {!hasMainCharacter ? (
        <Box className={styles.notice}>
          {mainCharacterError ? (
            <>
              <strong className={styles.notice__strong}>⚠ 정합성 위반</strong>
              {": "}
              {mainCharacterError}
              <br />
              운영자(GM)에게 문의하세요. 시세·차트는 열람만 가능합니다.
            </>
          ) : (
            <>
              메인 AGENT 캐릭터가 없어 매수·매도할 수 없습니다. 캐릭터 등록 후
              다시 확인하세요.
            </>
          )}
        </Box>
      ) : null}

      {/* mutation 에러 배너 */}
      {errorMessage ? (
        <Box className={styles.errorBanner} role="alert">
          <strong className={styles.notice__strong}>⚠</strong> {errorMessage}
          <button
            type="button"
            className={styles.errorBanner__dismiss}
            onClick={() => setErrorMessage(null)}
            aria-label="에러 메시지 닫기"
          >
            ✕
          </button>
        </Box>
      ) : null}

      {/* ── Hero — 큰 가격 + 변동 칩 + 종목 설명 ── */}
      <div className={styles.detailHero}>
        <div className={styles.detailHero__head}>
          <span className={styles.detailHero__ticker}>{meta.ticker}</span>
          <span className={styles.detailHero__name}>{meta.name}</span>
        </div>
        <div className={styles.detailHero__priceRow}>
          <span className={styles.detailHero__price}>
            ¤ {displayPrice.toLocaleString()}
          </span>
          <span
            className={[styles.detailHero__change, heroChangeMod]
              .filter(Boolean)
              .join(" ")}
          >
            {ARROW[heroDirection]} {changePercent.toFixed(2)}%
          </span>
        </div>
        {meta.description ? (
          <div className={styles.detailHero__description}>
            {meta.description}
          </div>
        ) : null}
      </div>

      {/* ── 차트 패널: range toggle + 큰 차트 ── */}
      <div className={styles.chartPanel}>
        <div className={styles.chartPanel__head}>
          <RangeToggle value={range} onChange={setRange} />
        </div>

        {chartData.length === 0 ? (
          <div className={styles.chartPanel__placeholder}>
            <div className={styles.chartPanel__placeholderTitle}>
              준비 중인 차트
            </div>
            <div className={styles.chartPanel__placeholderHint}>
              히스토리 없음 — 첫 매매 또는 GM 개입 후 기록됩니다.
            </div>
          </div>
        ) : (
          <StockHistoryChart data={chartData} />
        )}
      </div>

      {/* ── 종목 정보 ── */}
      <div className={styles.detailInfo}>
        <div className={styles.detailInfo__cell}>
          <span className={styles.detailInfo__label}>현재가</span>
          <span className={styles.detailInfo__value}>
            ¤ {displayPrice.toLocaleString()}
          </span>
        </div>
        <div className={styles.detailInfo__cell}>
          <span className={styles.detailInfo__label}>기준가</span>
          <span className={styles.detailInfo__value}>
            ¤ {meta.basePrice.toLocaleString()}
          </span>
        </div>
        <div className={styles.detailInfo__cell}>
          <span className={styles.detailInfo__label}>이벤트</span>
          <span className={styles.detailInfo__valueNote}>
            {currentPrice?.eventText || "—"}
          </span>
        </div>
      </div>

      {/* ── 보유 정보 (메인 캐릭터 + 보유 ≥ 1 일 때만) ── */}
      {hasMainCharacter && holding && holding.shares > 0 ? (
        <div className={styles.detailHolding}>
          <div className={styles.detailHolding__cell}>
            <span className={styles.detailHolding__label}>보유</span>
            <span className={styles.detailHolding__value}>
              {holding.shares.toLocaleString()} 주
            </span>
          </div>
          <div className={styles.detailHolding__cell}>
            <span className={styles.detailHolding__label}>평단</span>
            <span className={styles.detailHolding__value}>
              ¤ {holding.avgPrice.toLocaleString()}
            </span>
          </div>
          <div className={styles.detailHolding__cell}>
            <span className={styles.detailHolding__label}>평가금</span>
            <span className={styles.detailHolding__value}>
              ¤ {holding.evaluation.toLocaleString()}
            </span>
          </div>
          <div className={styles.detailHolding__cell}>
            <span className={styles.detailHolding__label}>손익</span>
            <span
              className={[styles.detailHolding__value, holdingMod]
                .filter(Boolean)
                .join(" ")}
            >
              {holding.profitLoss > 0 ? "+" : ""}
              {holding.profitLoss.toLocaleString()} (
              {holding.profitPercent > 0 ? "+" : ""}
              {holding.profitPercent.toFixed(2)}%)
            </span>
          </div>
        </div>
      ) : null}

      {/* ── 하단 sticky CTA — 매도 / 매수 ── */}
      <div className={styles.stickyCta}>
        <button
          type="button"
          className={`${styles.stickyCta__btn} ${styles["stickyCta__btn--sell"]}`}
          onClick={openSell}
          disabled={sellDisabled}
          aria-label="매도"
        >
          매도
        </button>
        <button
          type="button"
          className={`${styles.stickyCta__btn} ${styles["stickyCta__btn--buy"]}`}
          onClick={openBuy}
          disabled={!canTrade}
          aria-label="매수"
        >
          매수
        </button>
      </div>

      {/* ── 풀스크린 매매 시트 ── */}
      {sheet ? (
        <StockTradeSheet
          isOpen={true}
          initialTab={sheet.initialTab}
          ticker={meta.ticker}
          name={meta.name}
          description={meta.description}
          price={displayPrice}
          balance={balance}
          holding={holding?.shares ?? 0}
          avgPrice={holding?.avgPrice ?? 0}
          onClose={closeSheet}
          onBuy={handleBuyConfirm}
          onSell={handleSellConfirm}
          buyPending={buyMutation.isPending}
          sellPending={sellMutation.isPending}
        />
      ) : null}
    </>
  );
}
