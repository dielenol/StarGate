"use client";

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
  type StockHistoryResponse,
  type StockHoldingItem,
  type StockHoldingsResponse,
  type StockPriceItem,
  type StockPricesResponse,
  type StockSparkline as StockSparklineDto,
  type StocksErrorCode,
  useStockHistory,
  useStockHoldings,
  useStockPrices,
  useStockSparklines,
} from "@/hooks/queries/useStocksQuery";

import Box from "@/components/ui/Box/Box";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PageHead from "@/components/ui/PageHead/PageHead";
import PanelTitle from "@/components/ui/PanelTitle/PanelTitle";
import Tag from "@/components/ui/Tag/Tag";

import RangeToggle, { RANGE_TO_DAYS, type RangeKey } from "./RangeToggle";
import { ChartSkeleton, type ChartPoint } from "./StockHistoryChart";
import StockSparkline from "./StockSparkline";

import styles from "./page.module.css";

/**
 * recharts 약 95KB(gzipped) 초기 번들 회피 — dynamic import + ssr:false.
 * loading 동안 ChartSkeleton 이 동일 height 를 점유해 CLS 0 유지.
 *
 * Note — StockSparkline 도 recharts 를 쓰지만 카드 즉시 렌더가 핵심(토스 톤 키)이라
 * 정적 import. recharts vendor chunk 는 어차피 sparkline 카드로 필수 로드되므로
 * StockHistoryChart 의 dynamic 이득은 Hero chart 의 첫 렌더 placeholder + 모바일 등
 * 차트 영역이 아래로 밀린 케이스의 paint 단축에서 발생.
 *
 * StockTradeModal 은 모달 — 사용자가 클릭하기 전엔 필요 없어 dynamic.
 */
const StockHistoryChart = dynamic(() => import("./StockHistoryChart"), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});
const StockTradeModal = dynamic(() => import("./StockTradeModal"), {
  ssr: false,
});

/* ── 상수 ── */

/** 서버 에러 코드 → 한국어 사용자 메시지. */
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

/** 카드 sparkline 기본 조회 일수. 토스 미니차트는 보통 1주 기간. */
const SPARKLINE_DAYS = 7;

/** 등락 방향 — 카드/차트/포지션에서 동일 분기. */
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

/* ── 모달 상태 ── */

type ModalState = {
  kind: "trade";
  ticker: string;
  initialTab: "buy" | "sell";
} | null;

/* ── Props ── */

interface Props {
  initialPrices: StockPricesResponse;
  initialHoldings: StockHoldingsResponse;
  initialHistory: StockHistoryResponse;
  initialHistoryTicker: string;
  mainCharacter: { id: string; codename: string } | null;
  initialBalance: number;
  initialCredits: CreditsResponse | undefined;
  mainCharacterError: string | null;
}

/* ── 컴포넌트 ── */

