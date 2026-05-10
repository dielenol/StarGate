"use client";

/**
 * 주식 list view (`/erp/stock`).
 *
 * - 토스 패턴: 세로 list + 행마다 sparkline + 행 자체가 종목 상세로 진입하는 Link.
 * - 검색 input 으로 ticker / 한글 이름 부분 매칭 client filter.
 * - 헤더 카드 — 메인 AGENT codename + WALLET 잔액 + MARKET 상태.
 * - 매수/매도 버튼 없음 — 모든 trade 진입은 종목 상세의 sticky CTA 에서.
 *
 * 섹션 탭 (StockTabs) 으로 `내 자산` 페이지 (/erp/stock/portfolio) 와 연결.
 */

import { useDeferredValue, useMemo, useState } from "react";

import Link from "next/link";

import { useCredits } from "@/hooks/queries/useCreditsQuery";
import {
  type StockSparkline as StockSparklineDto,
  useStockPrices,
  useStockSparklines,
} from "@/hooks/queries/useStocksQuery";

import type {
  StockPricesResponse,
  StockSparklinesResponse,
} from "@/hooks/queries/useStocksQuery";

import Box from "@/components/ui/Box/Box";
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PageHead from "@/components/ui/PageHead/PageHead";
import Tag from "@/components/ui/Tag/Tag";

import StockSparkline from "./StockSparkline";
import StockTabs from "./StockTabs";

import styles from "./page.module.css";

/* ── 상수 ── */

const SPARKLINE_DAYS = 7;

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

/* ── Props ── */

interface Props {
  initialPrices: StockPricesResponse;
  initialSparklines: StockSparklinesResponse;
  initialBalance: number;
  mainCharacter: { id: string; codename: string } | null;
  mainCharacterError: string | null;
}

/* ── 컴포넌트 ── */

export default function StockListClient({
  initialPrices,
  initialSparklines,
  initialBalance,
  mainCharacter,
  mainCharacterError,
}: Props) {
  /* 6. 쿼리 — 시세/스파크라인은 list view 에서 항상 표시. credits 는 잔액 갱신용 (initialData 시드 없음). */
  const pricesQuery = useStockPrices({ initialData: initialPrices });
  const sparklinesQuery = useStockSparklines(SPARKLINE_DAYS, {
    initialData: initialSparklines,
  });
  const creditsQuery = useCredits();

  /* 10. 로컬 — 검색어 */
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  /* 11. 파생 */
  const prices = pricesQuery.data ?? initialPrices;

  const balance = useMemo(() => {
    if (creditsQuery.data) return creditsQuery.data.balance;
    return initialBalance;
  }, [creditsQuery.data, initialBalance]);

  // ticker → sparkline points lookup. 누락 ticker 는 빈 배열.
  const sparklineByTicker = useMemo(() => {
    const map = new Map<string, StockSparklineDto["points"]>();
    if (sparklinesQuery.data) {
      for (const item of sparklinesQuery.data.items) {
        map.set(item.ticker, item.points);
      }
    }
    return map;
  }, [sparklinesQuery.data]);

  // 검색 필터 — 대소문자 무시, ticker / name 부분 매칭.
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

  const hasMainCharacter = mainCharacter !== null && !mainCharacterError;

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

      {/* ── 검색 ── */}
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

      {/* ── 종목 list view (세로) ── */}
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
            return (
              <li key={item.ticker} className={styles.stockList__item}>
                <Link
                  href={`/erp/stock/${item.ticker}`}
                  className={styles.stockRow}
                  aria-label={`${item.name} ${item.ticker} 상세 보기`}
                >
                  <div className={styles.stockRow__left}>
                    <span className={styles.stockRow__ticker}>{item.ticker}</span>
                    <span className={styles.stockRow__name}>{item.name}</span>
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
    </>
  );
}
