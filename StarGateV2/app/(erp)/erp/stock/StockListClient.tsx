"use client";

/**
 * 종목 리스트 client (`/erp/stock`).
 *
 * 3-column 풀: 좌(list) / 가운데(hover 미리보기) / 우(rail: 잔고/보유/주문).
 *
 * 인터랙션:
 *  - 행 클릭 시 `/erp/stock/[ticker]` 매수 페이지로 push (기존 ?ticker= replace 방식 폐기).
 *    middle-click / cmd-click 은 native 새 탭 열기 보존 — handleSelect 가 modifier 클릭은 그대로 통과.
 *  - 행 hover 0.15초 후 가운데 영역에 `<StockHoverPreview>` 표시 (가격/미니 차트/이벤트).
 *    mouse leave 시 즉시 닫힘. 모바일(touch)에서는 hover 이벤트가 발생 안 해 자연 비활성.
 */

import { useCallback, useDeferredValue, useMemo, useRef, useState } from "react";

import Link from "next/link";
import LinkPendingProbe from "@/components/erp/NavPending/LinkPendingProbe";
import { useCredits } from "@/hooks/queries/useCreditsQuery";
import {
  type StockHoldingsResponse,
  type StockMarketWireResponse,
  type StockPricesResponse,
  type StockSparkline as StockSparklineDto,
  type StockSparklinesResponse,
  useStockHoldings,
  useStockMarketWire,
  useStockPrices,
  useStockSparklines,
} from "@/hooks/queries/useStocksQuery";

import Box from "@/components/ui/Box/Box";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PageHead from "@/components/ui/PageHead/PageHead";
import Tag from "@/components/ui/Tag/Tag";
import { formatStockValue } from "@/lib/stocks/pricing";

import StockHoverPreview from "./StockHoverPreview";
import MarketWirePanel from "./MarketWirePanel";
import StockSparkline from "./StockSparkline";
import StockTabs from "./StockTabs";
import { StockLogo } from "./_logos";
import { ARROW, priceDirection, profitDirection } from "./_helpers";
import { useStockWatchlist } from "./useStockWatchlist";

import styles from "./page.module.css";

/* ── 상수 ── */

const SPARKLINE_DAYS = 7;
/** 행 hover 시 미리보기 표시까지 대기 시간 (ms). */
const HOVER_DELAY_MS = 150;

type StockFilter = "all" | "watch" | "holding";

const FILTER_OPTIONS: Array<{ value: StockFilter; label: string }> = [
  { value: "all", label: "전체" },
  { value: "watch", label: "관심" },
  { value: "holding", label: "보유" },
];

/* ── Props ── */

interface Props {
  initialPrices: StockPricesResponse;
  initialSparklines: StockSparklinesResponse;
  initialHoldings: StockHoldingsResponse;
  initialBalance: number;
  initialMarketWire: StockMarketWireResponse;
  mainCharacter: { id: string; codename: string } | null;
  mainCharacterError: string | null;
  marketEnabled: boolean;
}

/* ── 컴포넌트 ── */

