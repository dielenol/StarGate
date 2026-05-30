"use client";

/**
 * 토스 종목 정보 패널 — `/erp/stock/[ticker]` 매수 페이지 하단 섹션.
 *
 * 4개 sub-section:
 *  1. 회사 설명 박스
 *  2. KV 그리드 (시가총액 / EV / 기업명 / 대표이사 / 상장일 / 발행주식수)
 *  3. 매출 구성 도넛 + 우측 범례
 *  4. 주요 사업 카드 (2-col)
 *
 * recharts PieChart 는 dynamic({ ssr: false }) 로 분리해 번들 비용 회피
 * (same chunk 캐시 hit 기대 — 페이지 상단 AreaChart 와 동일 recharts).
 */

/* 1. 코어 라이브러리 */
import { useMemo } from "react";

import dynamic from "next/dynamic";

/* 4. 프로젝트 내부 컴포넌트 */
import { StockLogo } from "../_logos";

/* 4-1. 유틸 / 상수 */
import { findStockByTicker } from "@/lib/stocks/catalog";

import type { DonutSlice } from "./RevenueDonut";
import {
  deriveRevenueSliceColors,
  formatBillionToKor,
  getStockInfo,
} from "../_stockInfo";

import styles from "./StockInfoPanel.module.css";

/**
 * recharts PieChart 약 95KB(gzipped). 페이지 상단 AreaChart 와 동일 의존성이라
 * 동적 import 캐시 hit. ssr:false 로 hydration mismatch 회피.
 */
const RevenueDonut = dynamic(() => import("./RevenueDonut"), {
  ssr: false,
  loading: () => <div className={styles.infoPanel__donutChart} aria-hidden="true" />,
});

/* ── Props ── */

interface Props {
  ticker: string;
}

/* ── 컴포넌트 ── */

export default function StockInfoPanel({ ticker }: Props) {
  const info = getStockInfo(ticker);
  const meta = findStockByTicker(ticker);

  /* 11. 파생 — 도넛 슬라이스 색상 (brand color → HSL step). info 가 없으면 빈 배열. */
  const donutSlices: DonutSlice[] = useMemo(() => {
    if (!info || !meta) return [];
    const colors = deriveRevenueSliceColors(
      meta.color,
      info.revenueComposition.length,
    );
    return info.revenueComposition.map((slice, idx) => ({
      label: slice.label,
      ratio: slice.ratio,
      color: colors[idx] ?? meta.color,
    }));
  }, [info, meta]);

  if (!info || !meta) return null;

  // 시가총액 / EV — 10억 단위 입력 → 한글 단위 변환 ("12조 4,000억")
  const marketCapKor = formatBillionToKor(info.marketCapBillion);
  const enterpriseValueKor = formatBillionToKor(info.enterpriseValueBillion);
  const listingLabel =
    info.foundedYear === null ? "상장일" : `상장일 (설립 ${info.foundedYear})`;

  return (
    <section className={styles.infoPanel} aria-label="종목 정보">
      <header className={styles.infoPanel__head}>
        <span className={styles.infoPanel__title}>종목 정보</span>
        <span className={styles.infoPanel__subtitle}>
          {info.englishName}
        </span>
      </header>

      {/* 1. 회사 설명 박스 */}
      <p className={styles.infoPanel__description}>{info.description}</p>

      {/* 2. KV 그리드 — 6개 셀 (2-col, 모바일 1-col) */}
      <dl className={styles.infoPanel__kvGrid}>
        <div className={styles.infoPanel__kvCell}>
          <dt className={styles.infoPanel__kvLabel}>시가총액</dt>
          <dd className={styles.infoPanel__kvValueMono}>
            ¤ {marketCapKor} (크레딧)
          </dd>
        </div>
        <div className={styles.infoPanel__kvCell}>
          <dt className={styles.infoPanel__kvLabel}>실제 기업가치</dt>
          <dd className={styles.infoPanel__kvValueMono}>
            ¤ {enterpriseValueKor} (크레딧)
          </dd>
        </div>
        <div className={styles.infoPanel__kvCell}>
          <dt className={styles.infoPanel__kvLabel}>기업명 (영문)</dt>
          <dd className={styles.infoPanel__kvValue}>{info.englishName}</dd>
        </div>
        <div className={styles.infoPanel__kvCell}>
          <dt className={styles.infoPanel__kvLabel}>대표이사</dt>
          <dd className={styles.infoPanel__kvValue}>
            {info.ceos.join(" · ")}
          </dd>
        </div>
        <div className={styles.infoPanel__kvCell}>
          <dt className={styles.infoPanel__kvLabel}>{listingLabel}</dt>
          <dd className={styles.infoPanel__kvValue}>{info.ipoDate}</dd>
        </div>
        <div className={styles.infoPanel__kvCell}>
          <dt className={styles.infoPanel__kvLabel}>발행주식수</dt>
          <dd className={styles.infoPanel__kvValueMono}>
            {info.sharesOutstanding.toLocaleString()} 주
          </dd>
        </div>
      </dl>

      {/* 3. 매출 구성 — 도넛 + 범례 */}
      <div className={styles.infoPanel__section}>
        <h3 className={styles.infoPanel__sectionTitle}>매출 · 산업 구성</h3>
        <div className={styles.infoPanel__donutSection}>
          <RevenueDonut data={donutSlices} centerLabel="매출 구성" />
          <ul className={styles.infoPanel__donutLegend}>
            {donutSlices.map((slice) => (
              <li key={slice.label} className={styles.infoPanel__legendItem}>
                <span
                  className={styles.infoPanel__legendDot}
                  style={{ background: slice.color }}
                  aria-hidden="true"
                />
                <span className={styles.infoPanel__legendLabel}>
                  {slice.label}
                </span>
                <span className={styles.infoPanel__legendRatio}>
                  {slice.ratio}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 4. 주요 사업 카드 — 2-col grid. 좌측 brand color border + 로고 도트 */}
      <div className={styles.infoPanel__section}>
        <h3 className={styles.infoPanel__sectionTitle}>주요 사업</h3>
        <div className={styles.infoPanel__mainBusinesses}>
          {info.mainBusinesses.map((biz) => (
            <div
              key={biz.label}
              className={styles.infoPanel__bizCard}
              style={{ borderLeftColor: meta.color }}
            >
              <StockLogo
                ticker={ticker}
                size="sm"
                className={styles.infoPanel__bizDot}
              />
              <div className={styles.infoPanel__bizMeta}>
                <span className={styles.infoPanel__bizLabel}>
                  {biz.label}
                </span>
                <span className={styles.infoPanel__bizRank}>{biz.rank}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
