"use client";

/**
 * 주식 — 내 자산 client (`/erp/stock/portfolio`).
 *
 * 토스증권 "내 투자" 패턴 미러:
 *  - 헤더: "내 투자" + 평가금 큰 글자 + 원금 + 총 수익(±) 한 줄
 *  - 분류는 STOCK_CATALOG 에 미정의라 단일 list (필요 시 future category 도입)
 *  - 큰 테이블: 종목명/로고 + 총 수익률/금 + 평균/현재가 + 보유 수량 + 평가금 + 원금
 *  - 색상: red=상승, blue=하락 (한국 주식 톤; globals.css --danger / --info)
 *  - 행 클릭 → /erp/stock/[ticker] 매수/매도 진입
 */

import { useMemo } from "react";

import Link from "next/link";

import { useCredits } from "@/hooks/queries/useCreditsQuery";
import {
  useStockHoldings,
  useStockPrices,
} from "@/hooks/queries/useStocksQuery";

import type {
  StockHoldingsResponse,
  StockPricesResponse,
} from "@/hooks/queries/useStocksQuery";

import Box from "@/components/ui/Box/Box";
import PageHead from "@/components/ui/PageHead/PageHead";

import StockTabs from "../StockTabs";
import { StockLogo } from "../_logos";

import styles from "../page.module.css";

/* ── 상수 ── */

type Direction = "up" | "down" | "flat";

function profitDirection(profit: number): Direction {
  if (profit > 0) return "up";
  if (profit < 0) return "down";
  return "flat";
}

/** direction → 토스 톤 색 클래스 (red=상승 / blue=하락). */
function directionMod(direction: Direction, baseClass: string): string {
  if (direction === "up") return `${baseClass} ${baseClass}--up`;
  if (direction === "down") return `${baseClass} ${baseClass}--down`;
  return baseClass;
}

/* ── Props ── */

interface Props {
  initialPrices: StockPricesResponse;
  initialHoldings: StockHoldingsResponse;
  initialBalance: number;
  mainCharacter: { id: string; codename: string } | null;
  mainCharacterError: string | null;
}

/* ── 컴포넌트 ── */

