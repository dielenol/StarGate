"use client";

import Link from "next/link";

import LinkPendingProbe from "@/components/erp/NavPending/LinkPendingProbe";
import type { StockPriceItem } from "@/hooks/queries/useStocksQuery";
import { formatStockValue } from "@/lib/stocks/pricing";

import { ARROW, priceDirection } from "./_helpers";
import { StockLogo } from "./_logos";
import styles from "./page.module.css";

interface Props {
  items: StockPriceItem[];
}

export default function WatchlistRailCard({ items }: Props) {
  return (
    <div className={styles.railCard}>
      <div className={styles.railCard__head}>
        <span>관심 종목</span>
        <span className={styles.railCard__count}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className={styles.railCard__empty}>
          관심 종목 없음
          <div className={styles.railCard__emptyHint}>
            별 표시한 종목이 여기에 고정됩니다
          </div>
        </div>
      ) : (
        <ul className={styles.holdingMini}>
          {items.map((item) => {
            const direction = priceDirection(item.price, item.prevPrice);
            const changeMod =
              direction === "up"
                ? styles["holdingMini__profit--up"]
                : direction === "down"
                  ? styles["holdingMini__profit--down"]
                  : "";
            return (
              <li key={item.ticker} className={styles.holdingMini__item}>
                <Link
                  href={`/erp/stock/${encodeURIComponent(item.ticker)}`}
                  className={styles.holdingMini__link}
                >
                  <LinkPendingProbe />
                  <div className={styles.holdingMini__top}>
                    <span className={styles.holdingMini__tickerWrap}>
                      <StockLogo ticker={item.ticker} size="sm" />
                      <span className={styles.holdingMini__ticker}>
                        {item.ticker}
                      </span>
                    </span>
                    <span className={styles.holdingMini__eval}>
                      ¤ {formatStockValue(item.price)}
                    </span>
                  </div>
                  <div className={styles.holdingMini__bottom}>
                    <span className={styles.holdingMini__shares}>
                      {item.name}
                    </span>
                    <span
                      className={[styles.holdingMini__profit, changeMod]
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
  );
}
