"use client";

/**
 * 종목 로고 매핑 — ticker → React 컴포넌트.
 *
 * `lib/stocks/catalog.ts` 는 server-safe (React import 금지) 라 별도로 분리.
 * SVG 자체는 `public/assets/svg/ic_stock-{ticker}.svg` 단일 소스, Turbopack SVGR 규칙으로
 * React 컴포넌트화. 본 모듈은 컴포넌트 매핑 + `<StockLogo>` 래퍼만 담당.
 *
 * 사용처:
 *  - list view (StockListClient) row 좌측 logoCircle--md
 *  - rail mini list (StockListClient / StockTradeClient) logoCircle--sm
 *  - hover preview (StockHoverPreview) 헤더 logoCircle--lg
 *  - 매수 페이지 hero (StockTradeClient) logoCircle--lg
 */

/* 1. 코어 라이브러리, 기타 라이브러리 */
import { createElement, type ComponentProps } from "react";

/* 4. 프로젝트 내부 컴포넌트 */
import {
  IconStockArt,
  IconStockBpe,
  IconStockGn3,
  IconStockMsf,
  IconStockSpz,
  IconStockSsr,
  IconStockStm,
  IconStockTws,
  IconStockVfp,
  type IconComponent,
} from "@/components/icons";

/* 4-1. 유틸 / 상수 / asset */
import { findStockByTicker } from "@/lib/stocks/catalog";

import styles from "./_logos.module.css";

/* 7. 상수 — ticker → 도트 SVG 컴포넌트 매핑. */
const STOCK_LOGOS: Record<string, IconComponent> = {
  TWS: IconStockTws,
  STM: IconStockStm,
  SSR: IconStockSsr,
  MSF: IconStockMsf,
  VFP: IconStockVfp,
  BPE: IconStockBpe,
  ART: IconStockArt,
  GN3: IconStockGn3,
  SPZ: IconStockSpz,
};

export function getStockLogo(ticker: string): IconComponent | null {
  return STOCK_LOGOS[ticker] ?? null;
}

/* 8. Type / Props */

type LogoSize = "sm" | "md" | "lg";

interface StockLogoProps extends Omit<ComponentProps<"span">, "color"> {
  ticker: string;
  size?: LogoSize;
}

/**
 * 종목 로고 — brand color 동그라미 + 흰색 도트 mark.
 *
 * ticker 가 catalog 에 없거나 로고 매핑이 없으면 null 렌더 (placeholder 미노출).
 */
export function StockLogo({
  ticker,
  size = "md",
  className,
  ...rest
}: StockLogoProps) {
  const logoComponent = getStockLogo(ticker);
  const item = findStockByTicker(ticker);
  if (!logoComponent || !item) return null;

  const sizeMod =
    size === "sm"
      ? styles["logoCircle--sm"]
      : size === "lg"
        ? styles["logoCircle--lg"]
        : styles["logoCircle--md"];

  // createElement 로 직접 호출 — render 함수 내부에서 컴포넌트 변수 선언 시
  // react-hooks/static-components 가 경고 (state 초기화 위험). 매핑 객체에서
  // 가져온 stable reference 이므로 createElement 호출로 우회.
  return (
    <span
      {...rest}
      className={[styles.logoCircle, sizeMod, className]
        .filter(Boolean)
        .join(" ")}
      style={{ background: item.color, ...rest.style }}
      aria-hidden="true"
    >
      {createElement(logoComponent)}
    </span>
  );
}
