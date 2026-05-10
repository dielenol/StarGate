"use client";

/**
 * 주식 — 내 자산 client (`/erp/stock/portfolio`).
 *
 * - 토스 패턴: 평가금/총손익/손익% 3-column 요약 hero + 보유 종목 list.
 * - 행 클릭 시 `/erp/stock?ticker=[ticker]` 로 이동 — master-detail detail 패널이
 *   해당 종목으로 갱신 (거기서 매도 sticky CTA).
 * - 보유 0이면 안내 + [종목 보기] CTA.
 * - StockTabs 의 활성 탭은 "내 자산".
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
import Eyebrow from "@/components/ui/Eyebrow/Eyebrow";
import PageHead from "@/components/ui/PageHead/PageHead";

import StockTabs from "../StockTabs";

import styles from "../page.module.css";

/* ── 상수 ── */

type Direction = "up" | "down" | "flat";

function profitDirection(profit: number): Direction {
  if (profit > 0) return "up";
  if (profit < 0) return "down";
  return "flat";
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
  /* 6. 쿼리 — list view 와 캐시 공유 (시세/보유). credits 는 잔액 갱신용. */
  const pricesQuery = useStockPrices({ initialData: initialPrices });
  const holdingsQuery = useStockHoldings({ initialData: initialHoldings });
  const creditsQuery = useCredits();

  /* 11. 파생 */
  const holdings = holdingsQuery.data ?? initialHoldings;
  // prices 는 background refresh 에 의존 — direct read 는 안 하지만 cache 미스 회피용으로 hook 호출 유지.
  void pricesQuery;

  const balance = useMemo(() => {
    if (creditsQuery.data) return creditsQuery.data.balance;
    return initialBalance;
  }, [creditsQuery.data, initialBalance]);

  const hasMainCharacter = mainCharacter !== null && !mainCharacterError;

  /* 11. 파생 — portfolio summary */
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
          { label: "주식", href: "/erp/stock" },
          { label: "내 자산" },
        ]}
        title="내 자산"
      />

      <StockTabs />

      {/* ── 헤더 — 캐릭터 + 잔액 ── */}
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
          <Eyebrow>BOOK</Eyebrow>
          <div className={styles.header__statusText}>
            {holdings.items.length} 종 보유
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
              운영자(GM)에게 문의하세요.
            </>
          ) : (
            <>
              메인 AGENT 캐릭터가 없어 자산을 표시할 수 없습니다.
            </>
          )}
        </Box>
      ) : null}

      {/* ── 요약 hero ── */}
      {hasMainCharacter && holdings.items.length > 0 ? (
        <div className={styles.portfolioSummary}>
          <div className={styles.portfolio__metric}>
            <span className={styles.portfolio__metricLabel}>평가금</span>
            <span className={styles.portfolio__metricBig}>
              ¤ {summary.totalEval.toLocaleString()}
            </span>
          </div>
          <div className={styles.portfolio__metric}>
            <span className={styles.portfolio__metricLabel}>총 손익</span>
            <span
              className={[styles.portfolio__metricBig, summaryMod]
                .filter(Boolean)
                .join(" ")}
            >
              {summary.totalPL > 0 ? "+" : ""}¤{" "}
              {summary.totalPL.toLocaleString()}
            </span>
          </div>
          <div className={styles.portfolio__metric}>
            <span className={styles.portfolio__metricLabel}>손익률</span>
            <span
              className={[styles.portfolio__metricBig, summaryMod]
                .filter(Boolean)
                .join(" ")}
            >
              {summary.plPercent > 0 ? "+" : ""}
              {summary.plPercent.toFixed(2)}%
            </span>
          </div>
        </div>
      ) : null}

      {/* ── 보유 종목 list ── */}
      {!hasMainCharacter ? null : holdings.items.length === 0 ? (
        <Box className={styles.empty}>
          아직 매수한 종목이 없습니다.
          <br />
          <Link href="/erp/stock" className={styles.emptyAction}>
            종목 보러가기
          </Link>
        </Box>
      ) : (
        <ul className={styles.holdingList}>
          {holdings.items.map((h) => {
            const dir = profitDirection(h.profitLoss);
            const profitMod =
              dir === "up"
                ? styles["holdingRow__cellValue--up"]
                : dir === "down"
                  ? styles["holdingRow__cellValue--down"]
                  : "";
            return (
              <li key={h.ticker} className={styles.holdingList__item}>
                <Link
                  href={`/erp/stock?ticker=${encodeURIComponent(h.ticker)}`}
                  className={styles.holdingRow}
                  aria-label={`${h.name} 보유 ${h.shares}주 — 상세 보기`}
                >
                  <div className={styles.holdingRow__left}>
                    <span className={styles.holdingRow__ticker}>
                      {h.ticker}
                    </span>
                    <span className={styles.holdingRow__name}>
                      {h.name} · {h.shares.toLocaleString()}주 @ ¤
                      {h.avgPrice.toLocaleString()}
                    </span>
                  </div>
                  <div className={styles.holdingRow__cell}>
                    <span className={styles.holdingRow__cellLabel}>현재가</span>
                    <span className={styles.holdingRow__cellValue}>
                      ¤ {h.currentPrice.toLocaleString()}
                    </span>
                  </div>
                  <div className={styles.holdingRow__cell}>
                    <span className={styles.holdingRow__cellLabel}>평가금</span>
                    <span className={styles.holdingRow__cellValue}>
                      ¤ {h.evaluation.toLocaleString()}
                    </span>
                  </div>
                  <div className={styles.holdingRow__cell}>
                    <span className={styles.holdingRow__cellLabel}>손익</span>
                    <span
                      className={[styles.holdingRow__cellValue, profitMod]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {h.profitLoss > 0 ? "+" : ""}
                      {h.profitLoss.toLocaleString()} (
                      {h.profitPercent > 0 ? "+" : ""}
                      {h.profitPercent.toFixed(2)}%)
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
