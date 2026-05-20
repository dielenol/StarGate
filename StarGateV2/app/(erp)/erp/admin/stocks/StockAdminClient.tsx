"use client";

import { useMemo, useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import PageHead from "@/components/ui/PageHead/PageHead";
import {
  stocksKeys,
  type StockPricesResponse,
  useStockPrices,
} from "@/hooks/queries/useStocksQuery";

import { ARROW, priceDirection } from "../../stock/_helpers";
import { StockLogo } from "../../stock/_logos";
import styles from "./page.module.css";

interface Props {
  initialPrices: StockPricesResponse;
}

interface UpdateInput {
  ticker: string;
  price: number;
  eventText: string;
}

async function updateStockPrice(input: UpdateInput) {
  const res = await fetch("/api/erp/admin/stocks/prices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "주가 변경에 실패했습니다.");
  }
  return res.json();
}

async function runScheduledTick(force: boolean) {
  const res = await fetch("/api/erp/admin/stocks/tick", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "정기 변동 실행에 실패했습니다.");
  }
  return res.json() as Promise<{
    results: Array<{
      status: "updated" | "initialized" | "skipped";
      eventTier: "routine" | "scenario" | "shock";
    }>;
  }>;
}

export default function StockAdminClient({ initialPrices }: Props) {
  const queryClient = useQueryClient();
  const pricesQuery = useStockPrices({ initialData: initialPrices });
  const prices = pricesQuery.data ?? initialPrices;
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
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: updateStockPrice,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: stocksKeys.prices }),
        queryClient.invalidateQueries({ queryKey: stocksKeys.holdings }),
        queryClient.invalidateQueries({ queryKey: stocksKeys.all }),
      ]);
      setError(null);
      setMessage("주가가 갱신되었습니다.");
    },
    onError: (err) => {
      setMessage(null);
      setError(err instanceof Error ? err.message : "주가 변경에 실패했습니다.");
    },
  });

  const tickMutation = useMutation({
    mutationFn: runScheduledTick,
    onSuccess: async (summary) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: stocksKeys.prices }),
        queryClient.invalidateQueries({ queryKey: stocksKeys.holdings }),
        queryClient.invalidateQueries({ queryKey: stocksKeys.all }),
      ]);
      const updated = summary.results.filter((r) => r.status === "updated").length;
      const initialized = summary.results.filter(
        (r) => r.status === "initialized",
      ).length;
      const skipped = summary.results.filter((r) => r.status === "skipped").length;
      const scenario = summary.results.filter((r) => r.eventTier === "scenario").length;
      const shock = summary.results.filter((r) => r.eventTier === "shock").length;
      setError(null);
      setMessage(
        `정기 변동 완료 · 변경 ${updated} / 초기화 ${initialized} / 스킵 ${skipped} · 이벤트 ${scenario} / 급등락 ${shock}`,
      );
    },
    onError: (err) => {
      setMessage(null);
      setError(
        err instanceof Error ? err.message : "정기 변동 실행에 실패했습니다.",
      );
    },
  });

  function handleSelect(ticker: string) {
    const next = prices.items.find((item) => item.ticker === ticker);
    setSelectedTicker(ticker);
    setPriceInput(next ? String(next.price) : "");
    setMessage(null);
    setError(null);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const price = Number.parseInt(priceInput, 10);
    mutation.mutate({
      ticker: selectedTicker,
      price,
      eventText,
    });
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
                    ¤ {item.price.toLocaleString()}
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
              onClick={() => tickMutation.mutate(false)}
              disabled={tickMutation.isPending || mutation.isPending}
            >
              {tickMutation.isPending ? "실행 중..." : "오늘 정기 변동 실행"}
            </button>
            <button
              type="button"
              className={styles.ghostBtn}
              onClick={() => tickMutation.mutate(true)}
              disabled={tickMutation.isPending || mutation.isPending}
            >
              강제 재실행
            </button>
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
                  min={1}
                  step={1}
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value.replace(/[^0-9]/g, ""))}
                />
              </label>
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
              <div className={styles.summary}>
                <span>현재가</span>
                <strong>¤ {selected.price.toLocaleString()}</strong>
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
      </div>
    </>
  );
}