export default function StockClient({
  initialPrices,
  initialHoldings,
  initialHistory,
  initialHistoryTicker,
  mainCharacter,
  initialBalance,
  initialCredits,
  mainCharacterError,
}: Props) {
  /* 6. 쿼리 */
  const pricesQuery = useStockPrices({ initialData: initialPrices });
  const holdingsQuery = useStockHoldings({ initialData: initialHoldings });
  const creditsQuery = useCredits({ initialData: initialCredits });
  const sparklinesQuery = useStockSparklines(SPARKLINE_DAYS);

  const buyMutation = useBuyStock();
  const sellMutation = useSellStock();

  /* 10. 로컬 상태 */
  const [selectedTicker, setSelectedTicker] = useState<string>(
    initialHistoryTicker,
  );
  const [range, setRange] = useState<RangeKey>("1M");
  const [modal, setModal] = useState<ModalState>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // initialData 시드는 (selectedTicker == initialTicker && range == "1M") 일 때만.
  // 그 외 경로는 새로 fetch.
  const days = RANGE_TO_DAYS[range];
  const historyQuery = useStockHistory(selectedTicker, {
    days,
    initialData:
      selectedTicker === initialHistoryTicker && range === "1M"
        ? initialHistory
        : undefined,
  });

  /* 11. 파생 */
  const prices = pricesQuery.data ?? initialPrices;
  const holdings = holdingsQuery.data ?? initialHoldings;
  const history = historyQuery.data ?? { items: [] };

  // 잔액: useCredits 응답이 도착하면 그것을, 아니면 초기 props.
  const balance = useMemo(() => {
    if (creditsQuery.data) return creditsQuery.data.balance;
    return initialBalance;
  }, [creditsQuery.data, initialBalance]);

  // ticker → price/holding lookup. modal 띄울 때 ticker 만 가지고 즉시 조회용.
  // (카드 렌더 자체는 prices.items 를 그대로 순회하므로 별개 — server `_data` 의
  // priceByTicker 는 응답 빌더 전용이라 client 의 lookup map 과 책임이 다름.)
  const priceByTicker = useMemo(() => {
    const map = new Map<string, StockPriceItem>();
    for (const item of prices.items) map.set(item.ticker, item);
    return map;
  }, [prices.items]);

  const holdingByTicker = useMemo(() => {
    const map = new Map<string, StockHoldingItem>();
    for (const item of holdings.items) map.set(item.ticker, item);
    return map;
  }, [holdings.items]);

  // sparkline 시계열 인덱싱 — ticker → points 배열.
  // 응답 누락 ticker 는 빈 배열 (StockSparkline 이 placeholder 처리).
  const sparklineByTicker = useMemo(() => {
    const map = new Map<string, StockSparklineDto["points"]>();
    if (sparklinesQuery.data) {
      for (const item of sparklinesQuery.data.items) {
        map.set(item.ticker, item.points);
      }
    }
    return map;
  }, [sparklinesQuery.data]);

  const selectedPrice: StockPriceItem | undefined =
    priceByTicker.get(selectedTicker);

  // 모달 대상 — modal state 로부터 시세/보유 lookup.
  const tradeTarget: StockPriceItem | undefined = modal
    ? priceByTicker.get(modal.ticker)
    : undefined;
  const tradeHolding: StockHoldingItem | undefined = modal
    ? holdingByTicker.get(modal.ticker)
    : undefined;

  const hasMainCharacter = mainCharacter !== null && !mainCharacterError;
  // M3-A: 거래 정지 토글 없음. M3-B 에 도입 시 isOpen 으로 분기.
  const isMarketOpen = true;
  const canTrade = hasMainCharacter && isMarketOpen;

  /* 11. 파생 — portfolio summary */
  const portfolioSummary = useMemo(() => {
    if (holdings.items.length === 0) {
      return { totalEval: 0, totalPL: 0, totalCost: 0, plPercent: 0 };
    }
    let totalEval = 0;
    let totalPL = 0;
    let totalCost = 0;
    for (const h of holdings.items) {
      totalEval += h.evaluation;
      totalPL += h.profitLoss;
      totalCost += h.avgPrice * h.shares;
    }
    const plPercent = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;
    return { totalEval, totalPL, totalCost, plPercent };
  }, [holdings.items]);

  /* 14. 핸들러 */
  function handleSelectTicker(ticker: string) {
    setSelectedTicker(ticker);
  }

  function handleBuyClick(ticker: string) {
    if (!canTrade) return;
    setErrorMessage(null);
    setModal({ kind: "trade", ticker, initialTab: "buy" });
  }

  function handleSellClick(ticker: string) {
    if (!canTrade) return;
    setErrorMessage(null);
    setModal({ kind: "trade", ticker, initialTab: "sell" });
  }

  function closeModal() {
    setModal(null);
  }

  function handleBuyConfirm(shares: number) {
    if (!tradeTarget) return;
    buyMutation.mutate(
      { ticker: tradeTarget.ticker, shares },
      {
        onSuccess: () => {
          setModal(null);
          setErrorMessage(null);
        },
        onError: (err) => {
          setErrorMessage(describeStocksError(err));
        },
      },
    );
  }

  function handleSellConfirm(shares: number) {
    if (!tradeTarget) return;
    sellMutation.mutate(
      { ticker: tradeTarget.ticker, shares },
      {
        onSuccess: () => {
          setModal(null);
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

  /* ── 렌더 ── */

  const heroDirection: Direction | null = selectedPrice
    ? priceDirection(selectedPrice.price, selectedPrice.prevPrice)
    : null;
  const heroChangeMod =
    heroDirection === "up"
      ? styles["chartPanel__heroChange--up"]
      : heroDirection === "down"
        ? styles["chartPanel__heroChange--down"]
        : "";

  const summaryDirection = profitDirection(portfolioSummary.totalPL);
  const summaryMod =
    summaryDirection === "up"
      ? styles["portfolio__metricBig--up"]
      : summaryDirection === "down"
        ? styles["portfolio__metricBig--down"]
        : "";

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "STOCK" },
        ]}
        title="주식"
        right={<Tag tone="gold">거래 가능</Tag>}
      />

      {/* ── 헤더 패널: 캐릭터 + 잔액 ── */}
      <Box variant="gold" className={styles.header}>
        <div className={styles.header__main}>
          <Eyebrow>{hasMainCharacter ? "메인 AGENT" : "캐릭터"}</Eyebrow>
          <div className={styles.header__codename}>
            {mainCharacter?.codename ?? "메인 AGENT 미등록"}
          </div>
        </div>
        <div className={styles.header__balance}>
          <Eyebrow>WALLET</Eyebrow>
          <div className={styles.header__balanceNum}>
            ¤ {balance.toLocaleString()}
          </div>
        </div>
        <div className={styles.header__status}>
          <Eyebrow>MARKET</Eyebrow>
          <div className={styles.header__statusText}>
            24시간 거래 · 즉시 체결
          </div>
        </div>
      </Box>

      {/* 메인 캐릭터 미등록 / 정합성 위반 안내 */}
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
              다시 확인하세요. 시세·차트는 열람만 가능합니다.
            </>
          )}
        </Box>
      ) : null}

      {/* 에러 배너 (mutation 실패) */}
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

      {/* ── 종목 리스트 + 차트 (좌우 2단; 모바일 위/아래) ── */}
      <div className={styles.layout}>
        {/* 좌 — 종목 카드 그리드 (sparkline 포함) */}
        <div className={styles.stockList}>
          <div className={styles.stockGrid}>
            {prices.items.map((item) => {
              const isActive = item.ticker === selectedTicker;
              const direction = priceDirection(item.price, item.prevPrice);
              const changeMod =
                direction === "up"
                  ? styles["stockCard__change--up"]
                  : direction === "down"
                    ? styles["stockCard__change--down"]
                    : "";
              const sparkPoints = sparklineByTicker.get(item.ticker) ?? [];
              return (
                <div
                  key={item.ticker}
                  className={[
                    styles.stockCard,
                    isActive ? styles["stockCard--active"] : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {/* P1-2: 카드 상단(정보) 영역 — 차트 선택 button. */}
                  <button
                    type="button"
                    className={styles.stockCard__select}
                    onClick={() => handleSelectTicker(item.ticker)}
                    aria-pressed={isActive}
                    aria-label={`${item.name} 차트 보기`}
                  >
                    <div className={styles.stockCard__head}>
                      <span className={styles.stockCard__ticker}>
                        {item.ticker}
                      </span>
                      <span className={styles.stockCard__name}>
                        {item.name}
                      </span>
                    </div>
                    {/* 미니 sparkline — 토스 톤 핵심. */}
                    <div className={styles.stockCard__sparkline}>
                      <StockSparkline
                        points={sparkPoints}
                        direction={direction}
                      />
                    </div>
                    <div className={styles.stockCard__priceRow}>
                      <span className={styles.stockCard__price}>
                        ¤ {item.price.toLocaleString()}
                      </span>
                      <span
                        className={[styles.stockCard__change, changeMod]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {ARROW[direction]} {item.changePercent.toFixed(2)}%
                      </span>
                    </div>
                    {item.eventText ? (
                      <div
                        className={styles.stockCard__event}
                        title={item.eventText}
                      >
                        {item.eventText}
                      </div>
                    ) : null}
                  </button>
                  {/* P1-2: 매수 button — 형제 노드로 분리. */}
                  <button
                    type="button"
                    className={styles.stockCard__buyBtn}
                    onClick={() => handleBuyClick(item.ticker)}
                    disabled={!canTrade}
                  >
                    {!hasMainCharacter ? "매수 불가" : "매수"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* 우 — 차트 패널 (Hero) */}
        <Box className={styles.chartPanel}>
          <div className={styles.chartPanel__head}>
            <div className={styles.chartPanel__title}>
              <span className={styles.chartPanel__ticker}>
                {selectedPrice?.ticker ?? selectedTicker}
              </span>
              <span className={styles.chartPanel__name}>
                {selectedPrice?.name ?? ""}
              </span>
              {selectedPrice ? (
                <div className={styles.chartPanel__hero}>
                  <span className={styles.chartPanel__heroPrice}>
                    ¤ {selectedPrice.price.toLocaleString()}
                  </span>
                  {heroDirection ? (
                    <span
                      className={[
                        styles.chartPanel__heroChange,
                        heroChangeMod,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {ARROW[heroDirection]}{" "}
                      {selectedPrice.changePercent.toFixed(2)}%
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className={styles.chartPanel__rangeSlot}>
              <RangeToggle value={range} onChange={setRange} />
            </div>
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

          {selectedPrice?.description ? (
            <div className={styles.chartPanel__description}>
              {selectedPrice.description}
            </div>
          ) : null}
        </Box>
      </div>

      {/* ── 보유 포지션 패널 ── */}
      {hasMainCharacter ? (
        <Box className={styles.holdingsPanel}>
          <PanelTitle
            right={
              <span className={styles.holdingsPanel__count}>
                {holdings.items.length} 종
              </span>
            }
          >
            MY PORTFOLIO
          </PanelTitle>

          {/* portfolio summary — 평가금/총손익/손익% (보유 1+ 일 때만) */}
          {holdings.items.length > 0 ? (
            <div className={styles.portfolio__summary}>
              <div className={styles.portfolio__metric}>
                <span className={styles.portfolio__metricLabel}>평가금</span>
                <span className={styles.portfolio__metricBig}>
                  ¤ {portfolioSummary.totalEval.toLocaleString()}
                </span>
              </div>
              <div className={styles.portfolio__metric}>
                <span className={styles.portfolio__metricLabel}>총 손익</span>
                <span
                  className={[styles.portfolio__metricBig, summaryMod]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {portfolioSummary.totalPL > 0 ? "+" : ""}¤{" "}
                  {portfolioSummary.totalPL.toLocaleString()}
                </span>
              </div>
              <div className={styles.portfolio__metric}>
                <span className={styles.portfolio__metricLabel}>손익%</span>
                <span
                  className={[styles.portfolio__metricBig, summaryMod]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {portfolioSummary.plPercent > 0 ? "+" : ""}
                  {portfolioSummary.plPercent.toFixed(2)}%
                </span>
              </div>
            </div>
          ) : null}

          {holdings.items.length === 0 ? (
            <div className={styles.empty}>보유 종목이 없습니다.</div>
          ) : (
            <div
              className={styles.holdingsTable}
              role="table"
              aria-label="보유 포지션 테이블"
            >
              <div
                className={`${styles.holdingsRow} ${styles["holdingsRow--head"]}`}
                role="row"
              >
                <span>종목</span>
                <span className={styles.holdingsRow__num}>보유</span>
                <span className={styles.holdingsRow__num}>평단</span>
                <span className={styles.holdingsRow__num}>현재가</span>
                <span className={styles.holdingsRow__num}>평가금</span>
                <span className={styles.holdingsRow__num}>손익</span>
                <span className={styles.holdingsRow__num}>손익%</span>
                <span />
              </div>
              {holdings.items.map((h) => {
                const dir = profitDirection(h.profitLoss);
                const profitMod =
                  dir === "up"
                    ? styles["holdingsRow__profit--up"]
                    : dir === "down"
                      ? styles["holdingsRow__profit--down"]
                      : "";
                return (
                  <div
                    key={h.ticker}
                    className={styles.holdingsRow}
                    role="row"
                  >
                    <span className={styles.holdingsRow__name}>
                      <span className={styles.holdingsRow__ticker}>
                        {h.ticker}
                      </span>
                      <span className={styles.holdingsRow__title}>
                        {h.name}
                      </span>
                    </span>
                    <span className={styles.holdingsRow__num}>
                      {h.shares.toLocaleString()}
                    </span>
                    <span className={styles.holdingsRow__num}>
                      ¤ {h.avgPrice.toLocaleString()}
                    </span>
                    <span className={styles.holdingsRow__num}>
                      ¤ {h.currentPrice.toLocaleString()}
                    </span>
                    <span className={styles.holdingsRow__num}>
                      ¤ {h.evaluation.toLocaleString()}
                    </span>
                    <span
                      className={[styles.holdingsRow__num, profitMod]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {h.profitLoss > 0 ? "+" : ""}
                      {h.profitLoss.toLocaleString()}
                    </span>
                    <span
                      className={[styles.holdingsRow__num, profitMod]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {h.profitPercent > 0 ? "+" : ""}
                      {h.profitPercent.toFixed(2)}%
                    </span>
                    <span className={styles.holdingsRow__action}>
                      <button
                        type="button"
                        className={styles.holdingsRow__sellBtn}
                        onClick={() => handleSellClick(h.ticker)}
                        disabled={!canTrade}
                      >
                        매도
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Box>
      ) : null}

      {/* ── 통합 매매 모달 ── */}
      {modal && tradeTarget ? (
        <StockTradeModal
          initialTab={modal.initialTab}
          ticker={tradeTarget.ticker}
          name={tradeTarget.name}
          description={tradeTarget.description}
          price={tradeTarget.price}
          balance={balance}
          holding={tradeHolding?.shares ?? 0}
          avgPrice={tradeHolding?.avgPrice ?? 0}
          isOpen={isMarketOpen}
          onClose={closeModal}
          onBuy={handleBuyConfirm}
          onSell={handleSellConfirm}
          buyPending={buyMutation.isPending}
          sellPending={sellMutation.isPending}
        />
      ) : null}
    </>
  );
}
