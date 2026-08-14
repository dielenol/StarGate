"use client";

import { useStockSeasonLeaderboard } from "@/hooks/queries/useStockSeasonQuery";

import styles from "./page.module.css";

type LeaderboardItem = {
  rank: number;
  codename: string;
  returnPercent: number;
  badge?: string;
  title?: string;
};

function formatReturn(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function seasonStatusLabel(status: "SCHEDULED" | "ACTIVE" | "ENDED" | undefined) {
  if (status === "ACTIVE") return "진행 중";
  if (status === "ENDED") return "종료";
  return "시즌 대기";
}

export default function StockSeasonLeaderboard() {
  const query = useStockSeasonLeaderboard();
  const data = query.data;
  const items = (data?.items ?? []) as LeaderboardItem[];

  return (
    <section className={styles.seasonBoard} aria-labelledby="stock-season-title">
      <div className={styles.seasonBoard__head}>
        <div>
          <span>INVESTMENT SEASON</span>
          <h2 id="stock-season-title">시즌 순위</h2>
        </div>
        <strong>{seasonStatusLabel(data?.season?.status)}</strong>
      </div>
      {query.isPending ? (
        <div className={styles.seasonBoard__empty}>시즌 순위를 불러오는 중입니다.</div>
      ) : query.isError ? (
        <div className={styles.seasonBoard__error} role="alert">시즌 순위를 불러오지 못했습니다.</div>
      ) : !data?.season ? (
        <div className={styles.seasonBoard__empty}>현재 예정되거나 진행 중인 투자 시즌이 없습니다.</div>
      ) : items.length === 0 ? (
        <div className={styles.seasonBoard__empty}>아직 참가 조건을 충족한 AGENT가 없습니다.</div>
      ) : (
        <ol className={styles.seasonBoard__list}>
          {items.map((item) => (
            <li key={`${item.rank}-${item.codename}`}>
              <span>{item.rank}</span>
              <strong>{item.codename}</strong>
              <em className={item.returnPercent < 0 ? styles["seasonBoard__return--down"] : ""}>
                {formatReturn(item.returnPercent)}
              </em>
              {item.title || item.badge ? (
                <small>{item.title ?? item.badge}</small>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      {data?.mine ? (
        <p className={styles.seasonBoard__mine}>
          {data.mine.eligible
            ? `내 순위 ${data.mine.rank ?? "집계 중"}위 · ${typeof data.mine.returnPercent === "number" ? formatReturn(data.mine.returnPercent) : "수익률 집계 중"}`
            : `참가 현황 · ${data.mine.reason ?? "참가 조건 집계 중"}`}
        </p>
      ) : null}
    </section>
  );
}
