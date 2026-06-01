"use client";

import Link from "next/link";

import LinkPendingProbe from "@/components/erp/NavPending/LinkPendingProbe";
import type { StockMarketWireItem } from "@/hooks/queries/useStocksQuery";
import { formatStockValue } from "@/lib/stocks/pricing";

import { ARROW, priceDirection } from "./_helpers";
import styles from "./page.module.css";

interface Props {
  items: StockMarketWireItem[];
  title?: string;
  compact?: boolean;
}

function sourceLabel(source: StockMarketWireItem["source"]): string {
  if (source === "gm-event") return "GM 공시";
  if (source === "trade") return "거래 반영";
  return "정기 공시";
}

function formatWireDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "--";
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function MarketWirePanel({
  items,
  title = "ORDO-NET 공시",
  compact = false,
}: Props) {
  return (
    <section
      className={[
        styles.marketWire,
        compact ? styles["marketWire--compact"] : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={title}
    >
      <div className={styles.marketWire__head}>
        <span>{title}</span>
        <span>{items.length} 건</span>
      </div>

      {items.length === 0 ? (
        <div className={styles.marketWire__empty}>
          최근 공시 기록이 없습니다.
        </div>
      ) : (
        <ul className={styles.marketWire__list}>
          {items.map((item) => {
            const direction = priceDirection(item.price, item.prevPrice);
            const directionMod =
              direction === "up"
                ? styles["marketWire__delta--up"]
                : direction === "down"
                  ? styles["marketWire__delta--down"]
                  : "";
            return (
              <li
                key={`${item.ticker}-${item.createdAt}-${item.price}`}
                className={styles.marketWire__item}
              >
                <div className={styles.marketWire__top}>
                  <Link
                    href={`/erp/stock/${encodeURIComponent(item.ticker)}`}
                    className={styles.marketWire__ticker}
                  >
                    <LinkPendingProbe />
                    {item.ticker}
                  </Link>
                  <span className={styles.marketWire__source}>
                    {sourceLabel(item.source)}
                  </span>
                  <span className={styles.marketWire__date}>
                    {formatWireDate(item.createdAt)}
                  </span>
                </div>
                <div className={styles.marketWire__body}>
                  {item.eventText || "공시 문구 미등록"}
                </div>
                <div className={styles.marketWire__meta}>
                  <span>{item.name}</span>
                  <span className={styles.marketWire__price}>
                    ¤ {formatStockValue(item.price)}
                  </span>
                  <span
                    className={[styles.marketWire__delta, directionMod]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {direction === "flat"
                      ? "0.00%"
                      : `${ARROW[direction]} ${item.changePercent.toFixed(2)}%`}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
