import type { StockMarketIndexSnapshot } from "@/lib/stocks/market-index";
import { formatIndexValue } from "@/lib/stocks/market-index";

import { ARROW, priceDirection } from "./_helpers";
import styles from "./page.module.css";

interface Props {
  marketIndex: StockMarketIndexSnapshot;
}

function formatSignedPercent(value: number): string {
  if (Math.abs(value) < 0.005) return "0.00%";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export default function StockIndexBanner({ marketIndex }: Props) {
  const direction = priceDirection(marketIndex.value, marketIndex.prevValue);
  const directionClass =
    direction === "up"
      ? styles["stockIndexBanner__delta--up"]
      : direction === "down"
        ? styles["stockIndexBanner__delta--down"]
        : "";
  return (
    <section className={styles.stockIndexBanner} aria-label={marketIndex.name}>
      <div className={styles.stockIndexBanner__main}>
        <span className={styles.stockIndexBanner__label}>{marketIndex.name}</span>
        <strong className={styles.stockIndexBanner__value}>
          {marketIndex.code} {formatIndexValue(marketIndex.value)}
        </strong>
        <span
          className={[styles.stockIndexBanner__delta, directionClass]
            .filter(Boolean)
            .join(" ")}
        >
          {direction === "flat" ? "·" : ARROW[direction]}{" "}
          {formatSignedPercent(marketIndex.changePercent)}
        </span>
      </div>
    </section>
  );
}
