"use client";

/**
 * 종목 매수/매도 client (`/erp/stock/[ticker]`).
 *
 * 풀페이지 트레이딩 뷰. 좌측 main 에 헤더(가격) + 차트 + 시세 테이블 + 종목 정보 스택,
 * 우측 rail 에 잔고 + 매수/매도 폼 + 보유 종목 + 주문 내역 스택. rail 은 desktop 에서 sticky.
 *
 * 매수/매도 mutation 성공 시:
 *  - mutation hook 내부에서 stocksKeys.prices/holdings + creditKeys.all invalidate.
 *  - 이 컴포넌트는 query refetch 결과로 자연 갱신 — router.refresh() 호출 X.
 *
 * 다른 종목으로 이동: 우측 rail 의 보유 종목 mini list 클릭 → `/erp/stock/[새ticker]` push.
 */

import { Fragment, useMemo, useRef, useState } from "react";

import dynamic from "next/dynamic";
import Link from "next/link";

import LinkPendingProbe from "@/components/erp/NavPending/LinkPendingProbe";
import { useCredits } from "@/hooks/queries/useCreditsQuery";
import {
  useBuyStock,
  useSellStock,
} from "@/hooks/mutations/useStocksMutation";
import {
  type StockHistoryResponse,
  type StockHoldingItem,
  type StockHoldingsResponse,
  type StockPriceItem,
  type StockPricesResponse,
  useStockHistory,
  useStockHoldings,
  useStockPrices,
} from "@/hooks/queries/useStocksQuery";

import { IconCaution, IconSuccess } from "@/components/icons";
import Box from "@/components/ui/Box/Box";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PageHead from "@/components/ui/PageHead/PageHead";

import { resolvePublicAssetPath } from "@/lib/asset-path";
import { findStockByTicker } from "@/lib/stocks/catalog";
import { buildStockMarketIndexSnapshot } from "@/lib/stocks/market-index";
import {
  formatStockValue,
  roundStockValue,
} from "@/lib/stocks/pricing";

import RangeToggle, {
  INITIAL_RANGE,
  RANGE_TO_DAYS,
  type RangeKey,
} from "../RangeToggle";
import StockIndexBanner from "../StockIndexBanner";
import { ChartSkeleton, type ChartPoint } from "../StockHistoryChart";
import StockTabs from "../StockTabs";
import WatchlistRailCard from "../WatchlistRailCard";
import { StockLogo } from "../_logos";
import {
  ARROW,
  type Direction,
  describeStocksError,
  priceDirection,
  profitDirection,
} from "../_helpers";
import {
  evaluateStockAlert,
  hasStockAlertRule,
  useStockAlertRules,
} from "../useStockAlerts";
import { useStockWatchlist } from "../useStockWatchlist";
import StockInfoPanel from "./StockInfoPanel";

import sharedStyles from "../page.module.css";
import styles from "./page.module.css";

/**
 * recharts 약 95KB(gzipped) 회피 — dynamic import + ssr:false.
 */
