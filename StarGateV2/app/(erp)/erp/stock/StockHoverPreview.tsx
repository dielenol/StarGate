"use client";

/**
 * 종목 hover 미리보기 (`/erp/stock` 가운데 영역).
 *
 * 좌측 list 의 행을 0.5초 hover 하면 표시되는 미니 프리뷰. 헤더(이름/티커/가격/변동),
 * 미니 area chart, eventText 카드("왜 올랐을까") 스택.
 *
 * 데이터 소스:
 *  - 시세/sparkline 은 부모(`StockListClient`)가 이미 fetch 한 캐시를 사용 — props 로 전달.
 *  - 별도 fetch 없음. ticker null 이면 placeholder 만.
 *
 * 모바일은 hover 인터랙션 자체가 없어 자연 비활성 (부모가 ticker null 유지).
 */

import StockSparkline from "./StockSparkline";
import { StockLogo } from "./_logos";
import {
  ARROW,
  priceDirection,
  type Direction,
} from "./_helpers";

import type {
  StockPriceItem,
  StockSparklinePoint,
} from "@/hooks/queries/useStocksQuery";

import styles from "./StockHoverPreview.module.css";

/* ── 도트풍 SVG 아이콘 — 16x16 그리드, crispEdges. ── */

/**
 * direction 별 도트 화살표 아이콘 — eventHead 좌측 마커.
 * up=상승(상단 화살촉), down=하락(하단 화살촉), flat=점선.
 * 색은 부모 컨테이너의 --eventHead 변수 (preview__event--up/--down/--flat) 에 의존.
 */
function TrendDotIcon({ direction }: { direction: Direction }) {
  if (direction === "up") {
    return (
      <svg
        width={18}
        height={18}
        viewBox="0 0 16 16"
        shapeRendering="crispEdges"
        aria-hidden
      >
        <rect x={7} y={2} width={2} height={2} fill="currentColor" />
        <rect x={5} y={4} width={6} height={2} fill="currentColor" />
        <rect x={3} y={6} width={10} height={2} fill="currentColor" />
        <rect x={6} y={8} width={4} height={6} fill="currentColor" />
      </svg>
    );
  }
  if (direction === "down") {
    return (
      <svg
        width={18}
        height={18}
        viewBox="0 0 16 16"
        shapeRendering="crispEdges"
        aria-hidden
      >
        <rect x={6} y={2} width={4} height={6} fill="currentColor" />
        <rect x={3} y={8} width={10} height={2} fill="currentColor" />
        <rect x={5} y={10} width={6} height={2} fill="currentColor" />
        <rect x={7} y={12} width={2} height={2} fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      aria-hidden
    >
      <rect x={3} y={7} width={3} height={2} fill="currentColor" />
      <rect x={7} y={7} width={2} height={2} fill="currentColor" />
      <rect x={10} y={7} width={3} height={2} fill="currentColor" />
    </svg>
  );
}

/**
 * eventBody 좌측 마커 — 신문/메모 도트 아이콘.
 * 가로 줄 4개 + 외곽으로 "기사 내용" 메타포.
 */
function MemoDotIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      aria-hidden
    >
      {/* 외곽 */}
      <rect x={3} y={2} width={10} height={12} fill="var(--gold-dim)" />
      <rect x={4} y={3} width={8} height={10} fill="var(--bg-1)" />
      {/* 텍스트 줄 */}
      <rect x={5} y={4} width={6} height={1} fill="var(--gold-dim)" />
      <rect x={5} y={6} width={5} height={1} fill="var(--ink-3)" />
      <rect x={5} y={8} width={6} height={1} fill="var(--ink-3)" />
      <rect x={5} y={10} width={4} height={1} fill="var(--ink-3)" />
    </svg>
  );
}

/** direction 별 eventHead 라벨. */
function eventHeadLabel(direction: Direction): string {
  if (direction === "up") return "왜 올랐을까";
  if (direction === "down") return "왜 떨어졌을까";
  return "최근 동향";
}

interface Props {
  /** hover 된 종목 시세. null 이면 placeholder. */
  priceItem: StockPriceItem | null;
  /** 해당 종목의 sparkline 시계열. 없으면 차트 placeholder. */
  sparklinePoints: StockSparklinePoint[];
}

export default function StockHoverPreview({ priceItem, sparklinePoints }: Props) {
  if (!priceItem) {
    return (
      <div className={styles.preview}>
        <div className={styles.placeholder}>
          <div className={styles.placeholder__title}>종목 호버 미리보기</div>
          <div className={styles.placeholder__hint}>
            좌측 종목 위에 마우스를 0.5초 머무르면
            <br />
            가격·차트·이벤트 요약이 표시됩니다.
          </div>
          <div className={styles.placeholder__hintMuted}>
            클릭 시 매수 페이지로 이동
          </div>
        </div>
      </div>
    );
  }

  const direction: Direction = priceDirection(
    priceItem.price,
    priceItem.prevPrice,
  );
  const changeMod =
    direction === "up"
      ? styles["preview__change--up"]
      : direction === "down"
        ? styles["preview__change--down"]
        : "";

  return (
    <div className={styles.preview}>
      {/* 헤더 — 로고 / ticker / name / 큰 가격 / 변동 칩 */}
      <div className={styles.preview__head}>
        <StockLogo
          ticker={priceItem.ticker}
          size="lg"
          className={styles.preview__logo}
        />
        <div className={styles.preview__headLeft}>
          <span className={styles.preview__ticker}>{priceItem.ticker}</span>
          <span className={styles.preview__name}>{priceItem.name}</span>
        </div>
      </div>
      <div className={styles.preview__priceRow}>
        <span className={styles.preview__price}>
          ¤ {priceItem.price.toLocaleString()}
        </span>
        <span
          className={[styles.preview__change, changeMod]
            .filter(Boolean)
            .join(" ")}
        >
          {ARROW[direction]} {priceItem.changePercent.toFixed(2)}%
        </span>
      </div>

      {/* 미니 차트 (sparkline 캐시 재사용) */}
      <div className={styles.preview__chart}>
        <StockSparkline
          points={sparklinePoints}
          direction={direction}
          height={200}
        />
      </div>

      {/* direction 별 라벨 (올랐/떨어졌/동향) + eventText. 도트 마커 좌측 첨부. */}
      <div
        className={[
          styles.preview__event,
          direction === "up"
            ? styles["preview__event--up"]
            : direction === "down"
              ? styles["preview__event--down"]
              : styles["preview__event--flat"],
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className={styles.preview__eventHead}>
          <span className={styles.preview__eventHeadIcon}>
            <TrendDotIcon direction={direction} />
          </span>
          {eventHeadLabel(direction)}
        </div>
        <div className={styles.preview__eventBody}>
          <span className={styles.preview__eventBodyIcon}>
            <MemoDotIcon />
          </span>
          <span>
            {priceItem.eventText || "최근 이벤트가 기록되지 않았습니다."}
          </span>
        </div>
      </div>

      {/* 종목 설명 */}
      {priceItem.description ? (
        <div className={styles.preview__description}>
          {priceItem.description}
        </div>
      ) : null}

      <div className={styles.preview__cta}>클릭하면 매수 페이지로 이동</div>
    </div>
  );
}