export default function StockListClient({
  initialPrices,
  initialSparklines,
  initialHoldings,
  initialBalance,
  initialMarketWire,
  mainCharacter,
  mainCharacterError,
  marketEnabled,
}: Props) {
  /* 6. 쿼리 — list view 의 모든 데이터 시드. */
  const pricesQuery = useStockPrices({ initialData: initialPrices });
  const sparklinesQuery = useStockSparklines(SPARKLINE_DAYS, {
    initialData: initialSparklines,
  });
  const holdingsQuery = useStockHoldings({ initialData: initialHoldings });
  const marketWireQuery = useStockMarketWire({ initialData: initialMarketWire });
  const creditsQuery = useCredits();
  const watchlist = useStockWatchlist();

  /* 10. 로컬 — 검색 + hover 상태 */
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StockFilter>("all");
  const deferredSearch = useDeferredValue(search);
  /**
   * hovered ticker — 초기값은 list 최상단 종목. mouseleave 시에도 null 로 되돌리지 않고
   * 직전 호버 데이터를 유지 (다음 호버 전까지 미리보기 영역 비지 않게).
   */
  const [hoveredTicker, setHoveredTicker] = useState<string | null>(
    () => initialPrices.items[0]?.ticker ?? null,
  );
  /**
   * hover delay 타이머 핸들. ref 로 보관해 cancelHover 가 즉시 clear 가능.
   * NodeJS.Timeout / number 통합 — 브라우저는 number, node 는 Timeout. 둘 다 clearTimeout 호환.
   */
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* 11. 파생 — 시세 / 보유 / sparkline 룩업 */
  const prices = pricesQuery.data ?? initialPrices;
  const holdings = holdingsQuery.data ?? initialHoldings;
  const marketWire = marketWireQuery.data ?? initialMarketWire;

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

  const heldTickerSet = useMemo(() => {
    return new Set(holdings.items.map((item) => item.ticker));
  }, [holdings.items]);

  const filteredItems = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return prices.items.filter((item) => {
      if (filter === "watch" && !watchlist.isWatched(item.ticker)) {
        return false;
      }
      if (filter === "holding" && !heldTickerSet.has(item.ticker)) {
        return false;
      }
      if (!q) return true;
      return (
        item.ticker.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q)
      );
    });
  }, [filter, heldTickerSet, prices.items, deferredSearch, watchlist]);

  const hoveredPriceItem = useMemo(() => {
    if (!hoveredTicker) return null;
    return prices.items.find((p) => p.ticker === hoveredTicker) ?? null;
  }, [prices.items, hoveredTicker]);

  const hoveredSparkline = useMemo(() => {
    if (!hoveredTicker) return [];
    return sparklineByTicker.get(hoveredTicker) ?? [];
  }, [sparklineByTicker, hoveredTicker]);

  const hasMainCharacter = mainCharacter !== null && !mainCharacterError;

  /* 14. 핸들러 */

  /** 호버 delay 타이머만 clear. hoveredTicker 는 직전 값 유지 (미리보기 잔존 의도). */
  const cancelHover = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  /** ticker 위에 0.15초 머무르면 hovered state 갱신 → 미리보기 표시. */
  const scheduleHover = useCallback((ticker: string) => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
    }
    hoverTimerRef.current = setTimeout(() => {
      setHoveredTicker(ticker);
      hoverTimerRef.current = null;
    }, HOVER_DELAY_MS);
  }, []);

  /**
   * 행 click. modifier 키(cmd/ctrl/shift/alt) 또는 middle-click 이면 native 새 탭 열기 보존.
   * 일반 click 만 가로채 push 이동 — `<Link>` 의 default href 가 매수 페이지라 modifier
   * 클릭 시 그대로 새 탭에서 매수 페이지가 열린다.
   */
  const handleSelect = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey ||
        e.button !== 0
      ) {
        return;
      }
      // hover 상태 즉시 닫음 — 페이지 전환 후 잔존 방지.
      cancelHover();
    },
    [cancelHover],
  );

  function filterCount(kind: StockFilter): number {
    if (kind === "watch") return watchlist.tickers.length;
    if (kind === "holding") return holdings.items.length;
    return prices.items.length;
  }

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "STOCK" },
        ]}
        title="주식"
      />

      <div className={styles.tabsRow}>
        <StockTabs />
        <Tag tone={marketEnabled ? "gold" : "danger"}>
          {marketEnabled ? "거래 가능" : "거래 중지"}
        </Tag>
      </div>

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

      {/* ── 3-column layout: 좌 list / 가운데 hover preview / 우 rail ── */}
      <div className={styles.layout}>
        {/* ── 좌: list panel ── */}
        <div className={styles.listPanel}>
          <div className={styles.searchBar}>
            <input
              id="stock-search"
              type="search"
              inputMode="search"
              className={styles.searchBar__input}
              placeholder="ticker 또는 종목명 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className={styles.filterTabs} role="tablist" aria-label="종목 필터">
              {FILTER_OPTIONS.map((option) => {
                const active = filter === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={[
                      styles.filterTabs__chip,
                      active ? styles["filterTabs__chip--active"] : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => setFilter(option.value)}
                  >
                    <span>{option.label}</span>
                    <span className={styles.filterTabs__count}>
                      {filterCount(option.value)}
                    </span>
                  </button>
                );
              })}
            </div>
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
                const isActive = item.ticker === hoveredTicker;
                return (
                  <li key={item.ticker} className={styles.stockList__item}>
                    <button
                      type="button"
                      className={[
                        styles.stockRow__watch,
                        watchlist.isWatched(item.ticker)
                          ? styles["stockRow__watch--active"]
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => watchlist.toggle(item.ticker)}
                      aria-label={`${item.name} 관심종목 ${
                        watchlist.isWatched(item.ticker) ? "해제" : "추가"
                      }`}
                      title={
                        watchlist.isWatched(item.ticker)
                          ? "관심종목 해제"
                          : "관심종목 추가"
                      }
                    >
                      {watchlist.isWatched(item.ticker) ? "★" : "☆"}
                    </button>
                    <Link
                      href={`/erp/stock/${encodeURIComponent(item.ticker)}`}
                      className={[
                        styles.stockRow,
                        isActive ? styles["stockRow--active"] : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      aria-label={`${item.name} ${item.ticker} 매수 페이지로 이동`}
                      onClick={handleSelect}
                      onMouseEnter={() => scheduleHover(item.ticker)}
                      onMouseLeave={cancelHover}
                    >
                      <LinkPendingProbe />
                      <div className={styles.stockRow__left}>
                        <StockLogo
                          ticker={item.ticker}
                          size="md"
                          className={styles.stockRow__logo}
                        />
                        <div className={styles.stockRow__leftText}>
                          <span className={styles.stockRow__ticker}>
                            {item.ticker}
                          </span>
                          <span className={styles.stockRow__name}>
                            {item.name}
                          </span>
                        </div>
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
                          ¤ {formatStockValue(item.price)}
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

        {/* ── 가운데: hover 미리보기 ── */}
        <div className={styles.detailPanel}>
          <StockHoverPreview
            priceItem={hoveredPriceItem}
            sparklinePoints={hoveredSparkline}
          />
        </div>

        {/* ── 우: right rail — 잔고 + 보유종목 + 주문내역 ── */}
        <aside className={styles.rightRail} aria-label="자산 사이드바">
          <div className={styles.walletCard}>
            <Eyebrow>WALLET</Eyebrow>
            <div className={styles.walletCard__amount}>
              ¤ {formatStockValue(balance)}
            </div>
            {hasMainCharacter ? (
              <div className={styles.walletCard__agent}>
                <span className={styles.walletCard__agentLabel}>AGENT</span>
                <span className={styles.walletCard__agentName}>
                  {mainCharacter.codename}
                </span>
              </div>
            ) : null}
          </div>

          <div className={styles.railCard}>
            <div className={styles.railCard__head}>
              <span>내 보유</span>
              <span className={styles.railCard__count}>
                {holdings.items.length}
              </span>
            </div>
            {holdings.items.length === 0 ? (
              <div className={styles.railCard__empty}>보유 종목 없음</div>
            ) : (
              <ul className={styles.holdingMini}>
                {holdings.items.map((h) => {
                  const dir = profitDirection(h.profitLoss);
                  const profitMod =
                    dir === "up"
                      ? styles["holdingMini__profit--up"]
                      : dir === "down"
                        ? styles["holdingMini__profit--down"]
                        : "";
                  return (
                    <li key={h.ticker} className={styles.holdingMini__item}>
                      <Link
                        href={`/erp/stock/${encodeURIComponent(h.ticker)}`}
                        className={styles.holdingMini__link}
                      >
                        <LinkPendingProbe />
                        <div className={styles.holdingMini__top}>
                          <span className={styles.holdingMini__tickerWrap}>
                            <StockLogo ticker={h.ticker} size="sm" />
                            <span className={styles.holdingMini__ticker}>
                              {h.ticker}
                            </span>
                          </span>
                          <span className={styles.holdingMini__eval}>
                            ¤ {formatStockValue(h.evaluation)}
                          </span>
                        </div>
                        <div className={styles.holdingMini__bottom}>
                          <span className={styles.holdingMini__shares}>
                            {h.shares.toLocaleString()}주
                          </span>
                          <span
                            className={[styles.holdingMini__profit, profitMod]
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

          <div className={styles.railCard}>
            <div className={styles.railCard__head}>
              <span>주문내역</span>
            </div>
            <div className={styles.railCard__empty}>
              대기 주문 없음
              <div className={styles.railCard__emptyHint}>
                24시간 즉시 체결 — 대기 주문 미지원
              </div>
            </div>
          </div>

          <MarketWirePanel items={marketWire.items} compact />
        </aside>
      </div>
    </>
  );
}
