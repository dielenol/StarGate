"use client";

/**
 * 종목 로고 매핑 — ticker → public asset.
 *
 * `lib/stocks/catalog.ts` 는 server-safe (React import 금지) 라 별도로 분리하고,
 * 실제 회사 로고 asset 은 `public/assets/stocks/*-logo.webp` 에 둔다.
 *
 * 사용처:
 *  - list view (StockListClient) row 좌측 logoCircle--md
 *  - rail mini list (StockListClient / StockTradeClient) logoCircle--sm
 *  - hover preview (StockHoverPreview) 헤더 logoCircle--lg
 *  - 매수 페이지 hero (StockTradeClient) logoCircle--lg
 */

/* 1. 코어 라이브러리, 기타 라이브러리 */
import type { ComponentProps, CSSProperties } from "react";
import Image from "next/image";

/* 4-1. 유틸 / 상수 / asset */
import { findStockByTicker } from "@/lib/stocks/catalog";

import styles from "./_logos.module.css";

/* 7. 상수 — ticker → 실제 회사 로고 asset 매핑. */
const STOCK_LOGOS: Record<string, string> = {
  TWS: "/assets/stocks/tws-logo.webp",
  STM: "/assets/stocks/stm-logo.webp",
  SSR: "/assets/stocks/ssr-logo.webp",
  MSF: "/assets/stocks/msf-logo.webp",
  VFP: "/assets/stocks/vfp-logo.webp",
  BPE: "/assets/stocks/bpe-logo.webp",
  ART: "/assets/stocks/art-logo.webp",
  GN3: "/assets/stocks/gn3-logo.webp",
  SPZ: "/assets/stocks/spz-logo.webp",
};

export function getStockLogo(ticker: string): string | null {
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
  const logoSrc = getStockLogo(ticker);
  const item = findStockByTicker(ticker);
  if (!logoSrc || !item) return null;

  const sizeMod =
    size === "sm"
      ? styles["logoCircle--sm"]
      : size === "lg"
        ? styles["logoCircle--lg"]
        : styles["logoCircle--md"];
  const imageSizes = size === "sm" ? "20px" : size === "lg" ? "56px" : "36px";

  // createElement 로 직접 호출 — render 함수 내부에서 컴포넌트 변수 선언 시
  // react-hooks/static-components 가 경고 (state 초기화 위험). 매핑 객체에서
  // 가져온 stable reference 이므로 createElement 호출로 우회.
  return (
    <span
      {...rest}
      className={[styles.logoCircle, sizeMod, className]
        .filter(Boolean)
        .join(" ")}
      style={
        {
          "--stock-logo-accent": item.color,
          ...rest.style,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <Image
        className={styles.logoCircle__image}
        src={logoSrc}
        alt=""
        fill
        sizes={imageSizes}
      />
    </span>
  );
}
