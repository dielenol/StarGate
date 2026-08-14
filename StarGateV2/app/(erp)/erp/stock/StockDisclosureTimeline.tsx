"use client";

import { useStockDisclosures } from "@/hooks/queries/useStockDisclosuresQuery";

import styles from "./page.module.css";

type DisclosureItem = {
  id: string;
  status: "DRAFT" | "SCHEDULED" | "PUBLISHED" | "CANCELLED";
  kind?: "INFO" | "PRICE";
  scope: "MARKET" | "TICKERS";
  tickers: string[];
  publishAt: string;
  headline?: string;
  body?: string;
  effects?: Array<{
    scope: "MARKET" | "TICKER";
    ticker?: string;
    changePercent?: number;
    structural: boolean;
  }>;
};

const KST_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function formatAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : KST_FORMATTER.format(date);
}

function targetLabel(item: DisclosureItem): string {
  return item.scope === "MARKET" ? "시장 전체" : item.tickers.join(" · ");
}

function effectLabel(effect: NonNullable<DisclosureItem["effects"]>[number]) {
  const target = effect.scope === "MARKET" ? "시장" : effect.ticker;
  const rate = typeof effect.changePercent === "number"
    ? ` ${effect.changePercent > 0 ? "+" : ""}${effect.changePercent.toFixed(2)}%`
    : "";
  return `${target ?? "종목"}${rate} · ${effect.structural ? "구조적" : "일회성"}`;
}

interface Props { ticker?: string; limit?: number; }

export default function StockDisclosureTimeline({ ticker, limit = 8 }: Props) {
  const query = useStockDisclosures();
  const items = (query.data?.items ?? []) as DisclosureItem[];
  const visibleItems = items
    .filter((item) => !ticker || item.scope === "MARKET" || item.tickers.includes(ticker))
    .slice(0, limit);

  return (
    <section className={styles.disclosureTimeline} aria-labelledby="stock-disclosure-title">
      <div className={styles.disclosureTimeline__head}>
        <div>
          <span>DISCLOSURE CENTER</span>
          <h2 id="stock-disclosure-title">공시 타임라인</h2>
        </div>
          <span>{visibleItems.length}건</span>
      </div>
      {query.isPending ? (
        <div className={styles.disclosureTimeline__empty}>공시를 불러오는 중입니다.</div>
      ) : query.isError ? (
        <div className={styles.disclosureTimeline__error} role="alert">
          공시를 불러오지 못했습니다. 잠시 후 다시 확인하세요.
        </div>
      ) : visibleItems.length === 0 ? (
        <div className={styles.disclosureTimeline__empty}>예정되거나 공개된 공시가 없습니다.</div>
      ) : (
        <ol className={styles.disclosureTimeline__list}>
          {visibleItems.map((item) => {
            const isPublished = item.status === "PUBLISHED";
            return (
              <li key={item.id} className={styles.disclosureTimeline__item}>
                <div className={styles.disclosureTimeline__meta}>
                  <span>{formatAt(item.publishAt)}</span>
                  <strong>{isPublished ? "공개" : "예정"}</strong>
                </div>
                <div className={styles.disclosureTimeline__target}>{targetLabel(item)}</div>
                {isPublished ? (
                  <>
                    <strong className={styles.disclosureTimeline__headline}>
                      {item.headline ?? "운영 공시"}
                    </strong>
                    {item.body ? <p>{item.body}</p> : null}
                    {item.effects?.length ? (
                      <ul className={styles.disclosureTimeline__effects}>
                        {item.effects.map((effect, index) => (
                          <li key={`${item.id}-${index}`}>{effectLabel(effect)}</li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                ) : (
                  <p className={styles.disclosureTimeline__teaser}>
                    공개 전에는 방향·본문·변동폭이 공개되지 않습니다.
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
