"use client";

import { useMemo, useState } from "react";

import PageHead from "@/components/ui/PageHead/PageHead";
import {
  type RunScheduledStockTickResponse,
  useRunScheduledStockTick,
  useUpdateStockPrice,
} from "@/hooks/mutations/useStocksMutation";
import {
  type StockAdminHoldingsResponse,
  type StockMarketWireResponse,
  type StockPricesResponse,
  useStockAdminHoldings,
  useStockMarketWire,
  useStockPrices,
} from "@/hooks/queries/useStocksQuery";
import { buildStockMarketIndexSnapshot } from "@/lib/stocks/market-index";
import { formatDate } from "@/lib/format/date";
import {
  MIN_STOCK_PRICE,
  formatStockValue,
  roundStockValue,
} from "@/lib/stocks/pricing";

import MarketWirePanel from "../../stock/MarketWirePanel";
import { ARROW, priceDirection } from "../../stock/_helpers";
import { StockLogo } from "../../stock/_logos";
import styles from "./page.module.css";

const QUICK_PRICE_MOVES = [-25, -10, -5, 5, 10, 25] as const;

const EVENT_TEMPLATES = [
  "분기 실적 개선 공시",
  "대형 계약 체결 루머",
  "공급망 차질 관측",
  "정기 변동 처리",
  "운영진 특별 공시",
] as const;

interface Props {
  initialPrices: StockPricesResponse;
  initialMarketWire: StockMarketWireResponse;
  initialHoldings: StockAdminHoldingsResponse;
}