const StockHistoryChart = dynamic(() => import("../StockHistoryChart"), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

/* ── 상수 ── */

/** 시세 테이블 노출 행 수 — 최근부터. */
const HISTORY_TABLE_LIMIT = 10;
/** 서버 buy/sell 라우트와 동일한 1회 주문 수량 한도. */
const MAX_ORDER_SHARES = 50;
/** 빠른 비율 칩 — 매수 모드: 잔액 기준 / 매도 모드: 보유 기준 비율 (1=최대). */
const QUICK_RATIOS: Array<{ label: string; ratio: number }> = [
  { label: "10%", ratio: 0.1 },
  { label: "25%", ratio: 0.25 },
  { label: "50%", ratio: 0.5 },
  { label: "최대", ratio: 1 },
];
const TRADE_SUCCESS_SOUNDS = {
  buy: {
    src: resolvePublicAssetPath("/sound/stocks/stock-buy-success.mp3"),
    volume: 0.34,
  },
  sell: {
    src: resolvePublicAssetPath("/sound/stocks/stock-sell-success.mp3"),
    volume: 0.26,
  },
} as const;

type TradeTab = "buy" | "sell";

function eventSourceLabel(source: ChartPoint["source"]): string {
  if (source === "gm-event") return "GM 공시";
  if (source === "trade") return "체결";
  return "정기 변동";
}

/* ── Props ── */

interface Props {
  ticker: string;
  initialPrices: StockPricesResponse;
  initialHoldings: StockHoldingsResponse;
  initialBalance: number;
  initialHistory: StockHistoryResponse;
  mainCharacter: { id: string; codename: string } | null;
  mainCharacterError: string | null;
  marketEnabled: boolean;
}

/* ── 컴포넌트 ── */

export default function StockTradeClient({
  ticker,
  initialPrices,
  initialHoldings,
  initialBalance,
  initialHistory,
  mainCharacter,
  mainCharacterError,
  marketEnabled,
}: Props) {
  /* 6. 쿼리 */
  const pricesQuery = useStockPrices({ initialData: initialPrices });
  const holdingsQuery = useStockHoldings({ initialData: initialHoldings });
  const creditsQuery = useCredits();
  const watchlist = useStockWatchlist();
  const alertRules = useStockAlertRules();

  const buyMutation = useBuyStock();
  const sellMutation = useSellStock();

  /* 10. 로컬 — range / 매수폼 / mutation 에러 */
  const [range, setRange] = useState<RangeKey>(INITIAL_RANGE);
  const [tradeTab, setTradeTab] = useState<TradeTab>("buy");
  /**
   * 수량 input — 빈 문자열 허용해 자유 입력 (NaN 회피). submit 시 parseInt + 검증.
   */
  const [qtyInput, setQtyInput] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const buySuccessAudioRef = useRef<HTMLAudioElement | null>(null);
  const sellSuccessAudioRef = useRef<HTMLAudioElement | null>(null);

  /* 11. 파생 — 시세 / 보유 / 차트 데이터 */
  const days = RANGE_TO_DAYS[range];
  const historyQuery = useStockHistory(ticker, {
    days,
    enabled: true,
    /**
     * server 시드는 INITIAL_RANGE 일 때만 매칭. 다른 range 는 클라이언트 fetch.
     */
    initialData: range === INITIAL_RANGE ? initialHistory : undefined,
  });

  const prices = pricesQuery.data ?? initialPrices;
  const holdings = holdingsQuery.data ?? initialHoldings;
  const history = historyQuery.data ?? { items: [] };

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

  const meta = useMemo(() => findStockByTicker(ticker), [ticker]);

  const watchedTickerSet = useMemo(() => {
    return new Set(watchlist.tickers);
  }, [watchlist.tickers]);

  const watchedItems = useMemo(() => {
    return prices.items.filter((item) => watchedTickerSet.has(item.ticker));
  }, [prices.items, watchedTickerSet]);

  const marketIndex = useMemo(() => {
    return buildStockMarketIndexSnapshot(prices.items);
  }, [prices.items]);

  const chartData: ChartPoint[] = useMemo(() => {
    return history.items.map((row) => ({
      ts: row.createdAt,
      price: row.price,
      eventText: row.eventText ?? "",
      source: row.source,
    }));
  }, [history.items]);

  const hasMainCharacter = mainCharacter !== null && !mainCharacterError;
  const isMarketOpen = marketEnabled;
  const isPriceSeeded = currentPrice?.isSeeded ?? false;
  const canTrade = hasMainCharacter && isMarketOpen && isPriceSeeded;
  const sellDisabled = !canTrade || !holding || holding.shares === 0;

  /* ── Hero 표시값 ── */

  // currentPrice 가 없으면 catalog meta basePrice fallback (시세 fetch 실패 등).
  const displayPrice = currentPrice?.price ?? meta?.basePrice ?? 0;
  const displayPrevPrice = currentPrice?.prevPrice ?? meta?.basePrice ?? 0;
  const heroDirection = priceDirection(displayPrice, displayPrevPrice);
  const heroChangeMod =
    heroDirection === "up"
      ? sharedStyles["detailHero__change--up"]
      : heroDirection === "down"
        ? sharedStyles["detailHero__change--down"]
        : "";
  const changePercent = currentPrice?.changePercent ?? 0;

  const holdingDir = holding ? profitDirection(holding.profitLoss) : "flat";
  const holdingMod =
    holdingDir === "up"
      ? sharedStyles["detailHolding__value--up"]
      : holdingDir === "down"
        ? sharedStyles["detailHolding__value--down"]
        : "";

  /* ── Trade 폼 파생값 ── */

  /** 사용자가 입력한 수량 — 비어있거나 부적합한 값이면 0. */
  const tradeShares = useMemo(() => {
    const n = Number.parseInt(qtyInput, 10);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.floor(n);
  }, [qtyInput]);

  const tradeTotal = roundStockValue(tradeShares * displayPrice);
  const heldShares = holding?.shares ?? 0;
  const heldAvgPrice = holding?.avgPrice ?? 0;
  const portfolioEvaluation = useMemo(() => {
    return roundStockValue(
      holdings.items.reduce((sum, item) => sum + item.evaluation, 0),
    );
  }, [holdings.items]);

  const isBuyPending = buyMutation.isPending;
  const isSellPending = sellMutation.isPending;
  const isTradePending = isBuyPending || isSellPending;

  /**
   * 매도 탭 선택 후 보유가 0 으로 떨어지면 매수 탭으로 자동 폴백 — derive 패턴.
   */
  const effectiveTab: TradeTab =
    tradeTab === "sell" && heldShares === 0 ? "buy" : tradeTab;

  const insufficientBalance = effectiveTab === "buy" && tradeTotal > balance;
  const insufficientShares =
    effectiveTab === "sell" && tradeShares > heldShares;
  const exceedsMaxShares = tradeShares > MAX_ORDER_SHARES;

  const buyDisabled =
    !canTrade ||
    tradeShares <= 0 ||
    exceedsMaxShares ||
    insufficientBalance ||
    isTradePending ||
    displayPrice <= 0;
  const submitDisabled =
    effectiveTab === "buy"
      ? buyDisabled
      : sellDisabled ||
        tradeShares <= 0 ||
        exceedsMaxShares ||
        insufficientShares ||
        isTradePending;

  const tradeProjection = useMemo(() => {
    if (tradeShares <= 0 || displayPrice <= 0) return null;
    const currentTickerEvaluation = roundStockValue(heldShares * displayPrice);
    if (effectiveTab === "buy") {
      const currentCost = roundStockValue(heldAvgPrice * heldShares);
      const projectedShares = heldShares + tradeShares;
      const projectedAvgPrice =
        projectedShares > 0
          ? roundStockValue((currentCost + tradeTotal) / projectedShares)
          : displayPrice;
      const projectedTickerEvaluation = roundStockValue(
        projectedShares * displayPrice,
      );
      const projectedPortfolioEvaluation = roundStockValue(
        portfolioEvaluation + tradeTotal,
      );
      return {
        kind: "buy" as const,
        projectedShares,
        projectedAvgPrice,
        projectedBalance: roundStockValue(balance - tradeTotal),
        projectedExposurePercent:
          projectedPortfolioEvaluation > 0
            ? (projectedTickerEvaluation / projectedPortfolioEvaluation) * 100
            : 0,
      };
    }

    const projectedShares = Math.max(0, heldShares - tradeShares);
    const projectedTickerEvaluation = roundStockValue(
      projectedShares * displayPrice,
    );
    const projectedPortfolioEvaluation = Math.max(
      0,
      roundStockValue(portfolioEvaluation - Math.min(currentTickerEvaluation, tradeTotal)),
    );
    return {
      kind: "sell" as const,
      projectedShares,
      projectedBalance: roundStockValue(balance + tradeTotal),
      realizedProfit: roundStockValue((displayPrice - heldAvgPrice) * tradeShares),
      projectedExposurePercent:
        projectedPortfolioEvaluation > 0
          ? (projectedTickerEvaluation / projectedPortfolioEvaluation) * 100
          : 0,
    };
  }, [
    balance,
    displayPrice,
    effectiveTab,
    heldAvgPrice,
    heldShares,
    portfolioEvaluation,
    tradeShares,
    tradeTotal,
  ]);

  const avgGapPercent =
    heldAvgPrice > 0 ? ((displayPrice - heldAvgPrice) / heldAvgPrice) * 100 : null;

  const eventTimeline = useMemo(() => {
    return [...history.items]
      .filter((row) => row.eventText?.trim())
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 6)
      .map((row) => {
        const direction = priceDirection(row.price, row.prevPrice);
        const changePercent =
          row.prevPrice > 0 ? ((row.price - row.prevPrice) / row.prevPrice) * 100 : 0;
        return {
          ts: row.createdAt,
          price: row.price,
          direction,
          changePercent,
          eventText: row.eventText?.trim() ?? "",
          source: row.source,
        };
      });
  }, [history.items]);

  const latestDownEvent = eventTimeline.find((item) => item.direction === "down");
  const latestUpEvent = eventTimeline.find((item) => item.direction === "up");
  const gmEventCount = eventTimeline.filter((item) => item.source === "gm-event").length;
  const alertRule = alertRules.getRule(ticker);
  const activeAlertReasons = currentPrice
    ? evaluateStockAlert(alertRule, currentPrice)
    : [];

  /* ── 핸들러 ── */

  function parseOptionalPositive(value: string): number | undefined {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
    return parsed;
  }

  function updateAlertRule(nextRule: Parameters<typeof alertRules.setRule>[1]) {
    alertRules.setRule(ticker, nextRule);
  }

  /** 빠른 비율 적용 — 매수: floor(balance×ratio / price). 매도: floor(held × ratio). */
  function applyQuickRatio(ratio: number) {
    if (effectiveTab === "buy") {
      if (displayPrice <= 0) return;
      const max = Math.floor(balance / displayPrice);
      const next = Math.min(
        MAX_ORDER_SHARES,
        Math.max(0, Math.floor(max * ratio)),
      );
      setQtyInput(next > 0 ? String(next) : "");
    } else {
      const next = Math.min(
        MAX_ORDER_SHARES,
        Math.max(0, Math.floor(heldShares * ratio)),
      );
      setQtyInput(next > 0 ? String(next) : "");
    }
  }

  function adjustQty(delta: number) {
    const next = Math.min(MAX_ORDER_SHARES, Math.max(0, tradeShares + delta));
    setQtyInput(next > 0 ? String(next) : "");
  }

  function getTradeSuccessAudio(tab: TradeTab): HTMLAudioElement {
    const ref = tab === "buy" ? buySuccessAudioRef : sellSuccessAudioRef;
    const config = TRADE_SUCCESS_SOUNDS[tab];

    if (!ref.current) {
      const audio = new Audio(config.src);
      audio.preload = "auto";
      ref.current = audio;
    }

    ref.current.volume = config.volume;
    return ref.current;
  }

  function playTradeSuccessSound(tab: TradeTab) {
    try {
      const audio = getTradeSuccessAudio(tab);
      audio.pause();
      audio.currentTime = 0;
      void audio.play().catch(() => {});
    } catch {
      // Ignore playback errors (browser autoplay policy, unsupported codec, etc.)
    }
  }

  function handleTradeSubmit() {
    if (submitDisabled) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    const mutation = effectiveTab === "buy" ? buyMutation : sellMutation;
    const soundTab = effectiveTab;
    const submittedShares = tradeShares;
    const action = effectiveTab === "buy" ? "매수" : "매도";
    mutation.mutate(
      { ticker, shares: submittedShares },
      {
        onSuccess: (result) => {
          setQtyInput("");
          setErrorMessage(null);
          playTradeSuccessSound(soundTab);
          const total =
            "purchase" in result
              ? result.purchase.totalCost
              : result.sale.totalProceeds;
          const formattedTotal = formatStockValue(total);
          setSuccessMessage(
            `✓ ${submittedShares.toLocaleString()}주 ${action} 완료 · ¤ ${formattedTotal}`,
          );
          // 3 초 후 자동 dismiss — useEffect 없이 setTimeout 으로 단순 처리.
          window.setTimeout(() => {
            setSuccessMessage((curr) =>
              curr ===
              `✓ ${submittedShares.toLocaleString()}주 ${action} 완료 · ¤ ${formattedTotal}`
                ? null
                : curr,
            );
          }, 3000);
        },
        onError: (err) => {
          setErrorMessage(describeStocksError(err));
        },
      },
    );
  }

  /* ── 시세 테이블 데이터 — history.items 내림차순 → 등락률 계산 → 상위 N ── */

  const historyRows = useMemo(() => {
    const sorted = [...history.items].sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    const limited = sorted.slice(0, HISTORY_TABLE_LIMIT);
    return limited.map((row, i) => {
      const olderRow = limited[i + 1];
      const prev = olderRow?.price ?? null;
      const dir: Direction =
        prev === null ? "flat" : priceDirection(row.price, prev);
      const changePct =
        prev !== null && prev > 0 ? ((row.price - prev) / prev) * 100 : null;
      return {
        ts: row.createdAt,
        price: row.price,
        direction: dir,
        changePct,
        eventReason:
          dir === "down" && row.eventText?.trim() ? row.eventText.trim() : "",
      };
    });
  }, [history.items]);

  const stockTransactions = useMemo(() => {
    const rows = creditsQuery.data?.transactions ?? [];
    return rows
      .filter((tx) => {
        if (tx.type !== "STOCK_BUY" && tx.type !== "STOCK_SELL") return false;
        return tx.metadata?.ticker === ticker;
      })
      .slice(0, 5);
  }, [creditsQuery.data?.transactions, ticker]);

  if (!meta) {
    // server 가 notFound() 처리해 도달 불가 — defensive.
    return null;
  }

  return (
    <div data-pixel-font="ui">
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "STOCK", href: "/erp/stock" },
          { label: meta.ticker },
        ]}
        title={`${meta.name} ${meta.ticker}`}
      />

      <StockIndexBanner marketIndex={marketIndex} />

      <div className={sharedStyles.tabsRow}>
        <StockTabs />
      </div>

      <Link href="/erp/stock" className={styles.backLink}>
        <LinkPendingProbe />
        <span className={styles.backLink__arrow} aria-hidden="true">
          ←
        </span>
        종목 목록
      </Link>

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

      {hasMainCharacter && !isPriceSeeded ? (
        <Box className={styles.notice}>
          이 종목은 아직 운영 시세가 등록되지 않아 거래할 수 없습니다. 표시 가격은
          카탈로그 기준가입니다.
        </Box>
      ) : null}

      {hasMainCharacter && isPriceSeeded && !isMarketOpen ? (
        <Box className={styles.notice}>
          현재 주식 거래가 일시 중지되어 있습니다. 시세와 보유 내역은 계속
          조회할 수 있습니다.
        </Box>
      ) : null}

      {errorMessage ? (
        <div
          className={styles.errorToastOverlay}
          role="alert"
          aria-live="assertive"
        >
          <div className={styles.errorToast}>
            <IconCaution className={styles.errorToast__icon} aria-hidden />
            <div className={styles.errorToast__body}>{errorMessage}</div>
            <button
              type="button"
              className={styles.errorToast__dismiss}
              onClick={() => setErrorMessage(null)}
              aria-label="에러 메시지 닫기"
            >
              ✕
            </button>
          </div>
        </div>
      ) : null}

      {successMessage ? (
        <div
          className={styles.successToastOverlay}
          role="status"
          aria-live="polite"
        >
          <div className={styles.successToast}>
            <IconSuccess className={styles.successToast__icon} aria-hidden />
            <div className={styles.successToast__body}>{successMessage}</div>
            <button
              type="button"
              className={styles.successToast__dismiss}
              onClick={() => setSuccessMessage(null)}
              aria-label="알림 닫기"
            >
              ✕
            </button>
          </div>
        </div>
      ) : null}

      <div className={styles.layout}>
        {/* ── 좌측 main: 헤더 → 차트 → 시세 → 종목 정보 ── */}
        <div className={styles.main}>
          {/* Hero — 로고 + ticker · 분류 · 거래소 + 큰 가격 + 변동 칩 + 설명 */}
          <div className={sharedStyles.detailHero}>
            <div className={sharedStyles.detailHero__head}>
              <StockLogo
                ticker={meta.ticker}
                size="lg"
                className={sharedStyles.detailHero__logo}
              />
              <div className={sharedStyles.detailHero__headText}>
                <span className={sharedStyles.detailHero__ticker}>
                  {meta.ticker}
                </span>
                <span className={sharedStyles.detailHero__name}>
                  {meta.name}
                </span>
              </div>
              <button
                type="button"
                className={[
                  sharedStyles.detailHero__watch,
                  watchlist.isWatched(meta.ticker)
                    ? sharedStyles["detailHero__watch--active"]
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => watchlist.toggle(meta.ticker)}
                aria-label={`${meta.name} 관심종목 ${
                  watchlist.isWatched(meta.ticker) ? "해제" : "추가"
                }`}
                title={
                  watchlist.isWatched(meta.ticker)
                    ? "관심종목 해제"
                    : "관심종목 추가"
                }
              >
                {watchlist.isWatched(meta.ticker) ? "★" : "☆"}
              </button>
            </div>
            <div className={sharedStyles.detailHero__meta}>
              <span>국내</span>
              <span className={sharedStyles.detailHero__metaDot}>·</span>
              <span>NOVUS-EX</span>
            </div>
            <div className={sharedStyles.detailHero__priceRow}>
              <span className={sharedStyles.detailHero__price}>
                ¤ {formatStockValue(displayPrice)}
              </span>
              <span
                className={[sharedStyles.detailHero__change, heroChangeMod]
                  .filter(Boolean)
                  .join(" ")}
              >
                {ARROW[heroDirection]} {changePercent.toFixed(2)}%
              </span>
            </div>
            {meta.description ? (
              <div className={sharedStyles.detailHero__description}>
                {meta.description}
              </div>
            ) : null}
          </div>

          {/* 차트 카드 */}
          <div className={sharedStyles.chartPanel}>
            <div className={sharedStyles.chartPanel__head}>
              <span className={sharedStyles.chartPanel__title}>차트</span>
              <RangeToggle value={range} onChange={setRange} />
            </div>

            {chartData.length === 0 ? (
              <div className={sharedStyles.chartPanel__placeholder}>
                <div className={sharedStyles.chartPanel__placeholderTitle}>
                  준비 중인 차트
                </div>
                <div className={sharedStyles.chartPanel__placeholderHint}>
                  히스토리 없음 — 첫 매매 또는 GM 개입 후 기록됩니다.
                </div>
              </div>
            ) : (
              <StockHistoryChart
                data={chartData}
                averagePrice={holding?.avgPrice}
                basePrice={meta.basePrice}
              />
            )}
            </div>

            {/* 토스 종목 정보 패널 — 회사 설명/KV/매출 도넛/주요 사업 */}
            <StockInfoPanel
              ticker={meta.ticker}
              currentPrice={displayPrice}
              basePrice={meta.basePrice}
            />

          <div className={sharedStyles.eventInsights}>
            <div className={sharedStyles.eventInsights__head}>
              <span className={sharedStyles.eventInsights__title}>
                변동 사유 분석
              </span>
              <span className={sharedStyles.eventInsights__tag}>
                최근 {eventTimeline.length}건
              </span>
            </div>
            <div className={sharedStyles.eventInsights__summary}>
              <div className={sharedStyles.eventInsights__metric}>
                <span>최근 하락 요인</span>
                <strong>{latestDownEvent?.eventText ?? "기록 없음"}</strong>
              </div>
              <div className={sharedStyles.eventInsights__metric}>
                <span>최근 상승 요인</span>
                <strong>{latestUpEvent?.eventText ?? "기록 없음"}</strong>
              </div>
              <div className={sharedStyles.eventInsights__metric}>
                <span>GM 개입</span>
                <strong>{gmEventCount}건</strong>
              </div>
            </div>
            {eventTimeline.length === 0 ? (
              <div className={sharedStyles.eventInsights__empty}>
                최근 이벤트 공시가 없습니다.
              </div>
            ) : (
              <ul className={sharedStyles.eventInsights__list}>
                {eventTimeline.map((item, index) => {
                  const eventDate = new Date(item.ts);
                  const eventDateLabel = Number.isFinite(eventDate.getTime())
                    ? eventDate.toLocaleString("ko-KR", {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })
                    : "—";
                  const eventMod =
                    item.direction === "up"
                      ? sharedStyles["eventInsights__move--up"]
                      : item.direction === "down"
                        ? sharedStyles["eventInsights__move--down"]
                        : "";
                  return (
                    <li
                      key={`${item.ts}-${index}`}
                      className={sharedStyles.eventInsights__item}
                    >
                      <div className={sharedStyles.eventInsights__itemTop}>
                        <span>{eventDateLabel}</span>
                        <strong className={eventMod}>
                          {ARROW[item.direction]}{" "}
                          {item.changePercent.toFixed(2)}%
                        </strong>
                      </div>
                      <div className={sharedStyles.eventInsights__body}>
                        {item.eventText}
                      </div>
                      <div className={sharedStyles.eventInsights__source}>
                        {eventSourceLabel(item.source)} · ¤{" "}
                        {formatStockValue(item.price)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

            {/* 시세 테이블 — history.items 시계열 (최근 N).
              거래량 컬럼은 데이터 부재로 제거. 변동없는 행은 muted 처리해 시각 노이즈 축소. */}
          <div className={sharedStyles.historyTable}>
            <div className={sharedStyles.historyTable__head}>
              <span className={sharedStyles.historyTable__title}>
                시세 <span className={sharedStyles.historyTable__tag}>· 최근 {historyRows.length}건</span>
              </span>
            </div>
            {historyRows.length === 0 ? (
              <div className={sharedStyles.historyTable__empty}>
                시세 기록이 없습니다.
              </div>
            ) : (
              <div
                className={sharedStyles.historyTable__grid}
                role="table"
                aria-label="시계열 시세"
              >
                <span className={sharedStyles.historyTable__cellHead}>
                  일시
                </span>
                <span className={sharedStyles.historyTable__cellHead}>
                  종가
                </span>
                <span className={sharedStyles.historyTable__cellHead}>
                  등락률
                </span>
                {historyRows.map((row, index) => {
                  const isFlat =
                    row.direction === "flat" || row.changePct === 0;
                  const dirMod =
                    row.direction === "up"
                      ? sharedStyles["historyTable__cell--up"]
                      : row.direction === "down"
                        ? sharedStyles["historyTable__cell--down"]
                        : sharedStyles["historyTable__cell--muted"];
                  const date = new Date(row.ts);
                  const dateLabel = Number.isFinite(date.getTime())
                    ? date.toLocaleString("ko-KR", {
                        year: "2-digit",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })
                    : "—";
                  return (
                    <Fragment key={`${row.ts}-${index}`}>
                      <span className={sharedStyles.historyTable__cell}>
                        {dateLabel}
                      </span>
                      <span className={sharedStyles.historyTable__cell}>
                        ¤ {formatStockValue(row.price)}
                      </span>
                      <span
                        className={[
                          sharedStyles.historyTable__cell,
                          dirMod,
                          row.eventReason
                            ? sharedStyles["historyTable__cell--withReason"]
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <span>
                          {row.changePct === null
                            ? "—"
                            : isFlat
                              ? "—"
                              : `${ARROW[row.direction]} ${row.changePct.toFixed(2)}%`}
                        </span>
                        {row.eventReason ? (
                          <span className={sharedStyles.historyTable__reason}>
                            사유 · {row.eventReason}
                          </span>
                        ) : null}
                      </span>
                    </Fragment>
                  );
                })}
              </div>
            )}
          </div>

          {/* 종목 정보 카드 (현재가/기준가/이벤트) */}
          <div className={sharedStyles.detailInfo}>
            <div className={sharedStyles.detailInfo__head}>
              <span className={sharedStyles.detailInfo__title}>종목 정보</span>
            </div>
            <div className={sharedStyles.detailInfo__grid}>
              <div className={sharedStyles.detailInfo__cell}>
                <span className={sharedStyles.detailInfo__label}>현재가</span>
                <span className={sharedStyles.detailInfo__value}>
                  ¤ {formatStockValue(displayPrice)}
                </span>
              </div>
              <div className={sharedStyles.detailInfo__cell}>
                <span className={sharedStyles.detailInfo__label}>기준가</span>
                <span className={sharedStyles.detailInfo__value}>
                  ¤ {formatStockValue(meta.basePrice)}
                </span>
              </div>
              <div className={sharedStyles.detailInfo__cell}>
                <span className={sharedStyles.detailInfo__label}>이벤트</span>
                <span className={sharedStyles.detailInfo__valueNote}>
                  {currentPrice?.eventText || "—"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── 우측 rail: 잔고 → 매수폼 → 보유 → 주문내역 ── */}
        <aside className={styles.rail} aria-label="자산 사이드바">
          <div className={sharedStyles.walletCard}>
            <Eyebrow>WALLET</Eyebrow>
            <div className={sharedStyles.walletCard__amount}>
              ¤ {formatStockValue(balance)}
            </div>
            {hasMainCharacter ? (
              <div className={sharedStyles.walletCard__agent}>
                <span className={sharedStyles.walletCard__agentLabel}>
                  AGENT
                </span>
                <span className={sharedStyles.walletCard__agentName}>
                  {mainCharacter.codename}
                </span>
              </div>
            ) : null}
          </div>

          <div className={sharedStyles.alertRules}>
            <div className={sharedStyles.alertRules__head}>
              <span>조건 알림</span>
              <button
                type="button"
                onClick={() => alertRules.clearRule(ticker)}
                disabled={!hasStockAlertRule(alertRule)}
              >
                초기화
              </button>
            </div>
            <label className={sharedStyles.alertRules__field}>
              <span>목표가 이하</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={alertRule.belowPrice ?? ""}
                onChange={(e) =>
                  updateAlertRule({
                    ...alertRule,
                    belowPrice: parseOptionalPositive(e.target.value),
                  })
                }
                placeholder="예: 4.50"
              />
            </label>
            <label className={sharedStyles.alertRules__field}>
              <span>등락률 절대값</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={alertRule.movePercent ?? ""}
                onChange={(e) =>
                  updateAlertRule({
                    ...alertRule,
                    movePercent: parseOptionalPositive(e.target.value),
                  })
                }
                placeholder="예: 10"
              />
            </label>
            <label className={sharedStyles.alertRules__check}>
              <input
                type="checkbox"
                checked={alertRule.eventOnly === true}
                onChange={(e) =>
                  updateAlertRule({
                    ...alertRule,
                    eventOnly: e.target.checked,
                  })
                }
              />
              <span>공시 발생 시 표시</span>
            </label>
            {activeAlertReasons.length > 0 ? (
              <ul className={sharedStyles.alertRules__active}>
                {activeAlertReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            ) : (
              <div className={sharedStyles.alertRules__empty}>
                {hasStockAlertRule(alertRule)
                  ? "현재 충족된 조건 없음"
                  : "조건을 설정하면 목록 브리핑에도 표시됩니다."}
              </div>
            )}
          </div>

          {/* 매수/매도 폼 카드 */}
          {hasMainCharacter ? (
            <div className={sharedStyles.tradeCard}>
              <div className={sharedStyles.tradeCard__tabs}>
                <button
                  type="button"
                  className={[
                    sharedStyles.tradeCard__tab,
                    tradeTab === "buy"
                      ? sharedStyles["tradeCard__tab--activeBuy"]
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => {
                    if (tradeTab === "buy") return;
                    setTradeTab("buy");
                    setQtyInput("");
                    setErrorMessage(null);
                  }}
                  aria-pressed={tradeTab === "buy"}
                >
                  매수
                </button>
                <button
                  type="button"
                  className={[
                    sharedStyles.tradeCard__tab,
                    tradeTab === "sell"
                      ? sharedStyles["tradeCard__tab--activeSell"]
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => {
                    if (tradeTab === "sell") return;
                    setTradeTab("sell");
                    setQtyInput("");
                    setErrorMessage(null);
                  }}
                  disabled={heldShares === 0}
                  aria-pressed={tradeTab === "sell"}
                  title={
                    heldShares === 0
                      ? "보유 주식이 없어 매도할 수 없습니다."
                      : undefined
                  }
                >
                  매도
                </button>
              </div>

              <div className={sharedStyles.tradeCard__row}>
                <span className={sharedStyles.tradeCard__rowLabel}>
                  주문 유형
                </span>
                <div className={sharedStyles.tradeCard__readonly}>
                  일반 주문
                </div>
              </div>

              <div className={sharedStyles.tradeCard__row}>
                <span className={sharedStyles.tradeCard__rowLabel}>
                  {effectiveTab === "buy" ? "구매 가격" : "판매 가격"}
                </span>
                <div className={sharedStyles.tradeCard__priceInput}>
                  <span className={sharedStyles.tradeCard__priceInputValue}>
                    ¤ {formatStockValue(displayPrice)}
                  </span>
                  <span className={sharedStyles.tradeCard__priceInputUnit}>
                    주당
                  </span>
                </div>
              </div>

              <div className={sharedStyles.tradeCard__row}>
                <span className={sharedStyles.tradeCard__rowLabel}>수량</span>
                <div className={sharedStyles.tradeCard__qtyRow}>
                  <button
                    type="button"
                    className={sharedStyles.tradeCard__qtyBtn}
                    onClick={() => adjustQty(-1)}
                    disabled={tradeShares <= 0 || isTradePending}
                    aria-label="수량 1 감소"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    className={sharedStyles.tradeCard__qtyInput}
                    value={qtyInput}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, "");
                      setQtyInput(raw);
                    }}
                    placeholder="0"
                    disabled={isTradePending}
                    aria-label="주문 수량"
                  />
                  <button
                    type="button"
                    className={sharedStyles.tradeCard__qtyBtn}
                    onClick={() => adjustQty(1)}
                    disabled={isTradePending}
                    aria-label="수량 1 증가"
                  >
                    +
                  </button>
                  <span className={sharedStyles.tradeCard__qtyUnit}>주</span>
                </div>
              </div>

              <div className={sharedStyles.tradeCard__quickRow}>
                {QUICK_RATIOS.map((q) => (
                  <button
                    type="button"
                    key={q.label}
                    className={sharedStyles.tradeCard__quick}
                    onClick={() => applyQuickRatio(q.ratio)}
                    disabled={
                      isTradePending ||
                      (effectiveTab === "buy" && displayPrice <= 0) ||
                      (effectiveTab === "sell" && heldShares === 0)
                    }
                  >
                    {q.label}
                  </button>
                ))}
              </div>

              <div className={sharedStyles.tradeCard__row}>
                <span className={sharedStyles.tradeCard__rowLabel}>
                  총 주문 금액
                </span>
                <div className={sharedStyles.tradeCard__total}>
                  <span className={sharedStyles.tradeCard__totalLabel}>
                    {tradeShares > 0
                      ? `¤ ${formatStockValue(displayPrice)} × ${tradeShares.toLocaleString()}주`
                      : "수량을 입력하세요"}
                  </span>
                  <span className={sharedStyles.tradeCard__totalValue}>
                    ¤ {formatStockValue(tradeTotal)}
                  </span>
                </div>
                {effectiveTab === "buy" ? (
                  <div
                    className={[
                      sharedStyles.tradeCard__totalHint,
                      insufficientBalance
                        ? sharedStyles["tradeCard__totalHint--warn"]
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <span>
                      {insufficientBalance ? "잔액 부족" : "주문 가능 잔액"}
                    </span>
                    <span>¤ {formatStockValue(balance)}</span>
                  </div>
                ) : (
                  <div
                    className={[
                      sharedStyles.tradeCard__totalHint,
                      insufficientShares
                        ? sharedStyles["tradeCard__totalHint--warn"]
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <span>
                      {insufficientShares ? "보유 부족" : "보유 가능"}
                    </span>
                    <span>{heldShares.toLocaleString()}주</span>
                  </div>
                )}
                <div
                  className={[
                    sharedStyles.tradeCard__totalHint,
                    exceedsMaxShares
                      ? sharedStyles["tradeCard__totalHint--warn"]
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <span>1회 주문 한도</span>
                  <span>{MAX_ORDER_SHARES.toLocaleString()}주</span>
                </div>
                {tradeProjection ? (
                  <div className={sharedStyles.tradeProjection}>
                    <div className={sharedStyles.tradeProjection__title}>
                      주문 후 예상
                    </div>
                    <div className={sharedStyles.tradeProjection__grid}>
                      <span>보유 수량</span>
                      <strong>
                        {tradeProjection.projectedShares.toLocaleString()}주
                      </strong>
                      <span>종목 비중</span>
                      <strong>
                        {tradeProjection.projectedExposurePercent.toFixed(1)}%
                      </strong>
                      {avgGapPercent !== null ? (
                        <>
                          <span>평단 대비</span>
                          <strong
                            className={
                              avgGapPercent < 0
                                ? sharedStyles["tradeProjection__value--down"]
                                : avgGapPercent > 0
                                  ? sharedStyles["tradeProjection__value--up"]
                                  : ""
                            }
                          >
                            {avgGapPercent > 0 ? "+" : ""}
                            {avgGapPercent.toFixed(2)}%
                          </strong>
                        </>
                      ) : null}
                      <span>잔액</span>
                      <strong>
                        ¤ {formatStockValue(tradeProjection.projectedBalance)}
                      </strong>
                      {tradeProjection.kind === "buy" ? (
                        <>
                          <span>예상 평단</span>
                          <strong>
                            ¤{" "}
                            {formatStockValue(
                              tradeProjection.projectedAvgPrice,
                            )}
                          </strong>
                        </>
                      ) : (
                        <>
                          <span>예상 손익</span>
                          <strong
                            className={
                              tradeProjection.realizedProfit < 0
                                ? sharedStyles["tradeProjection__value--down"]
                                : tradeProjection.realizedProfit > 0
                                  ? sharedStyles["tradeProjection__value--up"]
                                  : ""
                            }
                          >
                            {tradeProjection.realizedProfit > 0 ? "+" : ""}¤{" "}
                            {formatStockValue(
                              tradeProjection.realizedProfit,
                            )}
                          </strong>
                        </>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                className={[
                  sharedStyles.tradeCard__submit,
                  effectiveTab === "buy"
                    ? sharedStyles["tradeCard__submit--buy"]
                    : sharedStyles["tradeCard__submit--sell"],
                ].join(" ")}
                onClick={handleTradeSubmit}
                disabled={submitDisabled}
                aria-label={effectiveTab === "buy" ? "구매하기" : "판매하기"}
              >
                {isTradePending
                  ? "처리 중..."
                  : effectiveTab === "buy"
                    ? "구매하기"
                    : "판매하기"}
              </button>
            </div>
          ) : (
            <Box className={sharedStyles.detailDisabled}>
              거래 불가 — 메인 AGENT 캐릭터 등록 후 다시 시도하세요.
            </Box>
          )}

          {/* 보유 정보 카드 (현재 종목, 보유 ≥ 1) */}
          {hasMainCharacter && holding && holding.shares > 0 ? (
            <div className={sharedStyles.detailHolding}>
              <div className={sharedStyles.detailHolding__head}>
                <span className={sharedStyles.detailHolding__title}>
                  내 보유
                </span>
              </div>
              <div className={sharedStyles.detailHolding__grid}>
                <div className={sharedStyles.detailHolding__cell}>
                  <span className={sharedStyles.detailHolding__label}>
                    보유
                  </span>
                  <span className={sharedStyles.detailHolding__value}>
                    {holding.shares.toLocaleString()} 주
                  </span>
                </div>
                <div className={sharedStyles.detailHolding__cell}>
                  <span className={sharedStyles.detailHolding__label}>
                    평단
                  </span>
                  <span className={sharedStyles.detailHolding__value}>
                    ¤ {formatStockValue(holding.avgPrice)}
                  </span>
                </div>
                <div className={sharedStyles.detailHolding__cell}>
                  <span className={sharedStyles.detailHolding__label}>
                    평가금
                  </span>
                  <span className={sharedStyles.detailHolding__value}>
                    ¤ {formatStockValue(holding.evaluation)}
                  </span>
                </div>
                <div className={sharedStyles.detailHolding__cell}>
                  <span className={sharedStyles.detailHolding__label}>
                    손익
                  </span>
                  <span
                    className={[
                      sharedStyles.detailHolding__value,
                      holdingMod,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {holding.profitLoss > 0 ? "+" : ""}
                    {formatStockValue(holding.profitLoss)} (
                    {holding.profitPercent > 0 ? "+" : ""}
                    {holding.profitPercent.toFixed(2)}%)
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          <WatchlistRailCard items={watchedItems} />

          {/* 전체 보유 mini list — 다른 종목으로 push 이동 */}
          <div className={sharedStyles.railCard}>
            <div className={sharedStyles.railCard__head}>
              <span>내 보유</span>
              <span className={sharedStyles.railCard__count}>
                {holdings.items.length}
              </span>
            </div>
            {holdings.items.length === 0 ? (
              <div className={sharedStyles.railCard__empty}>보유 종목 없음</div>
            ) : (
              <ul className={sharedStyles.holdingMini}>
                {holdings.items.map((h) => {
                  const dir = profitDirection(h.profitLoss);
                  const profitMod =
                    dir === "up"
                      ? sharedStyles["holdingMini__profit--up"]
                      : dir === "down"
                        ? sharedStyles["holdingMini__profit--down"]
                        : "";
                  return (
                    <li
                      key={h.ticker}
                      className={sharedStyles.holdingMini__item}
                    >
                      <Link
                        href={`/erp/stock/${encodeURIComponent(h.ticker)}`}
                        className={sharedStyles.holdingMini__link}
                      >
                        <LinkPendingProbe />
                        <div className={sharedStyles.holdingMini__top}>
                          <span className={sharedStyles.holdingMini__tickerWrap}>
                            <StockLogo ticker={h.ticker} size="sm" />
                            <span className={sharedStyles.holdingMini__ticker}>
                              {h.ticker}
                            </span>
                          </span>
                          <span className={sharedStyles.holdingMini__eval}>
                            ¤ {formatStockValue(h.evaluation)}
                          </span>
                        </div>
                        <div className={sharedStyles.holdingMini__bottom}>
                          <span className={sharedStyles.holdingMini__shares}>
                            {h.shares.toLocaleString()}주
                          </span>
                          <span
                            className={[
                              sharedStyles.holdingMini__profit,
                              profitMod,
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          >
                            {h.profitPercent > 0 ? "+" : ""}
                            {h.profitPercent.toFixed(2)}%
                          </span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className={sharedStyles.railCard}>
            <div className={sharedStyles.railCard__head}>
              <span>주문내역</span>
            </div>
            {stockTransactions.length === 0 ? (
              <div className={sharedStyles.railCard__empty}>
                체결 내역 없음
                <div className={sharedStyles.railCard__emptyHint}>
                  매수·매도 완료 후 최근 내역이 표시됩니다.
                </div>
              </div>
            ) : (
              <ul className={sharedStyles.tradeHistory}>
                {stockTransactions.map((tx) => {
                  const created = new Date(tx.createdAt);
                  const dateLabel = Number.isFinite(created.getTime())
                    ? created.toLocaleString("ko-KR", {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })
                    : "—";
                  const shares =
                    typeof tx.metadata?.shares === "number"
                      ? tx.metadata.shares
                      : null;
                  const price =
                    typeof tx.metadata?.price === "number"
                      ? tx.metadata.price
                      : null;
                  const profit =
                    typeof tx.metadata?.profit === "number"
                      ? tx.metadata.profit
                      : null;
                  const isBuy = tx.type === "STOCK_BUY";
                  return (
                    <li
                      key={String(tx._id)}
                      className={sharedStyles.tradeHistory__item}
                    >
                      <div className={sharedStyles.tradeHistory__top}>
                        <span
                          className={[
                            sharedStyles.tradeHistory__side,
                            isBuy
                              ? sharedStyles["tradeHistory__side--buy"]
                              : sharedStyles["tradeHistory__side--sell"],
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {isBuy ? "매수" : "매도"}
                        </span>
                        <span className={sharedStyles.tradeHistory__date}>
                          {dateLabel}
                        </span>
                      </div>
                      <div className={sharedStyles.tradeHistory__meta}>
                        {shares !== null
                          ? `${shares.toLocaleString()}주`
                          : "수량 미상"}
                        {price !== null
                          ? ` · ¤ ${formatStockValue(price)}`
                          : ""}
                      </div>
                      <div className={sharedStyles.tradeHistory__amount}>
                        {tx.amount > 0 ? "+" : ""}
                        ¤ {formatStockValue(tx.amount)}
                        {profit !== null ? (
                          <span className={sharedStyles.tradeHistory__profit}>
                            손익 {profit > 0 ? "+" : ""}¤{" "}
                            {formatStockValue(profit)}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
