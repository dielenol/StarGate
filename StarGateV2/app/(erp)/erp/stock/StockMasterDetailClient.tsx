"use client";

/**
 * 주식 마스터-디테일 client (`/erp/stock`).
 *
 * 토스 desktop web 패턴: 한 화면에 좌(list 50%) + 우(detail 50%).
 *  - 행 클릭 시 우측 detail panel 만 갱신 (라우트 이동 X).
 *  - URL `?ticker=XXX` 양방향 동기화 (`router.replace`, `scroll: false`).
 *  - middle-click / cmd-click 은 native 새 탭 열기 보존.
 *  - 모바일 (≤1024px) 에서는 1-column stack — list 위 / detail 아래.
 *
 * detail panel 은 자체 scroll(`overflow-y: auto`) 을 가져 sticky CTA 가 panel
 * bottom 기준으로 고정. 모바일에서는 `max-height: none` 이라 sticky 가 viewport
 * 기준으로 떨어지며 자연 스크롤 — 그래도 의도된 동작.
 *
 * 진입 시 selectedTicker 결정 우선순위 — server (`initialDetailTicker`) 가
 * (1) URL `?ticker=` (catalog 검증 통과) (2) 보유 첫 (3) catalog 첫 순으로 결정해
 * 넘긴다. 잘못된 ticker 는 silent fallback (notFound 호출 X — 마스터-디테일에서
 * 404 어색).
 */

import { useCallback, useDeferredValue, useMemo, useState } from "react";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useCredits } from "@/hooks/queries/useCreditsQuery";
import {
  useBuyStock,
  useSellStock,
} from "@/hooks/mutations/useStocksMutation";
import {
  StocksApiError,
  type StockHoldingItem,
  type StockHoldingsResponse,
  type StockHistoryResponse,
  type StockPriceItem,
  type StockPricesResponse,
  type StockSparkline as StockSparklineDto,
  type StockSparklinesResponse,
  type StocksErrorCode,
  useStockHistory,
  useStockHoldings,
  useStockPrices,
  useStockSparklines,
} from "@/hooks/queries/useStocksQuery";

import Box from "@/components/ui/Box/Box";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PageHead from "@/components/ui/PageHead/PageHead";
import Tag from "@/components/ui/Tag/Tag";

import { findStockByTicker } from "@/lib/stocks/catalog";

import RangeToggle, {
  INITIAL_RANGE,
  RANGE_TO_DAYS,
  type RangeKey,
} from "./RangeToggle";
import { ChartSkeleton, type ChartPoint } from "./StockHistoryChart";
import StockSparkline from "./StockSparkline";
import StockTabs from "./StockTabs";

import styles from "./page.module.css";

/**
 * recharts 약 95KB(gzipped) 회피 — dynamic import + ssr:false.
 * Sheet 도 클릭 전엔 필요 없음 → dynamic.
 */
const StockHistoryChart = dynamic(() => import("./StockHistoryChart"), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});
const StockTradeSheet = dynamic(() => import("./StockTradeSheet"), {
  ssr: false,
});

/* ── 상수 ── */

const SPARKLINE_DAYS = 7;

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
  initialPrices: StockPricesResponse;
  initialSparklines: StockSparklinesResponse;
  initialHoldings: StockHoldingsResponse;
  initialBalance: number;
  /** server 가 결정한 detail panel 초기 ticker (URL ?ticker= 우선, 없으면 보유 첫 / catalog 첫). */
  initialDetailTicker: string;
  /** initialDetailTicker 의 INITIAL_RANGE(=1M) 시계열. 다른 ticker / range 는 client 에서 fetch. */
  initialDetailHistory: StockHistoryResponse;
  mainCharacter: { id: string; codename: string } | null;
  mainCharacterError: string | null;
}

/* ── 컴포넌트 ── */