export default function StockPortfolioClient({
  initialPrices,
  initialHoldings,
  initialBalance,
  mainCharacter,
  mainCharacterError,
}: Props) {
  const pricesQuery = useStockPrices({ initialData: initialPrices });
  const holdingsQuery = useStockHoldings({ initialData: initialHoldings });
  const creditsQuery = useCredits();

  const holdings = holdingsQuery.data ?? initialHoldings;
  void pricesQuery;

  const balance = useMemo(() => {
    if (creditsQuery.data) return creditsQuery.data.balance;
    return initialBalance;
  }, [creditsQuery.data, initialBalance]);

  const hasMainCharacter = mainCharacter !== null && !mainCharacterError;

  /* 포트폴리오 summary */
  const summary = useMemo(() => {
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

  const summaryDirection = profitDirection(summary.totalPL);

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "주식", href: "/erp/stock" },
          { label: "내 자산" },
        ]}
        title="내 자산"
      />

      <StockTabs />

      {/* 메인 캐릭터 안내 */}
      {!hasMainCharacter ? (
        <Box className={styles.notice}>
          {mainCharacterError ? (
            <>
              <strong className={styles.notice__strong}>⚠ 정합성 위반</strong>
              {": "}
              {mainCharacterError}
              <br />
              운영자(GM)에게 문의하세요.
            </>
          ) : (
            <>메인 AGENT 캐릭터가 없어 자산을 표시할 수 없습니다.</>
          )}
        </Box>
      ) : null}

      {/* ── 토스 톤 헤더 ── */}
      {hasMainCharacter ? (
        <div className={styles.tossHeader}>
          <div className={styles.tossHeader__label}>내 투자</div>
          <div className={styles.tossHeader__eval}>
            ¤ {summary.totalEval.toLocaleString()}
          </div>
          <div className={styles.tossHeader__metaRow}>
            <span className={styles.tossHeader__metaItem}>
              <span className={styles.tossHeader__metaLabel}>원금</span>
              <span className={styles.tossHeader__metaValue}>
                ¤ {summary.totalCost.toLocaleString()}
              </span>
            </span>
            <span className={styles.tossHeader__metaItem}>
              <span className={styles.tossHeader__metaLabel}>총 수익</span>
              <span
                className={directionMod(
                  summaryDirection,
                  styles.tossHeader__metaValue,
                )}
              >
                {summary.totalPL > 0 ? "+" : ""}¤{" "}
                {summary.totalPL.toLocaleString()} (
                {summary.plPercent > 0 ? "+" : ""}
                {summary.plPercent.toFixed(2)}%)
              </span>
            </span>
            <span className={styles.tossHeader__metaItem}>
              <span className={styles.tossHeader__metaLabel}>잔액</span>
              <span className={styles.tossHeader__metaValue}>
                ¤ {balance.toLocaleString()}
              </span>
            </span>
            <span className={styles.tossHeader__metaItem}>
              <span className={styles.tossHeader__metaLabel}>보유</span>
              <span className={styles.tossHeader__metaValue}>
                {holdings.items.length} 종
              </span>
            </span>
          </div>
        </div>
      ) : null}

      {/* ── 보유 종목 테이블 ── */}
      {!hasMainCharacter ? null : holdings.items.length === 0 ? (
        <Box className={styles.empty}>
          아직 매수한 종목이 없습니다.
          <br />
          <Link href="/erp/stock" className={styles.emptyAction}>
            종목 보러가기
          </Link>
        </Box>
      ) : (
        <div
          className={styles.tossTable}
          role="table"
          aria-label="보유 종목"
        >
          <div className={styles.tossTable__head} role="row">
            <span role="columnheader">종목명</span>
            <span role="columnheader" className={styles.tossTable__numHead}>
              총 수익률
            </span>
            <span role="columnheader" className={styles.tossTable__numHead}>
              총 수익금
            </span>
            <span role="columnheader" className={styles.tossTable__numHead}>
              평균단가
            </span>
            <span role="columnheader" className={styles.tossTable__numHead}>
              현재가
            </span>
            <span role="columnheader" className={styles.tossTable__numHead}>
              보유수량
            </span>
            <span role="columnheader" className={styles.tossTable__numHead}>
              평가금
            </span>
            <span role="columnheader" className={styles.tossTable__numHead}>
              원금
            </span>
          </div>
          {holdings.items.map((h) => {
            const dir = profitDirection(h.profitLoss);
            const profitClass = directionMod(dir, styles.tossTable__num);
            const cost = h.avgPrice * h.shares;
            return (
              <Link
                key={h.ticker}
                href={`/erp/stock/${encodeURIComponent(h.ticker)}`}
                className={styles.tossTable__row}
                role="row"
                aria-label={`${h.name} ${h.ticker} — 매수/매도 페이지`}
              >
                <span className={styles.tossTable__nameCell} role="cell">
                  <span className={styles.tossTable__logo} aria-hidden>
                    <StockLogo ticker={h.ticker} size="md" />
                  </span>
                  <span className={styles.tossTable__nameStack}>
                    <span className={styles.tossTable__name}>{h.name}</span>
                    <span className={styles.tossTable__ticker}>{h.ticker}</span>
                  </span>
                </span>
                <span className={profitClass} role="cell">
                  {h.profitPercent > 0 ? "+" : ""}
                  {h.profitPercent.toFixed(2)}%
                </span>
                <span className={profitClass} role="cell">
                  {h.profitLoss > 0 ? "+" : ""}
                  {h.profitLoss.toLocaleString()}
                </span>
                <span className={styles.tossTable__num} role="cell">
                  ¤ {h.avgPrice.toLocaleString()}
                </span>
                <span className={styles.tossTable__num} role="cell">
                  ¤ {h.currentPrice.toLocaleString()}
                </span>
                <span className={styles.tossTable__num} role="cell">
                  {h.shares.toLocaleString()} 주
                </span>
                <span className={styles.tossTable__num} role="cell">
                  ¤ {h.evaluation.toLocaleString()}
                </span>
                <span className={styles.tossTable__num} role="cell">
                  ¤ {cost.toLocaleString()}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