export default function StockAdminClient({
  initialPrices,
  initialMarketWire,
  initialHoldings,
}: Props) {
  const pricesQuery = useStockPrices({ initialData: initialPrices });
  const holdingsQuery = useStockAdminHoldings({ initialData: initialHoldings });
  const marketWireQuery = useStockMarketWire({
    initialData: initialMarketWire,
    days: 14,
    limit: 20,
  });
  const prices = pricesQuery.data ?? initialPrices;
  const holdings = holdingsQuery.data ?? initialHoldings;
  const marketWire = marketWireQuery.data ?? initialMarketWire;
  const marketIndex = useMemo(() => {
    return buildStockMarketIndexSnapshot(prices.items);
  }, [prices.items]);
  const [selectedTicker, setSelectedTicker] = useState(
    initialPrices.items[0]?.ticker ?? "",
  );
  const selected = useMemo(
    () => prices.items.find((item) => item.ticker === selectedTicker),
    [prices.items, selectedTicker],
  );
  const [priceInput, setPriceInput] = useState(
    selected ? String(selected.price) : "",
  );
  const [eventText, setEventText] = useState("GM 시세 조정");
  const [holdingQuery, setHoldingQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useUpdateStockPrice();
  const tickMutation = useRunScheduledStockTick();

  const pricePreview = useMemo(() => {
    if (!selected) return null;
    const nextPrice = Number.parseFloat(priceInput);
    if (!Number.isFinite(nextPrice) || nextPrice <= 0) return null;
    const direction = priceDirection(nextPrice, selected.price);
    const changePercent =
      selected.price > 0
        ? ((nextPrice - selected.price) / selected.price) * 100
        : 0;
    const absChange = Math.abs(changePercent);
    const risk =
      absChange >= 25 ? "급등락" : absChange >= 10 ? "주의" : "통상";
    return { nextPrice, direction, changePercent, risk };
  }, [priceInput, selected]);

  const holdingSummary = useMemo(() => {
    const holderIds = new Set(holdings.rows.map((row) => row.characterId));
    const totalShares = holdings.rows.reduce((sum, row) => sum + row.shares, 0);
    const totalEvaluation = holdings.rows.reduce(
      (sum, row) => sum + row.evaluation,
      0,
    );
    return {
      holderCount: holderIds.size,
      rowCount: holdings.rows.length,
      totalShares,
      totalEvaluation: roundStockValue(totalEvaluation),
    };
  }, [holdings.rows]);

  const filteredHoldings = useMemo(() => {
    const query = holdingQuery.trim().toLowerCase();
    const rows = query
      ? holdings.rows.filter((row) => {
          return (
            row.characterCodename.toLowerCase().includes(query) ||
            row.ownerName?.toLowerCase().includes(query) ||
            row.ticker.toLowerCase().includes(query) ||
            row.stockName.toLowerCase().includes(query)
          );
        })
      : holdings.rows;
    return [...rows].sort((a, b) => {
      if (b.evaluation !== a.evaluation) return b.evaluation - a.evaluation;
      if (a.ticker !== b.ticker) return a.ticker.localeCompare(b.ticker);
      return a.characterCodename.localeCompare(b.characterCodename);
    });
  }, [holdingQuery, holdings.rows]);

  function handleUpdateSuccess() {
    setError(null);
    setMessage("주가가 갱신되었습니다.");
  }

  function handleMutationError(err: unknown, fallback: string) {
    setMessage(null);
    setError(err instanceof Error ? err.message : fallback);
  }

  function handleTickSuccess(summary: RunScheduledStockTickResponse) {
    const updated = summary.results.filter((r) => r.status === "updated").length;
    const initialized = summary.results.filter(
      (r) => r.status === "initialized",
    ).length;
    const skipped = summary.results.filter((r) => r.status === "skipped").length;
    const scenario = summary.results.filter(
      (r) => r.eventTier === "scenario",
    ).length;
    const shock = summary.results.filter((r) => r.eventTier === "shock").length;
    setError(null);
    setMessage(
      `정기 변동 완료 · 변경 ${updated} / 초기화 ${initialized} / 스킵 ${skipped} · 이벤트 ${scenario} / 급등락 ${shock}`,
    );
  }

  function handleSelect(ticker: string) {
    const next = prices.items.find((item) => item.ticker === ticker);
    setSelectedTicker(ticker);
    setPriceInput(next ? String(next.price) : "");
    setMessage(null);
    setError(null);
  }

  function applyPercentMove(percent: number) {
    if (!selected) return;
    const nextPrice = Math.max(
      MIN_STOCK_PRICE,
      roundStockValue(selected.price * (1 + percent / 100)),
    );
    setPriceInput(String(nextPrice));
    setMessage(null);
    setError(null);
  }

  function applyEventTemplate(template: string) {
    setEventText(template);
    setMessage(null);
    setError(null);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const price = Number.parseFloat(priceInput);
    mutation.mutate(
      {
        ticker: selectedTicker,
        price,
        eventText,
      },
      {
        onSuccess: handleUpdateSuccess,
        onError: (err) => handleMutationError(err, "주가 변경에 실패했습니다."),
      },
    );
  }

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "관리", href: "/erp/admin/credits" },
          { label: "주식 운영" },
        ]}
        title="주식 운영"
      />

      <div className={styles.layout}>
        <section className={styles.panel}>
          <div className={styles.panel__head}>
            <span>종목 시세</span>
            <span>{prices.items.length} 종</span>
          </div>
          <div className={styles.priceList}>
            {prices.items.map((item) => {
              const direction = priceDirection(item.price, item.prevPrice);
              return (
                <button
                  type="button"
                  key={item.ticker}
                  className={[
                    styles.priceRow,
                    selectedTicker === item.ticker ? styles["priceRow--active"] : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => handleSelect(item.ticker)}
                >
                  <span className={styles.priceRow__name}>
                    <StockLogo ticker={item.ticker} size="sm" />
                    <span>
                      <strong>{item.ticker}</strong>
                      <span>{item.name}</span>
                    </span>
                  </span>
                  <span className={styles.priceRow__quote}>
                    ¤ {formatStockValue(item.price)}
                    <small>{ARROW[direction]} {item.changePercent.toFixed(2)}%</small>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panel__head}>
            <span>시세 조정</span>
            <span>{selectedTicker}</span>
          </div>
          <div className={styles.actionRow}>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() =>
                tickMutation.mutate(false, {
                  onSuccess: handleTickSuccess,
                  onError: (err) =>
                    handleMutationError(err, "정기 변동 실행에 실패했습니다."),
                })
              }
              disabled={tickMutation.isPending || mutation.isPending}
            >
              {tickMutation.isPending ? "실행 중..." : "오늘 정기 변동 실행"}
            </button>
            <button
              type="button"
              className={styles.ghostBtn}
              onClick={() =>
                tickMutation.mutate(true, {
                  onSuccess: handleTickSuccess,
                  onError: (err) =>
                    handleMutationError(err, "정기 변동 실행에 실패했습니다."),
                })
              }
              disabled={tickMutation.isPending || mutation.isPending}
            >
              강제 재실행
            </button>
          </div>
          <div className={styles.scheduleNote}>
            <span>정기 크론</span>
            <strong>매일 12:00 KST</strong>
            <span>현재 Vercel cron은 하루 1회만 실행됩니다.</span>
          </div>
          {selected ? (
            <form className={styles.form} onSubmit={handleSubmit}>
              <label className={styles.field}>
                <span>종목</span>
                <div className={styles.readonly}>
                  {selected.name} ({selected.ticker})
                </div>
              </label>
              <label className={styles.field}>
                <span>변경 가격</span>
                <input
                  type="number"
                  min={MIN_STOCK_PRICE}
                  step={0.01}
                  value={priceInput}
                  onChange={(e) => {
                    const next = e.target.value
                      .replace(/[^\d.]/g, "")
                      .replace(/(\..*)\./g, "$1");
                    if (/^\d*(?:\.\d{0,2})?$/.test(next)) {
                      setPriceInput(next);
                    }
                  }}
                />
              </label>
              <div className={styles.quickMoves} aria-label="빠른 가격 조정">
                {QUICK_PRICE_MOVES.map((percent) => (
                  <button
                    key={percent}
                    type="button"
                    onClick={() => applyPercentMove(percent)}
                    className={
                      percent < 0
                        ? styles["quickMoves__button--down"]
                        : styles["quickMoves__button--up"]
                    }
                  >
                    {percent > 0 ? "+" : ""}
                    {percent}%
                  </button>
                ))}
              </div>
              <label className={styles.field}>
                <span>이벤트 문구</span>
                <input
                  type="text"
                  maxLength={80}
                  value={eventText}
                  onChange={(e) => setEventText(e.target.value)}
                  placeholder="예: 기업 실적 발표"
                />
              </label>
              <div className={styles.templateRow} aria-label="공시 문구 템플릿">
                {EVENT_TEMPLATES.map((template) => (
                  <button
                    key={template}
                    type="button"
                    onClick={() => applyEventTemplate(template)}
                  >
                    {template}
                  </button>
                ))}
              </div>
              <div className={styles.summary}>
                <span>현재가</span>
                <strong>¤ {formatStockValue(selected.price)}</strong>
                <span>변경 후</span>
                <strong>
                  {pricePreview
                    ? `¤ ${formatStockValue(pricePreview.nextPrice)} · ${
                        pricePreview.direction === "flat"
                          ? "0.00%"
                          : `${ARROW[pricePreview.direction]} ${pricePreview.changePercent.toFixed(2)}%`
                      }`
                    : "입력 대기"}
                </strong>
                <span>변동 판정</span>
                <strong>{pricePreview?.risk ?? "입력 대기"}</strong>
                <span>공시 길이</span>
                <strong>{eventText.trim().length}/80</strong>
                <span>최근 이벤트</span>
                <strong>{selected.eventText || "미등록"}</strong>
              </div>
              {message ? <div className={styles.message}>{message}</div> : null}
              {error ? <div className={styles.error}>{error}</div> : null}
              <button
                type="submit"
                className={styles.submit}
                disabled={mutation.isPending || !selectedTicker}
              >
                {mutation.isPending ? "변경 중..." : "주가 변경"}
              </button>
            </form>
          ) : (
            <div className={styles.empty}>조정할 종목이 없습니다.</div>
          )}
        </section>

        <section className={[styles.panel, styles.holdingsPanel].join(" ")}>
          <div className={styles.panel__head}>
            <span>보유 현황</span>
            <span>
              보유자 {holdingSummary.holderCount}명 · 항목 {holdingSummary.rowCount}건
            </span>
          </div>
          <div className={styles.holdingSummary}>
            <span>
              평가액 <strong>¤ {formatStockValue(holdingSummary.totalEvaluation)}</strong>
            </span>
            <span>
              총 수량 <strong>{holdingSummary.totalShares.toLocaleString()}주</strong>
            </span>
            <span>
              갱신 <strong>{formatDate(new Date(holdings.generatedAt))}</strong>
            </span>
          </div>
          <input
            type="search"
            className={styles.holdingSearch}
            value={holdingQuery}
            onChange={(e) => setHoldingQuery(e.target.value)}
            placeholder="코드네임 · 소유자 · 티커 · 종목명 검색"
          />
          {filteredHoldings.length === 0 ? (
            <div className={styles.empty}>
              {holdings.rows.length === 0
                ? "보유 중인 주식이 없습니다."
                : "검색 결과가 없습니다."}
            </div>
          ) : (
            <div className={styles.holdingTableWrap}>
              <table className={styles.holdingTable}>
                <thead>
                  <tr>
                    <th>보유자</th>
                    <th>종목</th>
                    <th className={styles.numCol}>수량</th>
                    <th className={styles.numCol}>평단</th>
                    <th className={styles.numCol}>현재가</th>
                    <th className={styles.numCol}>평가액</th>
                    <th className={styles.numCol}>손익</th>
                    <th className={styles.dateCol}>갱신</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHoldings.map((row) => {
                    const profitClass =
                      row.profitLoss > 0
                        ? styles["holdingTable__profit--up"]
                        : row.profitLoss < 0
                          ? styles["holdingTable__profit--down"]
                          : "";
                    return (
                      <tr key={`${row.characterId}-${row.ticker}`}>
                        <td>
                          <span className={styles.holdingTable__owner}>
                            <strong>{row.characterCodename}</strong>
                            <span>{row.ownerName ?? "owner 미연결"}</span>
                          </span>
                        </td>
                        <td>
                          <span className={styles.holdingTable__stock}>
                            <StockLogo ticker={row.ticker} size="sm" />
                            <span>
                              <strong>{row.ticker}</strong>
                              <span>{row.stockName}</span>
                            </span>
                          </span>
                        </td>
                        <td className={styles.numCol}>
                          {row.shares.toLocaleString()}주
                        </td>
                        <td className={styles.numCol}>
                          ¤ {formatStockValue(row.avgPrice)}
                        </td>
                        <td className={styles.numCol}>
                          ¤ {formatStockValue(row.currentPrice)}
                        </td>
                        <td className={styles.numCol}>
                          ¤ {formatStockValue(row.evaluation)}
                        </td>
                        <td
                          className={[styles.numCol, profitClass]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {row.profitLoss > 0 ? "+" : ""}
                          {formatStockValue(row.profitLoss)} (
                          {row.profitPercent > 0 ? "+" : ""}
                          {row.profitPercent.toFixed(2)}%)
                        </td>
                        <td className={styles.dateCol}>
                          {formatDate(new Date(row.updatedAt))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className={styles.wirePanel}>
          <MarketWirePanel
            items={marketWire.items}
            marketIndex={marketIndex}
            title="최근 시장 공시"
          />
        </div>
      </div>
    </>
  );
}