export default function StockMasterDetailClient({
  initialPrices,
  initialSparklines,
  initialHoldings,
  initialBalance,
  initialDetailTicker,
  initialDetailHistory,
  mainCharacter,
  mainCharacterError,
}: Props) {
  /* 5. router */
  const router = useRouter();

  /* 6. 쿼리 — list + detail 모두 같은 캐시 공유. */
  const pricesQuery = useStockPrices({ initialData: initialPrices });
  const sparklinesQuery = useStockSparklines(SPARKLINE_DAYS, {
    initialData: initialSparklines,
  });
  const holdingsQuery = useStockHoldings({ initialData: initialHoldings });
  const creditsQuery = useCredits();

  const buyMutation = useBuyStock();
  const sellMutation = useSellStock();

  /* 10. 로컬 — 검색 / detail 선택 / range / sheet / mutation 에러 */
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [selectedTicker, setSelectedTicker] =
    useState<string>(initialDetailTicker);
  const [range, setRange] = useState<RangeKey>(INITIAL_RANGE);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /* 11. 파생 — 시세 / 보유 / 차트 데이터 */
  const days = RANGE_TO_DAYS[range];
  const historyQuery = useStockHistory(selectedTicker, {
    days,
    enabled: selectedTicker.length > 0,
    /**
     * server 시드는 initialDetailTicker + INITIAL_RANGE 일 때만 매칭.
     * 다른 ticker / range 는 fetch — useStockHistory queryKey 가 [stocks, history, ticker, days]
     * 라 ticker/days 변경 시 자동 새 query.
     */
    initialData:
      selectedTicker === initialDetailTicker && range === INITIAL_RANGE
        ? initialDetailHistory
        : undefined,
  });

  const prices = pricesQuery.data ?? initialPrices;
  const holdings = holdingsQuery.data ?? initialHoldings;
  const history = historyQuery.data ?? { items: [] };

  const balance = useMemo(() => {
    if (creditsQuery.data) return creditsQuery.data.balance;
    return initialBalance;
  }, [creditsQuery.data, initialBalance]);

  const sparklineByTicker = useMemo(() => {
    const map = new Map<string, StockSparklineDto["points"]>();
    if (sparklinesQuery.data) {
      for (const item of sparklinesQuery.data.items) {
        map.set(item.ticker, item.points);
      }
    }
    return map;
  }, [sparklinesQuery.data]);

  const filteredItems = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    if (!q) return prices.items;
    return prices.items.filter((item) => {
      return (
        item.ticker.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q)
      );
    });
  }, [prices.items, deferredSearch]);

  const currentPrice: StockPriceItem | undefined = useMemo(() => {
    return prices.items.find((p) => p.ticker === selectedTicker);
  }, [prices.items, selectedTicker]);

  const holding: StockHoldingItem | undefined = useMemo(() => {
    return holdings.items.find((h) => h.ticker === selectedTicker);
  }, [holdings.items, selectedTicker]);

  const selectedMeta = useMemo(() => {
    return findStockByTicker(selectedTicker);
  }, [selectedTicker]);

  const chartData: ChartPoint[] = useMemo(() => {
    return history.items.map((row) => ({
      ts: row.createdAt,
      price: row.price,
      eventText: row.eventText ?? "",
      source: row.source,
    }));
  }, [history.items]);

  const hasMainCharacter = mainCharacter !== null && !mainCharacterError;
  const isMarketOpen = true;
  const canTrade = hasMainCharacter && isMarketOpen;
  const sellDisabled = !canTrade || !holding || holding.shares === 0;

  /* 14. 핸들러 */

  /**
   * 행 click. modifier 키(cmd/ctrl) 또는 middle-click 이면 native 새 탭 열기 보존.
   * 일반 click 만 가로채 selectedTicker 갱신 + URL replace.
   */
  const handleSelect = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, ticker: string) => {
      if (
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey ||
        e.button !== 0
      ) {
        return;
      }
      e.preventDefault();
      if (ticker === selectedTicker) return;
      setSelectedTicker(ticker);
      setRange(INITIAL_RANGE);
      setErrorMessage(null);
      router.replace(`/erp/stock?ticker=${encodeURIComponent(ticker)}`, {
        scroll: false,
      });
    },
    [router, selectedTicker],
  );

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
      { ticker: selectedTicker, shares },
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
      { ticker: selectedTicker, shares },
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

  /* ── Hero 표시값 ── */

  // currentPrice 가 없으면 catalog meta basePrice fallback (시세 fetch 실패 등).
  const displayPrice = currentPrice?.price ?? selectedMeta?.basePrice ?? 0;
  const displayPrevPrice =
    currentPrice?.prevPrice ?? selectedMeta?.basePrice ?? 0;
  const heroDirection = priceDirection(displayPrice, displayPrevPrice);
  const heroChangeMod =
    heroDirection === "up"
      ? styles["detailHero__change--up"]
      : heroDirection === "down"
        ? styles["detailHero__change--down"]
        : "";
  const changePercent = currentPrice?.changePercent ?? 0;

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
          { label: "STOCK" },
        ]}
        title="주식"
        right={<Tag tone="gold">거래 가능</Tag>}
      />

      <StockTabs />

      {/* ── 헤더 카드: 캐릭터 + 잔액 + 마켓 ── */}
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
              다시 확인하세요. 시세·차트는 열람만 가능합니다.
            </>
          )}
        </Box>
      ) : null}

      {/* mutation 에러 배너 — detail 영역 외 (전역) */}
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

      {/* ── master-detail layout ── */}
      <div className={styles.layout}>
        {/* ── 좌: list panel ── */}
        <div className={styles.listPanel}>
          {/* 검색 */}
          <div className={styles.searchBar}>
            <label htmlFor="stock-search" className={styles.searchBar__label}>
              <Eyebrow>SEARCH</Eyebrow>
            </label>
            <input
              id="stock-search"
              type="search"
              inputMode="search"
              className={styles.searchBar__input}
              placeholder="ticker 또는 종목명 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {prices.items.length === 0 ? (
            <Box className={styles.empty}>
              종목 카탈로그가 비어 있습니다. 운영자(GM)에게 문의하세요.
            </Box>
          ) : filteredItems.length === 0 ? (
            <Box className={styles.empty}>
              검색 결과가 없습니다 — &ldquo;{deferredSearch}&rdquo;
            </Box>
          ) : (
            <ul className={styles.stockList}>
              {filteredItems.map((item) => {
                const direction = priceDirection(item.price, item.prevPrice);
                const changeMod =
                  direction === "up"
                    ? styles["stockRow__change--up"]
                    : direction === "down"
                      ? styles["stockRow__change--down"]
                      : "";
                const sparkPoints = sparklineByTicker.get(item.ticker) ?? [];
                const isActive = item.ticker === selectedTicker;
                return (
                  <li key={item.ticker} className={styles.stockList__item}>
                    <Link
                      href={`/erp/stock?ticker=${encodeURIComponent(item.ticker)}`}
                      className={[
                        styles.stockRow,
                        isActive ? styles["stockRow--active"] : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      aria-label={`${item.name} ${item.ticker} 상세 보기`}
                      aria-current={isActive ? "true" : undefined}
                      onClick={(e) => handleSelect(e, item.ticker)}
                    >
                      <div className={styles.stockRow__left}>
                        <span className={styles.stockRow__ticker}>
                          {item.ticker}
                        </span>
                        <span className={styles.stockRow__name}>
                          {item.name}
                        </span>
                      </div>
                      <div className={styles.stockRow__sparkline}>
                        <StockSparkline
                          points={sparkPoints}
                          direction={direction}
                          height={36}
                        />
                      </div>
                      <div className={styles.stockRow__right}>
                        <span className={styles.stockRow__price}>
                          ¤ {item.price.toLocaleString()}
                        </span>
                        <span
                          className={[styles.stockRow__change, changeMod]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {ARROW[direction]} {item.changePercent.toFixed(2)}%
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ── 우: detail panel ── */}
        <div className={styles.detailPanel}>
          {!selectedMeta ? (
            <Box className={styles.empty}>
              종목을 선택하세요.
            </Box>
          ) : (
            <>
              {/* Hero — 큰 가격 + 변동 칩 */}
              <div className={styles.detailHero}>
                <div className={styles.detailHero__head}>
                  <span className={styles.detailHero__ticker}>
                    {selectedMeta.ticker}
                  </span>
                  <span className={styles.detailHero__name}>
                    {selectedMeta.name}
                  </span>
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
                {selectedMeta.description ? (
                  <div className={styles.detailHero__description}>
                    {selectedMeta.description}
                  </div>
                ) : null}
              </div>

              {/* 차트 패널 */}
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

              {/* 종목 정보 */}
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
                    ¤ {selectedMeta.basePrice.toLocaleString()}
                  </span>
                </div>
                <div className={styles.detailInfo__cell}>
                  <span className={styles.detailInfo__label}>이벤트</span>
                  <span className={styles.detailInfo__valueNote}>
                    {currentPrice?.eventText || "—"}
                  </span>
                </div>
              </div>

              {/* 보유 정보 (메인 캐릭터 + 보유 ≥ 1 일 때만) */}
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

              {/* sticky CTA — panel 하단 고정 (panel scroll 기준) */}
              {hasMainCharacter ? (
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
              ) : (
                <Box className={styles.detailDisabled}>
                  거래 불가 — 메인 AGENT 캐릭터 등록 후 다시 시도하세요.
                </Box>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── 풀스크린 매매 시트 ── */}
      {sheet && selectedMeta ? (
        <StockTradeSheet
          isOpen={true}
          initialTab={sheet.initialTab}
          ticker={selectedMeta.ticker}
          name={selectedMeta.name}
          description={selectedMeta.description}
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
